import type { Event, AttendanceRecord } from "$lib/types";
import {
  getAttendanceQueueFromNotion,
  createAttendanceRecordInNotion,
  updateAttendanceRecordInNotion,
  removeAttendanceRecordInNotion,
  checkPageExists,
  getEventsFromNotion,
  createEventInNotion,
  updateEventStatusInNotion,
  deleteEventInNotion,
  createActivityPage,
} from "./notion";
import { withCache } from "./cache";
import { getKSTDate } from "$lib/utils";

// --- Events Management (Notion Only) ---

export async function getEvents(skipCache = false): Promise<Event[]> {
  // Cache events for 1 minute to reduce API calls
  return withCache(
    "all_events",
    skipCache ? 0 : 60000,
    async () => {
      try {
        return (await getEventsFromNotion()) as Event[];
      } catch (e) {
        console.error("Failed to fetch events from Notion:", e);
        return [];
      }
    },
    { skipCache },
  );
}

export async function getEvent(id: string): Promise<Event | undefined> {
  const events = await getEvents();
  return events.find((e) => e.id === id);
}

export async function getEventByPathId(
  pathId: string,
): Promise<Event | undefined> {
  const events = await getEvents();
  return events.find((e) => e.pathId === pathId);
}

export async function createEvent(data: {
  title: string;
  date?: string;
  type: string;
  notionPageId?: string;
}) {
  const newEventData = {
    title: data.title,
    date: data.date || "",
    type: data.type,
    status: "draft",
    pathId: crypto.randomUUID().slice(0, 8),
    attendCode: crypto.randomUUID().slice(0, 12),
    notionPageId: data.notionPageId,
  };

  const id = await createEventInNotion(newEventData);
  if (!id) throw new Error("Failed to create event in Notion");

  return { ...newEventData, id } as Event;
}

/**
 * High-level service to atomically create a Notion Activity page
 * AND a corresponding local Event record.
 */
export async function publishEvent(data: {
  title: string;
  date?: string;
  type: string;
  attendeeIds?: string[];
}) {
  const notionPage = await createActivityPage({
    title: data.title,
    date: data.date,
    type: data.type,
    attendeeIds: data.attendeeIds,
  });

  const event = await createEvent({
    title: data.title,
    date: data.date,
    type: data.type,
    notionPageId: notionPage.id,
  });

  return { id: event.id, notionPageId: notionPage.id };
}

export async function updateEventStatus(
  id: string,
  status: Event["status"],
  notionPageId?: string,
) {
  await updateEventStatusInNotion(id, status, notionPageId);
}

export async function deleteEvent(id: string) {
  await deleteEventInNotion(id);
}

// --- Attendance Queue (Notion Only) ---

export async function getAttendanceQueue(
  skipCache = false,
): Promise<AttendanceRecord[]> {
  return withCache(
    "attendance_queue",
    skipCache ? 0 : 30000,
    async () => {
      try {
        const results = await getAttendanceQueueFromNotion();
        return results.map((r) => ({
          ...r,
          notionId: r.id,
        })) as AttendanceRecord[];
      } catch (e) {
        console.error("Failed to fetch attendance queue from Notion:", e);
        return [];
      }
    },
    { skipCache },
  );
}

/**
 * Records a complete attendance in one go (Start & End time set to now).
 */
export async function recordAttendance(
  eventId: string,
  user: { email: string; name: string; dept: string },
) {
  const queue = await getAttendanceQueue();
  const existing = queue.find(
    (r) => r.eventId === eventId && r.userEmail === user.email,
  );
  if (existing) {
    return { record: existing, isNew: false };
  }

  // Use KST instead of UTC for recording attendance
  const nowKST = getKSTDate();

  try {
    const notionId = await createAttendanceRecordInNotion({
      eventId,
      userEmail: user.email,
      userName: user.name,
      userDept: user.dept,
      startTime: nowKST,
    });

    if (notionId) {
      // Immediately update end time for complete record
      updateAttendanceRecordInNotion(notionId, { endTime: nowKST }).catch(
        console.error,
      );

      const newRecord: AttendanceRecord = {
        id: notionId,
        notionId,
        eventId,
        userEmail: user.email,
        userName: user.name,
        userDept: user.dept,
        startTime: nowKST,
        endTime: nowKST,
        status: "pending",
      };
      return { record: newRecord, isNew: true };
    }
  } catch (e) {
    console.error("Notion attendance write failed:", e);
  }

  throw new Error("Failed to record attendance in Notion");
}

export async function updateAttendanceRecord(
  recordId: string,
  updates: { startTime?: string; endTime?: string },
) {
  // recordId is assumed to be Notion ID in this architecture
  await updateAttendanceRecordInNotion(recordId, updates);
}

export async function updateAttendanceStatus(
  recordId: string,
  status: AttendanceRecord["status"],
) {
  await updateAttendanceRecordInNotion(recordId, { status });
}

export async function removeAttendanceRecord(recordId: string) {
  await removeAttendanceRecordInNotion(recordId);
}

/**
 * Checks all events and updates their status based on the current date.
 * Also verifies if the linked Notion page still exists.
 */
export async function syncEventStatuses() {
  const events = await getEvents();
  const todayKST = getKSTDate(undefined, true); // YYYY-MM-DD in KST

  for (const event of events) {
    // Validation: Check if Notion page exists
    if (event.notionPageId) {
      const exists = await checkPageExists(event.notionPageId);
      if (!exists) {
        console.warn(
          `Event '${event.title}' (ID: ${event.id}) removed because Notion page ${event.notionPageId} is missing or archived.`,
        );
        if (event.status !== "expired") {
          await updateEventStatusInNotion(event.id, "expired");
        }
        continue;
      }
    }

    // event.date is stored in YYYY-MM-DD format (already KST based from creation)
    const eventDay = event.date;

    // Status Logic
    // Activate draft events on their scheduled day
    if (event.status === "draft" && todayKST >= eventDay) {
      await updateEventStatusInNotion(event.id, "active");
      console.log(`Event '${event.title}' activated.`);
    }

    // Expire active events after their day is over
    if (event.status === "active" && todayKST > eventDay) {
      await updateEventStatusInNotion(event.id, "expired");
      console.log(`Event '${event.title}' expired.`);
    }
  }
}
