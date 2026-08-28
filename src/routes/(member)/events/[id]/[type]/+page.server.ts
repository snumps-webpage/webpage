import { error } from "@sveltejs/kit";
import {
  getEventByPathId,
  recordAttendance,
  deleteEvent,
} from "$lib/server/events";
import {
  getMemberByEmail,
  getMemberById,
  checkPageExists,
} from "$lib/server/notion";
import { ensureSession, handleUserAction } from "$lib/server/auth-guards";
import { parseGoogleName } from "$lib/utils";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const session = await ensureSession(locals, url);

  const event = await getEventByPathId(params.id);
  if (!event) throw error(404, "Event not found");

  // Robustness: Verify Notion Page Existence
  if (event.notionPageId) {
    const exists = await checkPageExists(event.notionPageId);
    if (!exists) {
      console.warn(
        `Event '${event.title}' accessed but Notion page is missing. Deleting local record.`,
      );
      await deleteEvent(event.id);
      throw error(404, "Event not found (Source Removed)");
    }
  }

  if (event.status !== "active") throw error(403, "Event is not active");

  // Validate code
  if (params.type !== event.attendCode) {
    throw error(404, "Invalid event page code");
  }

  return {
    event,
    user: session.user,
    actionType: "attend",
  };
};

export const actions = {
  attend: async ({ params, locals }) => {
    return handleUserAction(locals, async (session) => {
      const event = await getEventByPathId(params.id);
      if (!event || event.status !== "active")
        throw new Error("Event not found or is not currently active.");
      if (params.type !== event.attendCode)
        throw new Error("Invalid attendance link or code.");

      const { name: parsedName, department: parsedDept } = parseGoogleName(
        session.user.name,
      );

      let dept = parsedDept || "Unknown";
      try {
        const memberLink = await getMemberByEmail(session.user.email);
        if (memberLink) {
          const member = await getMemberById(memberLink.memberId);
          if (member) dept = member.department;
        }
      } catch (e) {
        console.error("[Attendance] Failed to fetch department:", e);
      }

      const result = await recordAttendance(event.id, {
        email: session.user.email,
        name: session.user.name,
        dept,
      });

      if (!result.isNew) {
        const { fail } = await import("@sveltejs/kit");
        return fail(409, { error: "이미 출석하셨습니다." });
      }

      const { sendAttendanceNotification } = await import("$lib/server/mail");
      await sendAttendanceNotification(parsedName, event.title);
      return {};
    });
  },
};
