import { handleUserAction } from "$lib/server/auth-guards";
import { AppError } from "$lib/server/core/errors";
import { currentTerm } from "$lib/server/core/semester";
import { getTable, mutate } from "$lib/server/data/tables";
import type { PageServerLoad } from "./$types";

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
    mailPrefs: info?.mailPrefs ?? { announcements: true },
    email: info?.email ?? "",
    isCurrentExecutive,
    hidePublicPhone: info?.hidePublicPhone ?? false,
    phone: info?.phone ?? "",
  };
};

export const actions = {
  setMailPref: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleUserAction(locals, async () => {
      const type = data.get("type") as string;
      const enabled = data.get("enabled") === "true";
      if (type !== "announcements") throw new AppError("VALIDATION_FAILED");

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
  },

  setPhonePublic: async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    const data = await request.formData();
    return handleUserAction(locals, async () => {
      const hide = data.get("hide") === "true";
      const memberId = locals.member!.memberId;
      await mutate("private-info", (rows) => {
        const idx = rows.findIndex((p) => p.memberId === memberId);
        if (idx === -1) throw new AppError("NOT_FOUND");
        rows[idx] = { ...rows[idx], hidePublicPhone: hide };
        return rows;
      });
      return {};
    });
  },
};
