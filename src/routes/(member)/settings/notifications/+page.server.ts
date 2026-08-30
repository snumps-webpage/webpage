import { handleUserAction } from "$lib/server/auth-guards";
import { AppError } from "$lib/server/core/errors";
import { getTable, mutate } from "$lib/server/data/tables";
import type { PageServerLoad } from "./$types";

/** MEM-06: mail preference toggle — also the landing page of the opt-out link. */
export const load: PageServerLoad = async ({ locals }) => {
  const memberId = locals.member!.memberId;
  const info = (await getTable("private-info")).find((p) => p.memberId === memberId);
  return {
    mailPrefs: info?.mailPrefs ?? { announcements: true },
    email: info?.email ?? "",
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
};
