import { fail, isActionFailure, type ActionFailure } from "@sveltejs/kit";
import {
  DEFAULT_MAIL_PREFS,
  validateMailPreferenceForm,
  validatePhonePreferenceForm,
} from "$lib/domain/account";
import type { PreferenceOperation } from "$lib/domain/account-preferences";
import { handleUserAction } from "$lib/server/auth-guards";
import { AppError } from "$lib/server/core/errors";
import { currentTerm } from "$lib/server/core/semester";
import { getTable, mutate } from "$lib/server/data/tables";
import { formatPhoneForDisplay } from "$lib/utils";
import type { PageServerLoad } from "./$types";

function withOperation(result: unknown, operation: PreferenceOperation) {
  if (isActionFailure(result)) {
    const failure = result as unknown as ActionFailure<Record<string, unknown>>;
    return fail(failure.status, { ...failure.data, operation });
  }
  return { ...(result as Record<string, unknown>), operation };
}

/** MEM-06: mail preference toggle — also the landing page of the opt-out link. */
export const load: PageServerLoad = async ({ locals }) => {
  const memberId = locals.member!.memberId;
  const [infos, members] = await Promise.all([
    getTable("private-info"),
    getTable("members"),
  ]);
  const info = infos.find((p) => p.memberId === memberId);
  const me = members.find((m) => m.id === memberId);
  // 전화 공개 토글은 현 학기 회장/부회장에게만 의미가 있다 — 그때만 노출.
  const isCurrentExecutive = !!me?.roles.some(
    (r) => r.term === currentTerm() && ["회장", "부회장"].includes(r.title),
  );
  return {
    mailPrefs: info?.mailPrefs ?? { ...DEFAULT_MAIL_PREFS },
    email: info?.email ?? "",
    isCurrentExecutive,
    hidePublicPhone: info?.hidePublicPhone ?? false,
    phone: formatPhoneForDisplay(info?.phone ?? ""),
  };
};

export const actions = {
  setMailPref: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    const result = await handleUserAction(locals, async () => {
      // A malformed `enabled` used to read as false and unsubscribe silently.
      const parsed = validateMailPreferenceForm(data);
      if (!parsed.success) return fail(400, parsed.failure);
      const { type, enabled } = parsed.data;

      const memberId = locals.member!.memberId;
      await mutate("private-info", (rows) => {
        const idx = rows.findIndex((p) => p.memberId === memberId);
        if (idx === -1) throw new AppError("NOT_FOUND");
        rows[idx] = {
          ...rows[idx],
          mailPrefs: { ...rows[idx].mailPrefs, [type]: enabled },
        };
        return rows;
      });
      return {};
    });
    return withOperation(result, "mailPreferenceUpdated");
  },

  setPhonePublic: async ({
    request,
    locals,
  }: {
    request: Request;
    locals: App.Locals;
  }) => {
    const data = await request.formData();
    const result = await handleUserAction(locals, async () => {
      // A missing or malformed field must never silently publish a phone.
      const parsed = validatePhonePreferenceForm(data);
      if (!parsed.success) return fail(400, parsed.failure);
      const { hide } = parsed.data;
      const memberId = locals.member!.memberId;
      await mutate("private-info", (rows) => {
        const idx = rows.findIndex((p) => p.memberId === memberId);
        if (idx === -1) throw new AppError("NOT_FOUND");
        rows[idx] = { ...rows[idx], hidePublicPhone: hide };
        return rows;
      });
      return {};
    });
    return withOperation(result, "phonePreferenceUpdated");
  },
};
