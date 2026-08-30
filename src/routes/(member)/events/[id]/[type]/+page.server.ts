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
  // Code mismatch 404s BEFORE any state is revealed (§5-4, review low-10).
  if (params.type !== event.attendCode) throw error(404, "Event not found");
  if (effectiveStatus(event) !== "active") throw error(403, "Event is not active");

  // Supplementary context for the metadata sheet: presenters (seminars) and
  // session number (auto-generated study sessions), resolved from the tables.
  const members = await getTable("members");
  const memberById = new Map(members.map((m) => [m.id, m]));
  const entries: { label: string; value: string }[] = [];
  const presenterNames = event.presenterIds
    .map((id) => memberById.get(id)?.name)
    .filter(Boolean)
    .join(", ");
  if (presenterNames) entries.push({ label: "발표자", value: presenterNames });
  if (event.sessionNo !== null) {
    entries.push({ label: "회차", value: `${event.sessionNo}회차` });
  }
  const context =
    entries.length > 0
      ? {
          primaryLabel: entries[0].label,
          primaryValue: entries[0].value,
          secondaryLabel: entries[1]?.label ?? "종류",
          secondaryValue: entries[1]?.value ?? event.type,
        }
      : null;

  return {
    event: { ...event, date: event.date.start },
    context,
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
          throw new AppError("CONFLICT", { userMessage: "이미 출석하셨습니다." });
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
