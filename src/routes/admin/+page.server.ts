/** --- ADMINISTRATIVE ORCHESTRATION --- 
 * Central control point for membership approval, event management, and attendance validation.
 * Orchestrates multi-step Notion workflows and external notifications.
 */
import { fail, redirect } from "@sveltejs/kit";
import { getApplications, isAdmin, removeApplication } from "$lib/server/admin";
import {
  createMember,
  getAllMembers,
  getMemberByEmail,
  createActivityPage,
  addAttendeeToActivity,
  markApplicationAsAccepted,
} from "$lib/server/notion";
import {
  getEvents,
  updateEventStatus,
  deleteEvent,
  getAttendanceQueue,
  updateAttendanceStatus,
  getEvent,
  removeAttendanceRecord,
  updateAttendanceRecord,
  createEvent,
} from "$lib/server/events";
import {
  getSeminarRequests,
  deleteSeminarRequest,
  updateSeminarRequestStatus,
} from "$lib/server/seminars";
import {
  sendSeminarStatusNotification,
  sendWelcomeEmail,
} from "$lib/server/mail";
import { invalidateCache } from "$lib/server/cache";
import { normalizePhoneNumber } from "$lib/utils";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    throw redirect(302, "/");
  }

  return {
    applications: (async () => {
      const apps = await getApplications();
      return apps.sort(
        (a, b) =>
          new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
      );
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
        getAllMembers(),
      ]);
      return requests
        .filter((r) => r.status === "pending")
        .sort(
          (a, b) =>
            new Date(a.submittedAt).getTime() -
            new Date(b.submittedAt).getTime(),
        )
        .map((r) => ({
          ...r,
          speakerNames: Array.isArray(r.speakerIds)
            ? r.speakerIds.map((id) => {
                const m = members.find((member) => member.id === id);
                return m ? m.name : "Unknown";
              })
            : [],
        }));
    })(),
  };
};

export const actions = {
  /** 
   * [Workflow: Membership Approval] 
   * 1. Creates Member & PrivateInfo records. 
   * 2. Marks application as accepted. 
   * 3. Triggers welcome notification.
   */
  approve: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) {
      return fail(403, { error: "Admin privileges required." });
    }

    const data = await request.formData();
    const id = data.get("id") as string;
    const apps = await getApplications();
    const app = apps.find((a) => a.id === id);

    if (!app) return fail(404, { error: "Application not found" });

    try {
      await createMember({
        name: app.name,
        email: app.email,
        phone: normalizePhoneNumber(app.phone),
        department: app.department,
        background: app.background,
      });

      invalidateCache(`member_${app.email}`);
      await markApplicationAsAccepted(id);
      await sendWelcomeEmail(app.email, app.name);

      return { success: true };
    } catch (e) {
      console.error("[Admin Action] Approval flow failed:", e);
      return fail(500, { error: "Internal server error during approval." });
    }
  },

  reject: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) {
      return fail(403, { error: "Access denied" });
    }

    const data = await request.formData();
    const id = data.get("id") as string;

    try {
      await removeApplication(id);
      return { success: true };
    } catch {
      return fail(500, { error: "Failed to delete application" });
    }
  },

  activateEvent: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email))
      return fail(403, { error: "Forbidden" });

    const data = await request.formData();
    const id = data.get("id") as string;
    const event = await getEvent(id);
    if (!event) return fail(404, { error: "Event not found" });

    if (!event.notionPageId) {
      try {
        const page = await createActivityPage({
          title: event.title,
          date: event.date,
          type: event.type,
        });
        await updateEventStatus(id, "active", page.id);
      } catch (e) {
        return fail(502, { error: "Failed to create Notion Page" });
      }
    } else {
      await updateEventStatus(id, "active");
    }
    return { success: true };
  },

  expireEvent: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email))
      return fail(403, { error: "Forbidden" });
    const data = await request.formData();
    await updateEventStatus(data.get("id") as string, "expired");
    return { success: true };
  },

  deleteEvent: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email))
      return fail(403, { error: "Forbidden" });
    const data = await request.formData();
    await deleteEvent(data.get("id") as string);
    return { success: true };
  },

  approveAttendance: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email))
      return fail(403, { error: "Forbidden" });

    const data = await request.formData();
    const recordId = data.get("id") as string;
    const eventId = data.get("eventId") as string;
    const userEmail = data.get("userEmail") as string;

    try {
      const event = await getEvent(eventId);
      if (!event || !event.notionPageId)
        return fail(404, { error: "Event or Notion Page not found" });

      const memberLink = await getMemberByEmail(userEmail);
      if (!memberLink) return fail(404, { error: "Member not found" });

      /** [Performance: Parallelization] Executes independent Notion updates concurrently. */
      await Promise.all([
        addAttendeeToActivity(event.notionPageId, memberLink.memberId).then(
          () => invalidateCache(`user_activities_${memberLink.memberId}`),
        ),
        updateAttendanceStatus(recordId, "approved"),
      ]);

      return { success: true };
    } catch (e) {
      return fail(500, { error: "Approval failed." });
    }
  },

  rejectAttendance: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email))
      return fail(403, { error: "Forbidden" });
    const data = await request.formData();
    await updateAttendanceStatus(data.get("id") as string, "rejected");
    return { success: true };
  },

  updateAttendanceTime: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email))
      return fail(403, { error: "Forbidden" });

    const data = await request.formData();
    const id = data.get("id") as string;
    const startTime = data.get("startTime") as string;
    const endTime = data.get("endTime") as string;

    const updates: { startTime?: string; endTime?: string } = {};
    if (startTime) updates.startTime = new Date(startTime).toISOString();
    if (endTime) updates.endTime = new Date(endTime).toISOString();

    await updateAttendanceRecord(id, updates);
    return { success: true };
  },

  deleteAttendanceRecord: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email))
      return fail(403, { error: "Forbidden" });
    const data = await request.formData();
    await removeAttendanceRecord(data.get("id") as string);
    return { success: true };
  },

  /** 
   * [Workflow: Seminar Approval] 
   * Converts a proposal into a formal Activity Page and Event.
   */
  approveSeminar: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email))
      return fail(403, { error: "Forbidden" });

    const data = await request.formData();
    const id = data.get("id") as string;
    const requests = await getSeminarRequests();
    const seminar = requests.find((r) => r.id === id);

    if (!seminar) return fail(404, { error: "Seminar request not found" });

    try {
      const page = await createActivityPage({
        title: seminar.title,
        type: "Seminar",
        attendeeIds: seminar.speakerIds,
      });

      const tasks: Promise<unknown>[] = [
        createEvent({
          title: seminar.title,
          type: "Seminar",
          notionPageId: page.id,
        }),
        updateSeminarRequestStatus(id, "approved"),
      ];

      if (seminar.speakerIds.length > 0) {
        tasks.push(
          (async () => {
            try {
              const { getMemberById, getPrivateInfo } = await import("$lib/server/notion");
              const member = await getMemberById(seminar.speakerIds[0]);
              if (member?.privateInfoId) {
                const info = await getPrivateInfo(member.privateInfoId);
                if (info?.email) {
                  await sendSeminarStatusNotification(info.email, member.name, seminar.title, "approved");
                }
              }
            } catch (e) {
              console.error("[Admin Action] Seminar approval email failed:", e);
            }
          })(),
        );
      }

      await Promise.all(tasks);
      return { success: true };
    } catch (e) {
      return fail(500, { error: "Seminar approval failed." });
    }
  },

  rejectSeminar: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email))
      return fail(403, { error: "Forbidden" });

    const data = await request.formData();
    const id = data.get("id") as string;
    const requests = await getSeminarRequests();
    const seminar = requests.find((r) => r.id === id);

    if (!seminar) return fail(404, { error: "Seminar request not found" });

    try {
      if (seminar.speakerIds.length > 0) {
        const { getMemberById, getPrivateInfo } = await import("$lib/server/notion");
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
      return fail(500, { error: "Seminar rejection failed." });
    }
  },
};
