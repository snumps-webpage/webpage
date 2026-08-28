import { error } from "@sveltejs/kit";
import { ensureSession, handleUserAction } from "$lib/server/auth-guards";
import { AppError } from "$lib/server/core/errors";
import { getTable } from "$lib/server/data/tables";
import { checkIn, effectiveStatus } from "$lib/server/services/events";
import { parseGoogleName } from "$lib/utils";
import type { PageServerLoad } from "./$types";

/** EVT-01 / SEM-05: the shared check-in page behind the obfuscated link. */

async function findByPathId(pathId: string) {
  return (await getTable("events")).find((e) => e.pathId === pathId) ?? null;
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const session = await ensureSession(locals, url);

  const event = await findByPathId(params.id);
  if (!event) throw error(404, "Event not found");
  if (effectiveStatus(event) !== "active") throw error(403, "Event is not active");
  if (params.type !== event.attendCode) throw error(404, "Invalid event page code");

  return {
    event: { ...event, date: event.date.start },
    user: session.user,
    actionType: "attend",
  };
};

export const actions = {
  attend: async ({ params, locals }: { params: { id: string; type: string }; locals: App.Locals }) => {
    return handleUserAction(locals, async (session) => {
      const event = await findByPathId(params.id);
      if (!event || params.type !== event.attendCode) throw new AppError("NOT_FOUND");

      const member = locals.member;
      if (!member) throw new AppError("FORBIDDEN");

      try {
        await checkIn(event, member.memberId);
      } catch (e) {
        if (e instanceof AppError && e.code === "CONFLICT") {
          const { fail } = await import("@sveltejs/kit");
          return fail(409, { error: "이미 출석하셨습니다." });
        }
        throw e;
      }

      const { sendAttendanceNotification } = await import("$lib/server/mail");
      const { name } = parseGoogleName(session.user.name);
      await sendAttendanceNotification(name || member.name, event.title);
      return {};
    });
  },
};
