import { dev } from "$app/environment";
import { error, fail } from "@sveltejs/kit";
import { z } from "zod";
import {
  adminActivityRecordSchema,
  zodFieldIssues,
} from "$lib/domain/admin-records";
import { ensureAdmin } from "$lib/server/auth-guards";
import {
  createDevAdminActivity,
  deleteDevAdminActivity,
  getDevAdminActivities,
  setDevAdminActivityAttendees,
  updateDevAdminActivity,
} from "$lib/server/dev-admin-record-fixtures";
import { getDevAdminMembers } from "$lib/server/dev-member-fixtures";
import { resolveDevPreviewRole } from "$lib/server/dev-preview";
import type { Actions, PageServerLoad } from "./$types";

const idSchema = z.string().trim().min(1);

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

function requireAdminPreview(
  url: URL,
  cookies: Parameters<typeof resolveDevPreviewRole>[1],
) {
  if (!dev || resolveDevPreviewRole(url, cookies) !== "admin") {
    throw error(503, "새 활동 레코드 API 연결이 필요합니다.");
  }
}

function parseRecord(formData: FormData) {
  return adminActivityRecordSchema.safeParse({
    title: value(formData, "title"),
    type: value(formData, "type"),
    date: value(formData, "date"),
  });
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  await ensureAdmin(locals, { silent: true });
  requireAdminPreview(url, cookies);
  return {
    activities: getDevAdminActivities(),
    members: getDevAdminMembers()
      .filter((member) => member.status !== "withdrawn")
      .map(({ id, name, department }) => ({ id, name, department })),
    generatedAt: new Date().toISOString(),
  };
};

export const actions: Actions = {
  create: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const formData = await request.formData();
    const result = parseRecord(formData);
    if (!result.success) {
      return fail(400, {
        scope: "create" as const,
        issues: zodFieldIssues(result.error),
        values: {
          title: value(formData, "title"),
          type: value(formData, "type"),
          date: value(formData, "date"),
        },
      });
    }
    return {
      success: true,
      operation: "activityCreated" as const,
      activity: createDevAdminActivity(result.data),
    };
  },
  update: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const formData = await request.formData();
    const id = value(formData, "id");
    const result = parseRecord(formData);
    if (!idSchema.safeParse(id).success || !result.success) {
      return fail(400, {
        scope: "update" as const,
        id,
        issues: result.success
          ? { _form: "활동 식별자를 확인해 주세요." }
          : zodFieldIssues(result.error),
      });
    }
    const activity = updateDevAdminActivity(id, result.data);
    if (!activity)
      return fail(404, { scope: "update" as const, id, error: "NOT_FOUND" });
    return { success: true, operation: "activityUpdated" as const, activity };
  },
  setAttendees: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const formData = await request.formData();
    const id = value(formData, "id");
    const candidates = new Set(
      getDevAdminMembers()
        .filter((member) => member.status !== "withdrawn")
        .map((member) => member.id),
    );
    const attendeeIds = formData
      .getAll("attendeeIds")
      .filter((item): item is string => typeof item === "string");
    if (
      !idSchema.safeParse(id).success ||
      attendeeIds.some((memberId) => !candidates.has(memberId))
    ) {
      return fail(400, {
        scope: "attendees" as const,
        id,
        error: "VALIDATION_FAILED",
      });
    }
    const activity = setDevAdminActivityAttendees(id, attendeeIds);
    if (!activity)
      return fail(404, { scope: "attendees" as const, id, error: "NOT_FOUND" });
    return { success: true, operation: "attendeesReplaced" as const, activity };
  },
  delete: async ({ request, locals, url, cookies }) => {
    await ensureAdmin(locals, { silent: true });
    requireAdminPreview(url, cookies);
    const id = value(await request.formData(), "id");
    if (!idSchema.safeParse(id).success)
      return fail(400, { error: "VALIDATION_FAILED" });
    const result = deleteDevAdminActivity(id);
    if (result === "conflict")
      return fail(409, { scope: "delete" as const, id, error: "CONFLICT" });
    if (result === "not_found")
      return fail(404, { scope: "delete" as const, id, error: "NOT_FOUND" });
    return { success: true, operation: "activityDeleted" as const, id };
  },
};
