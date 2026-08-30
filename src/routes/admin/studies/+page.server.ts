import { dev } from "$app/environment";
import { error, fail } from "@sveltejs/kit";
import {
  adminStudyRecordSchema,
  zodFieldIssues,
} from "$lib/domain/admin-records";
import { studyIdSchema } from "$lib/domain/studies";
import { ensureAdmin } from "$lib/server/auth-guards";
import {
  addDevAdminStudyFile,
  createDevAdminStudyRecord,
  deleteDevAdminStudyRecord,
  getDevAdminStudyRecords,
  removeDevAdminStudyFile,
  setDevAdminStudyOrganizer,
  updateDevAdminStudyRecord,
} from "$lib/server/dev-admin-record-fixtures";
import { getDevAdminMembers } from "$lib/server/dev-member-fixtures";
import {
  approveDevStudyRequest,
  getDevAdminStudyRequests,
  rejectDevStudyRequest,
} from "$lib/server/dev-study-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import { validateContentFile } from "$lib/server/upload-validation";
import { getSemesterInfo } from "$lib/utils";
import type { Actions, PageServerLoad } from "./$types";

function requireAdminPreview(
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  if (!dev || resolveDevPreviewRole(url, cookies) !== "admin") {
    throw error(503, "새 스터디 관리 API 연결이 필요합니다.");
  }
}

function requestIdFrom(formData: FormData) {
  const entry = formData.get("requestId");
  return typeof entry === "string" ? entry : "";
}

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry : "";
}

function activeMembers() {
  return getDevAdminMembers().filter((member) => member.status !== "withdrawn");
}

function parseRecord(formData: FormData) {
  return adminStudyRecordSchema.safeParse({
    title: value(formData, "title"),
    term: value(formData, "term"),
    description: value(formData, "description"),
    material: value(formData, "material"),
  });
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  await ensureAdmin(locals, { silent: true });
  requireAdminPreview(url, cookies);
  return {
    requests: getDevAdminStudyRequests(),
    records: getDevAdminStudyRecords(),
    members: activeMembers().map(({ id, name, department }) => ({
      id,
      name,
      department,
    })),
    currentTerm: getSemesterInfo().key,
    generatedAt: new Date().toISOString(),
  };
};

export const actions: Actions = {
  approveStudy: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const requestId = requestIdFrom(await request.formData());
    if (!studyIdSchema.safeParse(requestId).success) {
      return fail(400, { error: "VALIDATION_FAILED" });
    }
    const source = getDevAdminStudyRequests().find(
      (item) => item.id === requestId,
    );
    const organizer = activeMembers().find(
      (member) => member.id === source?.requester.id,
    );
    if (!source) return fail(404, { error: "NOT_FOUND" });
    if (!organizer) {
      return fail(409, {
        error: "신청자를 현재 회원 원장에서 찾을 수 없습니다.",
      });
    }
    const study = approveDevStudyRequest(requestId);
    if (!study)
      return fail(409, { error: "이미 처리됐거나 존재하지 않는 신청입니다." });
    const record = createDevAdminStudyRecord({
      sourceRequestId: source.id,
      title: source.title,
      term: source.semester,
      description: source.description,
      material: source.textbook,
      organizerId: organizer.id,
      organizerName: organizer.name,
    });
    return {
      success: true,
      operation: "studyApproved" as const,
      requestId,
      study,
      record,
      mailSent: true as const,
    };
  },

  rejectStudy: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const requestId = requestIdFrom(await request.formData());
    if (!studyIdSchema.safeParse(requestId).success) {
      return fail(400, { error: "VALIDATION_FAILED" });
    }
    if (!rejectDevStudyRequest(requestId)) {
      return fail(409, { error: "이미 처리됐거나 존재하지 않는 신청입니다." });
    }
    return {
      success: true,
      operation: "studyRejected" as const,
      requestId,
      mailSent: true as const,
    };
  },

  create: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const formData = await request.formData();
    const result = parseRecord(formData);
    const organizerId = value(formData, "organizerId");
    const organizer = activeMembers().find(
      (member) => member.id === organizerId,
    );
    if (!result.success || !organizer) {
      return fail(400, {
        scope: "record-create" as const,
        issues: {
          ...(result.success ? {} : zodFieldIssues(result.error)),
          ...(!organizer
            ? { organizerId: "현재 회원 중 주최자를 선택해 주세요." }
            : {}),
        },
        values: Object.fromEntries(
          ["title", "term", "description", "material", "organizerId"].map(
            (key) => [key, value(formData, key)],
          ),
        ),
      });
    }
    const record = createDevAdminStudyRecord({
      ...result.data,
      organizerId: organizer.id,
      organizerName: organizer.name,
    });
    return { success: true, operation: "studyRecordCreated" as const, record };
  },

  update: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const formData = await request.formData();
    const id = value(formData, "id");
    const result = parseRecord(formData);
    if (!studyIdSchema.safeParse(id).success || !result.success) {
      return fail(400, {
        scope: "record-update" as const,
        id,
        issues: result.success
          ? { _form: "스터디 식별자를 확인해 주세요." }
          : zodFieldIssues(result.error),
      });
    }
    const record = updateDevAdminStudyRecord(id, result.data);
    if (!record)
      return fail(404, {
        scope: "record-update" as const,
        id,
        error: "NOT_FOUND",
      });
    return { success: true, operation: "studyRecordUpdated" as const, record };
  },

  setOrganizer: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const formData = await request.formData();
    const id = value(formData, "id");
    const organizerId = value(formData, "organizerId");
    const organizer = activeMembers().find(
      (member) => member.id === organizerId,
    );
    if (!studyIdSchema.safeParse(id).success || !organizer) {
      return fail(400, {
        scope: "record-organizer" as const,
        id,
        error: "VALIDATION_FAILED",
      });
    }
    const record = setDevAdminStudyOrganizer(id, {
      id: organizer.id,
      name: organizer.name,
    });
    if (!record) return fail(404, { error: "NOT_FOUND" });
    return { success: true, operation: "studyOrganizerSet" as const, record };
  },

  addFile: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const formData = await request.formData();
    const id = value(formData, "id");
    const result = validateContentFile(formData.get("file"), {
      allowPdf: false,
    });
    if (!studyIdSchema.safeParse(id).success || !result.success) {
      return fail(result.success ? 400 : result.status, {
        scope: "record-file" as const,
        id,
        issues: {
          file: result.success
            ? "스터디 식별자를 확인해 주세요."
            : result.message,
        },
      });
    }
    const record = addDevAdminStudyFile(id, result.file);
    if (!record) return fail(404, { error: "NOT_FOUND" });
    return {
      success: true,
      operation: "studyFileAdded" as const,
      record,
      uploadMode: "dev-metadata-only" as const,
    };
  },

  removeFile: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const formData = await request.formData();
    const record = removeDevAdminStudyFile(
      value(formData, "id"),
      value(formData, "fileId"),
    );
    if (!record) return fail(404, { error: "NOT_FOUND" });
    return { success: true, operation: "studyFileRemoved" as const, record };
  },

  delete: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const id = value(await request.formData(), "id");
    const result = deleteDevAdminStudyRecord(id);
    if (result === "conflict")
      return fail(409, {
        scope: "record-delete" as const,
        id,
        error: "CONFLICT",
      });
    if (result === "not_found")
      return fail(404, {
        scope: "record-delete" as const,
        id,
        error: "NOT_FOUND",
      });
    return { success: true, operation: "studyRecordDeleted" as const, id };
  },
};
