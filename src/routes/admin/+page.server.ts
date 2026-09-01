import { getApplications, removeApplication } from "$lib/server/admin";
import { ensureAdmin, handleAdminAction } from "$lib/server/auth-guards";
import {
  createMember,
  getMemberByEmail,
  createActivityPage,
  addAttendeeToActivity,
  markApplicationAsAccepted,
  createSeminarInNotion,
  getMemberById,
  getPrivateInfo,
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
  publishEvent,
} from "$lib/server/events";
import {
  getPendingSeminarRequests,
  getSeminarRequests,
  deleteSeminarRequest,
  updateSeminarRequestStatus,
} from "$lib/server/seminars";
import {
  sendSeminarStatusNotification,
  sendWelcomeEmail,
} from "$lib/server/mail";
import { normalizePhoneNumber, getKSTDate } from "$lib/utils";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  await ensureAdmin(event.locals);
  const skipCache = event.url.searchParams.has("refresh");

  return {
    streamed: {
      applications: (async () => {
        const apps = await getApplications(skipCache);
        return apps.sort(
          (a, b) =>
            new Date(a.submittedAt).getTime() -
            new Date(b.submittedAt).getTime(),
        );
      })(),
      events: (async () => {
        const events = await getEvents(skipCache);
        return [...events].reverse();
      })(),
      attendanceQueue: (async () => {
        const queue = await getAttendanceQueue(skipCache);
        return queue.filter((r) => r.status === "pending");
      })(),
      seminarRequests: getPendingSeminarRequests(skipCache),
    },
  };
};

export const actions = {
  approve: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get("id") as string;

    return handleAdminAction(
      locals,
      async () => {
        const apps = await getApplications();
        const app = apps.find((a) => a.id === id);

        if (!app) throw new Error("Membership application not found");
        if (app.accepted) throw new Error("Application already accepted");

        console.log(
          `[Admin] Processing approval for ${app.name} (${app.email})`,
        );

        // 1. Create Member record in Notion (Critical)
        await createMember({
          name: app.name,
          email: app.email,
          phone: normalizePhoneNumber(app.phone),
          department: app.department,
          background: app.background,
        });

        // Verify member was created
        const member = await getMemberByEmail(app.email, true);
        if (!member)
          throw new Error("Member record creation verification failed");

        // 2. Mark as accepted & Send email
        await markApplicationAsAccepted(id);
        await sendWelcomeEmail(app.email, app.name);

        return { success: true };
      },
      { invalidate: [`member_${id}`, "all_applications", "all_members"] },
    );
  },

  reject: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get("id") as string;
    return handleAdminAction(
      locals,
      async () => {
        await removeApplication(id);
        return {};
      },
      { invalidate: "all_applications" },
    );
  },

  activateEvent: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get("id") as string;

    return handleAdminAction(
      locals,
      async () => {
        const event = await getEvent(id);
        if (!event) throw new Error("Event not found");

        if (!event.notionPageId) {
          const page = await createActivityPage({
            title: event.title,
            date: event.date,
            type: event.type,
          });
          await updateEventStatus(id, "active", page.id);
        } else {
          await updateEventStatus(id, "active");
        }
        return {};
      },
      { invalidate: "all_events" },
    );
  },

  expireEvent: async ({ request, locals }) => {
    const data = await request.formData();
    return handleAdminAction(
      locals,
      async () => {
        await updateEventStatus(data.get("id") as string, "expired");
        return {};
      },
      { invalidate: "all_events" },
    );
  },

  deleteEvent: async ({ request, locals }) => {
    const data = await request.formData();
    return handleAdminAction(
      locals,
      async () => {
        await deleteEvent(data.get("id") as string);
        return {};
      },
      { invalidate: "all_events" },
    );
  },

  approveAttendance: async ({ request, locals }) => {
    const data = await request.formData();
    const recordId = data.get("id") as string;
    const eventId = data.get("eventId") as string;
    const userEmail = data.get("userEmail") as string;

    return handleAdminAction(
      locals,
      async () => {
        const event = await getEvent(eventId);
        if (!event || !event.notionPageId)
          throw new Error("Event or Notion Page not found");

        const memberLink = await getMemberByEmail(userEmail);
        if (!memberLink) throw new Error("Member not found in database");

        await Promise.all([
          addAttendeeToActivity(event.notionPageId, memberLink.memberId),
          updateAttendanceStatus(recordId, "approved"),
        ]);
        return {};
      },
      { invalidate: `user_activities_${userEmail}` },
    );
  },

  rejectAttendance: async ({ request, locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await updateAttendanceStatus(data.get("id") as string, "rejected");
      return {};
    });
  },

  updateAttendanceTime: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get("id") as string;
    const startTime = data.get("startTime") as string;
    const endTime = data.get("endTime") as string;

    return handleAdminAction(locals, async () => {
      const updates: { startTime?: string; endTime?: string } = {};
      if (startTime) updates.startTime = getKSTDate(new Date(startTime));
      if (endTime) updates.endTime = getKSTDate(new Date(endTime));
      await updateAttendanceRecord(id, updates);
      return {};
    });
  },

  deleteAttendanceRecord: async ({ request, locals }) => {
    const data = await request.formData();
    return handleAdminAction(locals, async () => {
      await removeAttendanceRecord(data.get("id") as string);
      return {};
    });
  },

  approveSeminar: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get("id") as string;

    return handleAdminAction(
      locals,
      async () => {
        const requests = await getSeminarRequests();
        const seminar = requests.find((r) => r.id === id);
        if (!seminar) throw new Error("Seminar request not found");

        const todayKST = getKSTDate(undefined, true);

        await publishEvent({
          title: seminar.title,
          date: todayKST,
          type: "Seminar",
          attendeeIds: seminar.speakerIds,
        });

        await createSeminarInNotion({
          title: seminar.title,
          speakerIds: seminar.speakerIds,
          remarks: seminar.description,
        });

        if (seminar.speakerIds.length > 0) {
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
        }

        await updateSeminarRequestStatus(id, "approved");
        return {};
      },
      { invalidate: ["all_seminar_requests", "all_events"] },
    );
  },

  rejectSeminar: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get("id") as string;

    return handleAdminAction(
      locals,
      async () => {
        const requests = await getSeminarRequests();
        const seminar = requests.find((r) => r.id === id);
        if (!seminar) throw new Error("Seminar request not found");

        if (seminar.speakerIds.length > 0) {
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
        return {};
      },
      { invalidate: "all_seminar_requests" },
    );
  },
};
