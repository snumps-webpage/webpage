import { AppError } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { currentTerm } from "$lib/server/core/semester";
import { getTable, mutate } from "$lib/server/data/tables";
import { ensureCreated } from "$lib/server/data/idempotency";
import { promoteSeminarPoster } from "$lib/server/services/uploads";
import {
  SEMINAR_TIMING_OPTIONS,
  type SeminarRequest,
} from "$lib/server/data/schemas";

/** Seminar proposal lifecycle (API-SPEC §5-1, §5-2, §7-2). */

/** 목록 밖의 선호 시점 값은 미선택으로 정규화 (닫힌 집합 강제). */
function normalizeTiming(value: string): string {
  return (SEMINAR_TIMING_OPTIONS as readonly string[]).includes(value)
    ? value
    : "";
}

export async function submitSeminarRequest(input: {
  title: string;
  description: string;
  prerequisites: string;
  duration: string;
  preferredTiming: string;
  presenterIds: string[];
  attachment: string;
  posterPendingKey?: string;
  requesterId: string;
}): Promise<SeminarRequest> {
  const { posterPendingKey = "", ...rest } = input;
  const row: SeminarRequest = {
    id: newId(),
    ...rest,
    preferredTiming: normalizeTiming(input.preferredTiming),
    posterKey: await promoteSeminarPoster(posterPendingKey),
    status: "pending",
    createdAt: nowKstIso(),
  };
  await mutate("seminar-requests", (rows) => [...rows, row]);
  return row;
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
    >
  >,
  posterPendingKey = "",
): Promise<void> {
  // 새 포스터를 올렸으면 승격해 교체 — mutate 밖에서(외부 I/O). 없으면 유지.
  const promotedPoster = posterPendingKey
    ? await promoteSeminarPoster(posterPendingKey)
    : null;
  const cleanPatch =
    patch.preferredTiming !== undefined
      ? { ...patch, preferredTiming: normalizeTiming(patch.preferredTiming) }
      : patch;
  await mutate("seminar-requests", (rows) => {
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    const row = rows[idx];
    if (row.requesterId !== actor.memberId && !actor.isAdmin) {
      throw new AppError("FORBIDDEN");
    }
    if (row.status !== "pending") throw new AppError("CONFLICT");
    rows[idx] = {
      ...row,
      ...cleanPatch,
      ...(promotedPoster !== null ? { posterKey: promotedPoster } : {}),
    };
    return rows;
  });
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
  const request = (await getTable("seminar-requests")).find((r) => r.id === id);
  if (!request) throw new AppError("NOT_FOUND");
  if (request.status !== "pending") throw new AppError("CONFLICT");

  await ensureCreated("seminars", id, () => ({
    id: newId(),
    title: request.title,
    // 확정 전의 임시값 — 공개 시 실제 일정에서 다시 계산한다.
    semester: currentTerm(),
    note: request.description,
    presenterIds: request.presenterIds,
    externalPresenters: "",
    materials: [],
    photos: [],
    // 신청서의 포스터를 세미나가 소유하도록 이관 — 세미나=정보+포스터
    posterKey: request.posterKey,
    preferredTiming: request.preferredTiming,
    publicationStatus: "unscheduled",
    schedule: null,
    announcedAt: null,
    activityId: null,
    sourceRequestId: id,
  }));

  // 상태 플립은 mutate 안의 CAS — 진입 검사는 최대 15초 낡은 캐시를 읽는다.
  await mutate("seminar-requests", (rows) =>
    rows.map((r) => {
      if (r.id !== id) return r;
      if (r.status !== "pending") throw new AppError("CONFLICT");
      return { ...r, status: "approved" as const };
    }),
  );
  return request;
}

export async function rejectSeminar(id: string): Promise<SeminarRequest> {
  const request = (await getTable("seminar-requests")).find((r) => r.id === id);
  if (!request) throw new AppError("NOT_FOUND");
  await mutate("seminar-requests", (rows) =>
    rows.map((r) => {
      if (r.id !== id) return r;
      if (r.status !== "pending") throw new AppError("CONFLICT"); // CAS
      return { ...r, status: "rejected" as const };
    }),
  );
  return request;
}
