import { error, redirect, fail } from "@sveltejs/kit";
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
import { parseGoogleName } from "$lib/utils";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const session = await locals.auth();

  if (!session?.user?.email) {
    throw redirect(302, `/login?redirect=${encodeURIComponent(url.pathname)}`);
  }

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
    const session = await locals.auth();
    if (!session?.user?.email || !session.user.name) {
      return fail(401, {
        error: "Authentication required to record attendance.",
      });
    }

    const event = await getEventByPathId(params.id);
    if (!event || event.status !== "active") {
      return fail(404, {
        error: "Event not found or is not currently active.",
      });
    }

    if (params.type !== event.attendCode) {
      return fail(404, { error: "Invalid attendance link or code." });
    }

    // Extract name info
    const { name: parsedName, department: parsedDept } = parseGoogleName(session.user.name);

    // Fetch Department (Priority: Notion DB -> parsedDept -> "Unknown")
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

    try {
      const result = await recordAttendance(event.id, {
        email: session.user.email,
        name: session.user.name,
        dept,
      });

      if (!result.isNew) {
        return fail(409, {
          error: "Duplicate",
          message: "이미 출석하셨습니다.",
        });
      }

      // Notify admins using parsed name
      const { sendAttendanceNotification } = await import("$lib/server/mail");
      try {
        await sendAttendanceNotification(parsedName, event.title);
      } catch (e) {
        console.error("[Attendance] Failed to send admin notification:", e);
      }

      return { success: true };
    } catch (e) {
      console.error("[Attendance] Action Error:", e);
      return fail(500, {
        error: "Internal server error while recording attendance.",
      });
    }
  },
};
