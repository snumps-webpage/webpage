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
import { AppError } from "$lib/server/core/errors";
import { currentTerm, TERM_PATTERN } from "$lib/server/core/semester";
import { nowKstIso } from "$lib/server/core/time";
import { StudyStatus } from "$lib/server/data/schemas";
import {
  adminStudyRequestItem,
  contentFileFromKey,
  memberSummaryById,
} from "$lib/server/data/admin-queue-views";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });
  const [studies, members, requests, allMembers] = await Promise.all([
    getTable("studies"),
    memberPickers(),
    getTable("study-requests"),
    getTable("members"),
  ]);
  const summaries = memberSummaryById(allMembers);
  const nameOf = (id: string) => summaries.get(id)?.name ?? "알 수 없음";
  return {
    requests: requests
      .filter((r) => r.status === "pending")
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
      sessionCount: s.schedule.length,
      files: s.photos.map((key) => contentFileFromKey(key, "image")),
    })),
    members,
    currentTerm: currentTerm(),
    generatedAt: nowKstIso(),
  };
};

type Ctx = { request: Request; locals: App.Locals };

export const actions = {
  create: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const title = (data.get("title") as string)?.trim();
      const semester = data.get("semester") as string;
      const organizerId = data.get("organizerId") as string;
      if (!title || !TERM_PATTERN.test(semester) || !organizerId) {
        throw new AppError("VALIDATION_FAILED");
      }
      await createStudy({
        title,
        semester,
        textbook: (data.get("textbook") as string) ?? "",
        description: (data.get("description") as string) ?? "",
        note: (data.get("note") as string) ?? "",
        organizerIds: [organizerId],
      });
      return { operation: "studyRecordCreated" };
    });
  },

  update: async ({ request, locals }: Ctx) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      const statusRaw = data.get("status") as string | null;
      const status = statusRaw ? StudyStatus.parse(statusRaw) : undefined;
      await updateStudy(data.get("id") as string, {
        title: (data.get("title") as string)?.trim() || undefined,
        semester: data.get("semester") ? (data.get("semester") as string) : undefined,
        textbook: (data.get("textbook") as string) ?? undefined,
        description: (data.get("description") as string) ?? undefined,
        note: (data.get("note") as string) ?? undefined,
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
      await setStudyPhotos(data.get("id") as string, { remove: data.get("s3Key") as string });
      return { operation: "studyFileRemoved" };
    });
  },
};
