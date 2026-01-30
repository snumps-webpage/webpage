import { redirect, fail } from "@sveltejs/kit";
import { isAdmin, getApplications, removeApplication } from "../../../chunks/admin.js";
import { g as getAllMembers, i as createActivityPage, b as getMemberByEmail, j as addAttendeeToActivity, k as invalidateCache, l as createMember, m as markApplicationAsAccepted } from "../../../chunks/notion.js";
import { g as getAttendanceQueue, a as getEvents, c as createEvent, r as removeAttendanceRecord, u as updateAttendanceRecord, b as updateAttendanceStatus, d as getEvent, e as deleteEvent, f as updateEventStatus } from "../../../chunks/events.js";
import { g as getSeminarRequests, d as deleteSeminarRequest, u as updateSeminarRequestStatus } from "../../../chunks/seminars.js";
import { sendSeminarStatusNotification } from "../../../chunks/mail.js";
import { n as normalizePhoneNumber } from "../../../chunks/utils3.js";
const load = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    throw redirect(302, "/");
  }
  return {
    applications: (async () => {
      const apps = await getApplications();
      return apps.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
    })(),
    events: (async () => {
      const events = await getEvents();
      return events.reverse();
    })(),
    attendanceQueue: (async () => {
      const queue = await getAttendanceQueue();
      return queue.filter((r) => r.status === "pending");
    })(),
    seminarRequests: (async () => {
      const [requests, members] = await Promise.all([
        getSeminarRequests(),
        getAllMembers()
      ]);
      return requests.filter((r) => r.status === "pending").sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()).map((r) => ({
        ...r,
        speakerNames: Array.isArray(r.speakerIds) ? r.speakerIds.map((id) => {
          const m = members.find((member) => member.id === id);
          return m ? m.name : "Unknown";
        }) : []
      }));
    })()
  };
};
const actions = {
  approve: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) {
      return fail(403, { error: "Access denied. Administrator privileges required." });
    }
    const data = await request.formData();
    const id = data.get("id");
    const apps = await getApplications();
    const app = apps.find((a) => a.id === id);
    if (!app) return fail(404, { error: "Membership application not found" });
    try {
      console.log(`[Admin] Processing approval for ${app.name} (${app.email})`);
      await createMember({
        name: app.name,
        email: app.email,
        phone: normalizePhoneNumber(app.phone),
        department: app.department,
        background: app.background
      });
      invalidateCache(`member_${app.email}`);
      await markApplicationAsAccepted(id);
      console.log(`[Admin] Approval flow completed for ${app.name}`);
      return { success: true };
    } catch (e) {
      console.error("[Admin] Approval flow failed:", e);
      return fail(500, { error: "Internal server error during approval: " + e.message });
    }
  },
  reject: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) {
      return fail(403, { error: "Access denied" });
    }
    const data = await request.formData();
    const id = data.get("id");
    try {
      await removeApplication(id);
      return { success: true };
    } catch {
      return fail(500, { error: "Failed to delete application" });
    }
  },
  // --- Event Management ---
  activateEvent: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) return fail(403, { error: "Forbidden" });
    const data = await request.formData();
    const id = data.get("id");
    const event = await getEvent(id);
    if (!event) return fail(404, { error: "Event not found" });
    if (!event.notionPageId) {
      try {
        const page = await createActivityPage({
          title: event.title,
          date: event.date,
          timeZone: event.timeZone,
          type: event.type
        });
        await updateEventStatus(id, "active", page.id);
      } catch (e) {
        console.error(e);
        return fail(502, { error: "Failed to create Notion Page" });
      }
    } else {
      await updateEventStatus(id, "active");
    }
    return { success: true };
  },
  expireEvent: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) return fail(403, { error: "Forbidden" });
    const data = await request.formData();
    await updateEventStatus(data.get("id"), "expired");
    return { success: true };
  },
  deleteEvent: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) return fail(403, { error: "Forbidden" });
    const data = await request.formData();
    await deleteEvent(data.get("id"));
    return { success: true };
  },
  // --- Attendance Review ---
  approveAttendance: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) return fail(403, { error: "Forbidden" });
    const data = await request.formData();
    const recordId = data.get("id");
    const eventId = data.get("eventId");
    const userEmail = data.get("userEmail");
    try {
      const event = await getEvent(eventId);
      if (!event || !event.notionPageId) return fail(404, { error: "Event or Notion Page not found" });
      const memberLink = await getMemberByEmail(userEmail);
      if (!memberLink) return fail(404, { error: "Member not found in database" });
      await addAttendeeToActivity(event.notionPageId, memberLink.memberId);
      invalidateCache(`user_activities_${memberLink.memberId}`);
      await updateAttendanceStatus(recordId, "approved");
      return { success: true };
    } catch (e) {
      console.error(e);
      return fail(500, { error: "Approval failed: " + e.message });
    }
  },
  rejectAttendance: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) return fail(403, { error: "Forbidden" });
    const data = await request.formData();
    await updateAttendanceStatus(data.get("id"), "rejected");
    return { success: true };
  },
  updateAttendanceTime: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) return fail(403, { error: "Forbidden" });
    const data = await request.formData();
    const id = data.get("id");
    const startTime = data.get("startTime");
    const endTime = data.get("endTime");
    const updates = {};
    if (startTime) updates.startTime = new Date(startTime).toISOString();
    if (endTime) updates.endTime = new Date(endTime).toISOString();
    await updateAttendanceRecord(id, updates);
    return { success: true };
  },
  deleteAttendanceRecord: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) return fail(403, { error: "Forbidden" });
    const data = await request.formData();
    await removeAttendanceRecord(data.get("id"));
    return { success: true };
  },
  // --- Seminar Management ---
  approveSeminar: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) return fail(403, { error: "Forbidden" });
    const data = await request.formData();
    const id = data.get("id");
    const requests = await getSeminarRequests();
    const seminar = requests.find((r) => r.id === id);
    if (!seminar) return fail(404, { error: "Seminar request not found" });
    try {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const page = await createActivityPage({
        title: seminar.title,
        date: now,
        type: "Seminar",
        attendeeIds: seminar.speakerIds
      });
      await createEvent({
        title: seminar.title,
        date: now,
        type: "Seminar",
        notionPageId: page.id
      });
      await updateSeminarRequestStatus(id, "approved");
      if (seminar.speakerIds.length > 0) {
        const { getMemberById, getPrivateInfo } = await import("../../../chunks/notion.js").then((n) => n.K);
        const member = await getMemberById(seminar.speakerIds[0]);
        if (member?.privateInfoId) {
          const info = await getPrivateInfo(member.privateInfoId);
          if (info?.email) {
            await sendSeminarStatusNotification(info.email, member.name, seminar.title, "approved");
          }
        }
      }
      return { success: true };
    } catch (e) {
      console.error(e);
      return fail(500, { error: "Approval failed: " + e.message });
    }
  },
  rejectSeminar: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) return fail(403, { error: "Forbidden" });
    const data = await request.formData();
    const id = data.get("id");
    const requests = await getSeminarRequests();
    const seminar = requests.find((r) => r.id === id);
    if (!seminar) return fail(404, { error: "Seminar request not found" });
    try {
      if (seminar.speakerIds.length > 0) {
        const { getMemberById, getPrivateInfo } = await import("../../../chunks/notion.js").then((n) => n.K);
        const member = await getMemberById(seminar.speakerIds[0]);
        if (member?.privateInfoId) {
          const info = await getPrivateInfo(member.privateInfoId);
          if (info?.email) {
            await sendSeminarStatusNotification(info.email, member.name, seminar.title, "rejected");
          }
        }
      }
      await deleteSeminarRequest(id);
      return { success: true };
    } catch (e) {
      console.error(e);
      return fail(500, { error: "Internal error during rejection/deletion" });
    }
  }
};
export {
  actions,
  load
};
