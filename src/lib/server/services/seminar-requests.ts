import { AppError } from "$lib/server/core/errors";
import { forgetUnreferencedAssets } from "./asset-cleanup";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { currentTerm } from "$lib/server/core/semester";
import { getTableFresh, mutate } from "$lib/server/data/tables";
import { removeStaged } from "$lib/server/data/storage";
import { callFlow, type FlowResult } from "$lib/server/data/flows";
import { promoteSeminarPoster } from "$lib/server/services/uploads";
import {
  SEMINAR_TIMING_OPTIONS,
  SeminarRequestSchema,
  type SeminarRequest,
} from "$lib/server/data/schemas";

/** Seminar proposal lifecycle (API-SPEC §5-1, §5-2, §7-2). */

/** 목록 밖의 선호 시점 값은 미선택으로 정규화 (닫힌 집합 강제). */
function normalizeTiming(value: string): string {
  return (SEMINAR_TIMING_OPTIONS as readonly string[]).includes(value)
    ? value
    : "";
}

/** Keep the uploaded source retryable until the database owns the final asset. */
async function saveWithPoster<T>(
  pendingKey: string,
  save: (posterKey: string) => Promise<T>,
): Promise<T> {
  const posterKey = await promoteSeminarPoster(pendingKey, {
    preserveStaging: true,
  });
  let result: T;
  try {
    result = await save(posterKey);
  } catch (error) {
    // Only a definite rejection proves that this operation will not commit.
    // After a transport failure the write can STILL be running; even a fresh
    // read could precede its commit. Retain the final copy in that case.
    if (
      error instanceof AppError &&
      [
        "NOT_FOUND",
        "FORBIDDEN",
        "CONFLICT",
        "VALIDATION_FAILED",
        "WRITE_CONFLICT",
      ].includes(error.code)
    ) {
      await forgetUnreferencedAssets([posterKey]);
    }
    throw error;
  }
  if (posterKey) {
    try {
      await removeStaged([pendingKey.trim()]);
    } catch (error) {
      // Saving succeeded. The maintenance job can reap this retry source.
      console.error("[seminar-request] staged poster cleanup failed:", error);
    }
  }
  return result;
}

export async function submitSeminarRequest(input: {
  title: string;
  description: string;
  prerequisites: string;
  duration: string;
  preferredTiming: string;
  presenterIds: string[];
  attachment: string;
  kind?: SeminarRequest["kind"];
  posterPendingKey?: string;
  requesterId: string;
}): Promise<SeminarRequest> {
  const { posterPendingKey = "", ...rest } = input;
  return saveWithPoster(posterPendingKey, async (posterKey) => {
    const row: SeminarRequest = {
      id: newId(),
      ...rest,
      preferredTiming: normalizeTiming(input.preferredTiming),
      posterKey,
      status: "pending",
      closedAs: null,
      kind: input.kind ?? null,
      createdAt: nowKstIso(),
    };
    await mutate("seminar-requests", (rows) => [...rows, row]);
    return row;
  });
}

export async function updateSeminarRequest(
  id: string,
  actor: { memberId: string; isAdmin: boolean },
  patch: Partial<
    Pick<
      SeminarRequest,
      | "title"
      | "description"
      | "prerequisites"
      | "duration"
      | "preferredTiming"
      | "presenterIds"
      | "attachment"
      | "kind"
    >
  >,
  posterPendingKey = "",
): Promise<void> {
  // Refuse before external file effects. Recheck inside CAS as well: a
  // concurrent approval can close a request while its poster is copying.
  const authorize = (row: SeminarRequest | undefined) => {
    if (!row) throw new AppError("NOT_FOUND");
    if (row.requesterId !== actor.memberId && !actor.isAdmin)
      throw new AppError("FORBIDDEN");
    if (row.status !== "pending") throw new AppError("CONFLICT");
  };
  authorize((await getTableFresh("seminar-requests")).find((r) => r.id === id));
  const cleanPatch =
    patch.preferredTiming !== undefined
      ? { ...patch, preferredTiming: normalizeTiming(patch.preferredTiming) }
      : patch;
  let replacedPoster: string | null = null;
  await saveWithPoster(posterPendingKey, async (posterKey) => {
    const promotedPoster = posterKey || null;
    await mutate("seminar-requests", (rows) => {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) throw new AppError("NOT_FOUND");
      const row = rows[idx];
      authorize(row);
      // CAS 재시도마다 다시 센다 — 진 시도의 값이 남으면 엉뚱한 키를 지운다.
      replacedPoster =
        promotedPoster !== null && row.posterKey !== promotedPoster
          ? row.posterKey || null
          : null;
      rows[idx] = {
        ...row,
        ...cleanPatch,
        ...(promotedPoster !== null ? { posterKey: promotedPoster } : {}),
      };
      return rows;
    });
  });
  // 교체된 포스터는 남겨 두면 용량과 백업만 먹는다. 승인된 세미나가 같은 키를
  // 물려받았다면 forgetAssets가 참조를 보고 건너뛴다.
  await forgetUnreferencedAssets([replacedPoster]);
}

/** §5-2 ?/withdraw — the requester's own retraction. */
export async function withdrawSeminarRequest(
  id: string,
  memberId: string,
): Promise<void> {
  await mutate("seminar-requests", (rows) => {
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    if (rows[idx].requesterId !== memberId) throw new AppError("FORBIDDEN");
    if (rows[idx].status !== "pending") throw new AppError("CONFLICT");
    rows[idx] = { ...rows[idx], status: "withdrawn" };
    return rows;
  });
}

/**
 * §7-2 ?/approveSeminar — 신청을 승인해 **일정 미정 세미나**를 만든다.
 *
 * activity·event·전 회원 공지는 여기서 만들지 않는다 (FRONTEND-DECISIONS §3-1):
 * 실제 일정은 조율 뒤에 정해지고, 공개 시점에 services/seminars.ts가 만든다.
 * 예전에는 승인이 셋을 한 번에 만들면서 **승인을 누른 시각**을 세미나 시작
 * 시각으로 박았고, 그 결과 신청이 즉시 닫히고 당일 자정에 만료됐다.
 */
export async function approveSeminar(id: string): Promise<SeminarRequest> {
  // The archive record and the request's flip in one transaction, judged on
  // the request as it is now (flow_approve_seminar_request). The seminar
  // starts unscheduled; its term is provisional until publication.
  const { request } = await callFlow<FlowResult & { request: unknown }>(
    "flow_approve_seminar_request",
    { id, seminarId: newId(), term: currentTerm() },
  );
  return SeminarRequestSchema.parse(request);
}

/**
 * Judged on the row inside the write, not on a cached read: that refused a
 * request another instance had just taken, and "rejected" a row the store no
 * longer had without writing anything (audit LB31-5, as rejectStudy).
 */
export async function rejectSeminar(id: string): Promise<SeminarRequest> {
  let rejected: SeminarRequest | undefined;
  await mutate("seminar-requests", (rows) => {
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    if (rows[idx].status !== "pending") throw new AppError("CONFLICT");
    rejected = { ...rows[idx], status: "rejected" };
    rows[idx] = rejected;
    return rows;
  });
  return rejected!;
}
