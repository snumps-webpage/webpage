import { fail, redirect, error } from "@sveltejs/kit";
import { h as getEventByPathId, i as recordAttendance, d as deleteEvent } from "../../../../../chunks/events.js";
import { g as getAllMembers, b as getMemberByEmail, p as checkPageExists } from "../../../../../chunks/notion.js";
const load = async ({ params, locals, url }) => {
  const session = await locals.auth();
  if (!session?.user?.email) {
    throw redirect(302, `/login?redirect=${encodeURIComponent(url.pathname)}`);
  }
  const event = await getEventByPathId(params.id);
  if (!event) throw error(404, "Event not found");
  if (event.notionPageId) {
    const exists = await checkPageExists(event.notionPageId);
    if (!exists) {
      console.warn(`Event '${event.title}' accessed but Notion page is missing. Deleting local record.`);
      await deleteEvent(event.id);
      throw error(404, "Event not found (Source Removed)");
    }
  }
  if (event.status !== "active") throw error(403, "Event is not active");
  if (params.type !== event.attendCode) {
    throw error(404, "Invalid event page code");
  }
  return {
    event,
    user: session.user,
    actionType: "attend"
  };
};
const actions = {
  attend: async ({ params, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !session.user.name) {
      return fail(401, { error: "Authentication required to record attendance." });
    }
    const event = await getEventByPathId(params.id);
    if (!event || event.status !== "active") {
      return fail(404, { error: "Event not found or is not currently active." });
    }
    if (params.type !== event.attendCode) {
      return fail(404, { error: "Invalid attendance link or code." });
    }
    let dept = "Unknown";
    try {
      const members = await getAllMembers();
      const memberLink = await getMemberByEmail(session.user.email);
      if (memberLink) {
        const member = members.find((m) => m.id === memberLink.memberId);
        if (member) dept = member.department;
      }
    } catch (e) {
      console.error("[Attendance] Failed to fetch department:", e);
    }
    try {
      const result = await recordAttendance(event.id, {
        email: session.user.email,
        name: session.user.name,
        dept
      });
      if (!result.isNew) {
        return fail(409, { error: "Duplicate", message: "이미 출석하셨습니다." });
      }
      const { sendAttendanceNotification } = await import("../../../../../chunks/mail.js");
      try {
        await sendAttendanceNotification(session.user.name, event.title);
      } catch (e) {
        console.error("[Attendance] Failed to send admin notification:", e);
      }
      return { success: true };
    } catch (e) {
      console.error("[Attendance] Action Error:", e);
      return fail(500, { error: "Internal server error while recording attendance." });
    }
  }
};
export {
  actions,
  load
};
