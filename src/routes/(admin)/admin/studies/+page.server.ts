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
import { fail } from "@sveltejs/kit";
import { formText, fieldIssues } from "$lib/domain/form-data";
import {
  adminStudyRecordCreateSchema,
  adminStudyRecordSchema,
} from "$lib/domain/admin-records";
import { currentTerm } from "$lib/server/core/semester";
import { nowKstIso } from "$lib/server/core/time";
import { StudyStatus } from "$lib/server/data/schemas";
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

function invalid(
  scope: "record-create" | "record-update",
  error: Parameters<typeof fieldIssues>[0],
  values: Record<string, string>,
  id?: string,
) {
  return fail(400, {
    error: "VALIDATION_FAILED",
    scope,
    id,
    issues: fieldIssues(error),
    values,
  });
}

export const actions = {
  create: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const values = {
        ...studyValues(data),
        organizerId: formText(data, "organizerId"),
      };
      const parsed = adminStudyRecordCreateSchema.safeParse(values);
      if (!parsed.success)
        return invalid("record-create", parsed.error, values);
      const { title, term, material, description, note, organizerId } =
        parsed.data;
      await createStudy({
        title,
        semester: term,
        textbook: material,
        description,
        note,
        organizerIds: [organizerId],
      });
      return { operation: "studyRecordCreated" };
    });
  },

  update: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const id = data.get("id") as string;
      const values = studyValues(data);
      const parsed = adminStudyRecordSchema.safeParse(values);
      if (!parsed.success)
        return invalid("record-update", parsed.error, values, id);
      const { title, term, material, description, note } = parsed.data;
      const statusRaw = data.get("status") as string | null;
      const status = statusRaw ? StudyStatus.parse(statusRaw) : undefined;
      // 편집기가 보내지 않는 칸은 그대로 둔다 — 빈 값으로 지우지 않는다.
      const sent = (key: string) => data.has(key);
      await updateStudy(id, {
        title,
        semester: term,
        textbook: sent("textbook") ? material : undefined,
        description: sent("description") ? description : undefined,
        note: sent("note") ? note : undefined,
        status,
      });
      return { operation: "studyRecordUpdated" };
    });
  },

  delete: async ({ request, locals }: Ctx) => {
    const id = (await request.formData()).get("id") as string;
    return handleAdminAction(locals, async () => {
      await deleteStudy(id);
      return { operation: "studyRecordDeleted" };
    });
  },

  /** Admin plenary transfer — clears any pending two-phase proposal, audited. */
  setOrganizer: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await setOrganizer(
        data.get("id") as string,
        data.get("organizerId") as string,
        locals.member!.memberId,
      );
      return { operation: "studyOrganizerSet" };
    });
  },

  addFile: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const id = data.get("id") as string;
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
    return handleAdminAction(locals, async () => {
      await setStudyPhotos(data.get("id") as string, {
        remove: data.get("s3Key") as string,
      });
      return { operation: "studyFileRemoved" };
    });
  },
};
