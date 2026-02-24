import { fail, redirect } from "@sveltejs/kit";
import { getApplications, isAdmin, removeApplication } from "$lib/server/admin";
import {
  createMember,
  getAllMembers,
  getAllPrivateInfo,
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
  sendSeminarAnnouncementToMembers,
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
  approve: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) {
      return fail(403, {
        error: "Access denied. Administrator privileges required.",
      });
    }

    const data = await request.formData();
    const id = data.get("id") as string;

    const apps = await getApplications();
    const app = apps.find((a) => a.id === id);

    if (!app) return fail(404, { error: "Membership application not found" });

    try {
      console.log(`[Admin] Processing approval for ${app.name} (${app.email})`);

      // 1. Create Member record in Notion (Critical)
      await createMember({
        name: app.name,
        email: app.email,
        phone: normalizePhoneNumber(app.phone),
        department: app.department,
        background: app.background,
      });

      invalidateCache(`member_${app.email}`);

      // 2. Mark as accepted in Notion (Critical)
      await markApplicationAsAccepted(id);

      // 3. Send welcome email with chat link
      await sendWelcomeEmail(app.email, app.name);

      console.log(`[Admin] Approval flow completed for ${app.name}`);
      return { success: true };
    } catch (e) {
      console.error("[Admin] Approval flow failed:", e);
      return fail(500, {
        error: "Internal server error during approval: " + (e as Error).message,
      });
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

  // --- Event Management ---

  activateEvent: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email))
      return fail(403, { error: "Forbidden" });

    const data = await request.formData();
    const id = data.get("id") as string;

    const event = await getEvent(id);
    if (!event) return fail(404, { error: "Event not found" });

    // Ensure a corresponding activity page exists in Notion before activation
    if (!event.notionPageId) {
      try {
        const page = await createActivityPage({
          title: event.title,
          date: event.date,
          type: event.type,
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

  // --- Attendance Review ---

  approveAttendance: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email))
      return fail(403, { error: "Forbidden" });

    const data = await request.formData();
    const recordId = data.get("id") as string;
    const eventId = data.get("eventId") as string;
    const userEmail = data.get("userEmail") as string;

    try {
      // 1. Get Event & Notion Page
      const event = await getEvent(eventId);
      if (!event || !event.notionPageId)
        return fail(404, { error: "Event or Notion Page not found" });

      // 2. Get Member ID
      const memberLink = await getMemberByEmail(userEmail);
      if (!memberLink)
        return fail(404, { error: "Member not found in database" });

      // 3. Parallelize independent Notion updates
      await Promise.all([
        addAttendeeToActivity(event.notionPageId, memberLink.memberId).then(
          () => invalidateCache(`user_activities_${memberLink.memberId}`),
        ),
        updateAttendanceStatus(recordId, "approved"),
      ]);

      return { success: true };
    } catch (e) {
      console.error(e);
      return fail(500, { error: "Approval failed: " + (e as Error).message });
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

  // --- Seminar Management ---

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
      // 1. Create Activity Page in Notion (Critical Dependency) - Date left empty
      const page = await createActivityPage({
        title: seminar.title,
        type: "Seminar",
        attendeeIds: seminar.speakerIds,
      });

      // 2. Parallelize remaining independent tasks
      const tasks: Promise<unknown>[] = [
        createEvent({
          title: seminar.title,
          type: "Seminar",
          notionPageId: page.id,
          presenterIds: seminar.speakerIds,
        }),
        updateSeminarRequestStatus(id, "approved"),
      ];

      // 3. Notify all members about the newly approved seminar
      tasks.push(
        (async () => {
          try {
            const privateInfos = await getAllPrivateInfo();
            const recipientEmails = Array.from(
              new Set(
                privateInfos
                  .filter((info) => info.memberId && info.email)
                  .map((info) => info.email),
              ),
            );
            if (recipientEmails.length > 0) {
              await sendSeminarAnnouncementToMembers(
                recipientEmails,
                seminar.title,
              );
            }
          } catch (e) {
            console.error("Failed to send seminar announcement email:", e);
            // Don't fail the whole request just because email failed
          }
        })(),
      );

      // 4. Notify Speaker(s)
      if (seminar.speakerIds.length > 0) {
        tasks.push(
          (async () => {
            try {
              const { getMemberById, getPrivateInfo } =
                await import("$lib/server/notion");
              const member = await getMemberById(seminar.speakerIds[0]);
              if (member?.privateInfoId) {
                const info = await getPrivateInfo(member.privateInfoId);
                if (info?.email) {
                  await sendSeminarStatusNotification(
                    info.email,
                    member.name,
                    seminar.title,
                    "approved",
                  );
                }
              }
            } catch (e) {
              console.error("Failed to send seminar approval email:", e);
              // Don't fail the whole request just because email failed
            }
          })(),
        );
      }

      await Promise.all(tasks);

      return { success: true };
    } catch (e) {
      console.error(e);
      return fail(500, { error: "Approval failed: " + (e as Error).message });
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
      // Notify Speaker(s) before deletion
      if (seminar.speakerIds.length > 0) {
        const { getMemberById, getPrivateInfo } =
          await import("$lib/server/notion");
        const member = await getMemberById(seminar.speakerIds[0]);
        if (member?.privateInfoId) {
          const info = await getPrivateInfo(member.privateInfoId);
          if (info?.email) {
            await sendSeminarStatusNotification(
              info.email,
              member.name,
              seminar.title,
              "rejected",
            );
          }
        }
      }

      await deleteSeminarRequest(id);
      return { success: true };
    } catch (e) {
      console.error(e);
      return fail(500, { error: "Internal error during rejection/deletion" });
    }
  },
};
