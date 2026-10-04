import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { memberPickers } from "$lib/server/data/repos";
import {
  createStudy,
  deleteStudy,
  setOrganizer,
  setStudyPhotos,
  updateStudy,
} from "$lib/server/services/records-admin";
import { promotePendingUpload } from "$lib/server/services/uploads";
import { fail, isActionFailure, type ActionFailure } from "@sveltejs/kit";
import { formText, fieldIssues } from "$lib/domain/form-data";
import {
  adminStudyRecordCreateSchema,
  adminStudyRecordSchema,
  type AdminRecordActionScope,
} from "$lib/domain/admin-records";
import { currentTerm } from "$lib/server/core/semester";
import { nowKstIso } from "$lib/server/core/time";
import { StudyStatus } from "$lib/server/data/schemas";
import { AppError } from "$lib/server/core/errors";
import {
  adminStudyRequestItem,
  contentFileFromKey,
  directorySummaryIndex,
  byCreatedAtAsc,
} from "$lib/server/data/admin-queue-views";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  // members(=memberPickers)는 조직자 지정용 운영 명단, summaries는 표시용
  // 통합 디렉터리 — 이주된 스터디의 organizerIds는 legacy id다.
  const [studies, events, members, requests, summaries] = await Promise.all([
    getTable("studies"),
    getTable("events"),
    memberPickers(),
    getTable("study-requests"),
    directorySummaryIndex(),
  ]);
  const nameOf = (id: string) => summaries.get(id)?.name ?? "알 수 없음";
  return {
    requests: requests
      .filter((r) => r.status === "pending")
      .sort(byCreatedAtAsc)
      .map((r) => adminStudyRequestItem(r, summaries)),
    records: [...studies].reverse().map((s) => ({
      id: s.id,
      sourceRequestId: s.sourceRequestId,
      title: s.title,
      term: s.semester,
      description: s.description,
      material: s.textbook,
      organizerIds: s.organizerIds,
      organizerNames: s.organizerIds.map(nameOf),
      pendingTransfer: s.pendingTransfer,
      transferHistory: s.transferHistory.map((t) => ({
        fromMemberId: t.from,
        toMemberId: t.to,
        changedAt: t.at,
        byAdmin: t.byAdmin,
      })),
      // gates the delete button — deleteStudy refuses while sessions exist
      sessionCount: events.filter((e) => e.studyId === s.id).length,
      files: s.photos.map((key) => contentFileFromKey(key, "image")),
    })),
    members,
    currentTerm: currentTerm(),
    generatedAt: nowKstIso(),
  };
};

type Ctx = { request: Request; locals: App.Locals };

/**
 * The record editor posts `semester`/`textbook`; the schema names them
 * term/material — the keys the editor renders issues and values under.
 */
function studyValues(data: FormData) {
  return {
    title: formText(data, "title"),
    term: formText(data, "semester"),
    description: formText(data, "description"),
    material: formText(data, "textbook"),
    note: formText(data, "note"),
  };
}

/** Preserve the shared auth/error classification and add only editor values. */
async function recordAction<T extends Record<string, unknown>>(
  locals: App.Locals,
  scope: AdminRecordActionScope,
  id: string,
  values: Record<string, string>,
  logic: () => Promise<T | ActionFailure<Record<string, unknown>>>,
) {
  const result = await handleAdminAction(locals, logic);
  if (isActionFailure(result as unknown)) {
    const failure = result as ActionFailure<Record<string, unknown>>;
    return fail(failure.status, { ...failure.data, scope, id, values });
  }
  const successful = result as T & { success: true };
  return {
    ...successful,
    scope,
    id: typeof successful.id === "string" ? successful.id : id,
  };
}

export const actions = {
  create: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    const values = {
      ...studyValues(data),
      organizerId: formText(data, "organizerId"),
    };
    return recordAction(locals, "record-create", "", values, async () => {
      const parsed = adminStudyRecordCreateSchema.safeParse(values);
      if (!parsed.success)
        return fail(400, {
          error: "VALIDATION_FAILED",
          issues: fieldIssues(parsed.error),
        });
      const { title, term, material, description, note, organizerId } =
        parsed.data;
      const created = await createStudy({
        title,
        semester: term,
        textbook: material,
        description,
        note,
        organizerIds: [organizerId],
      });
      return { operation: "studyRecordCreated", id: created.id };
    });
  },

  update: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    const id = formText(data, "id");
    const values = {
      ...studyValues(data),
      ...(data.has("status") ? { status: formText(data, "status") } : {}),
    };
    return recordAction(locals, "record-update", id, values, async () => {
      const parsed = adminStudyRecordSchema.safeParse(values);
      if (!parsed.success)
        return fail(400, {
          error: "VALIDATION_FAILED",
          issues: fieldIssues(parsed.error),
        });
      const { title, term, material, description, note } = parsed.data;
      const statusRaw = formText(data, "status");
      const status = statusRaw ? StudyStatus.safeParse(statusRaw) : null;
      if (status && !status.success) throw new AppError("VALIDATION_FAILED");
      // 편집기가 보내지 않는 칸은 그대로 둔다 — 빈 값으로 지우지 않는다.
      const sent = (key: string) => data.has(key);
      await updateStudy(id, {
        title,
        semester: term,
        textbook: sent("textbook") ? material : undefined,
        description: sent("description") ? description : undefined,
        note: sent("note") ? note : undefined,
        status: status?.data,
      });
      return { operation: "studyRecordUpdated" };
    });
  },

  delete: async ({ request, locals }: Ctx) => {
    const id = formText(await request.formData(), "id");
    return recordAction(locals, "record-delete", id, {}, async () => {
      await deleteStudy(id);
      return { operation: "studyRecordDeleted" };
    });
  },

  /** Admin plenary transfer — clears any pending two-phase proposal, audited. */
  setOrganizer: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    const id = formText(data, "id");
    const values = { organizerId: formText(data, "organizerId") };
    return recordAction(locals, "record-organizer", id, values, async () => {
      await setOrganizer(
        id,
        data.get("organizerId") as string,
        locals.member!.memberId,
      );
      return { operation: "studyOrganizerSet" };
    });
  },

  addFile: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    const id = formText(data, "id");
    const values = { pendingKey: formText(data, "pendingKey") };
    return recordAction(locals, "record-file", id, values, async () => {
      const finalKey = await promotePendingUpload(
        data.get("pendingKey") as string,
        "study-photo",
        id,
      );
      await setStudyPhotos(id, { add: finalKey });
      return { s3Key: finalKey, operation: "studyFileAdded" };
    });
  },

  removeFile: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    const id = formText(data, "id");
    const values = { s3Key: formText(data, "s3Key") };
    return recordAction(locals, "record-file", id, values, async () => {
      await setStudyPhotos(id, {
        remove: data.get("s3Key") as string,
      });
      return { operation: "studyFileRemoved" };
    });
  },
};
