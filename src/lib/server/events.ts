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
} from "./notion";
import { withCache } from "./cache";

// --- Events Management (Notion Only) ---

export async function getEvents(): Promise<Event[]> {
  // Cache events for 1 minute to reduce API calls
  return withCache("all_events", 60000, async () => {
    try {
      return (await getEventsFromNotion()) as Event[];
    } catch (e) {
      console.error("Failed to fetch events from Notion:", e);
      return [];
    }
  });
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
  date: string;
  type: string;
  notionPageId?: string;
  timeZone?: string;
}) {
  const newEventData = {
    title: data.title,
    date: data.date,
    timeZone: data.timeZone,
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

export async function getAttendanceQueue(): Promise<AttendanceRecord[]> {
  try {
    const results = await getAttendanceQueueFromNotion();
    return results.map((r) => ({ ...r, notionId: r.id })) as AttendanceRecord[];
  } catch (e) {
    console.error("Failed to fetch attendance queue from Notion:", e);
    return [];
  }
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

  const now = new Date().toISOString();

  try {
    const notionId = await createAttendanceRecordInNotion({
      eventId,
      userEmail: user.email,
      userName: user.name,
      userDept: user.dept,
      startTime: now,
    });

    if (notionId) {
      // Immediately update end time for complete record
      updateAttendanceRecordInNotion(notionId, { endTime: now }).catch(
        console.error,
      );

      const newRecord: AttendanceRecord = {
        id: notionId,
        notionId,
        eventId,
        userEmail: user.email,
        userName: user.name,
        userDept: user.dept,
        startTime: now,
        endTime: now,
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
  const now = new Date();

  for (const event of events) {
    // Validation: Check if Notion page exists
    if (event.notionPageId) {
      const exists = await checkPageExists(event.notionPageId);
      if (!exists) {
        console.warn(
          `Event '${event.title}' (ID: ${event.id}) removed because Notion page ${event.notionPageId} is missing or archived.`,
        );
        // Effectively "deleted" from our valid list, but technically still in Notion DB unless we delete it there too.
        // For now, let's mark it as expired or just log it.
        // To keep it clean, we might want to update status to 'expired' in Notion.
        if (event.status !== "expired") {
          await updateEventStatusInNotion(event.id, "expired");
        }
        continue;
      }
    }

    const eventDate = new Date(event.date);
    const tz = event.timeZone || "Asia/Seoul";

    // Get YYYY-MM-DD of 'now' and 'event' in the target timezone
    const nowInTz = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(
      now,
    );
    const eventDayInTz = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
    }).format(eventDate);

    // Status Logic
    // Activate draft events on their scheduled day
    if (event.status === "draft" && nowInTz >= eventDayInTz) {
      await updateEventStatusInNotion(event.id, "active");
      console.log(`Event '${event.title}' activated.`);
    }

    // Expire active events after their day is over
    if (event.status === "active" && nowInTz > eventDayInTz) {
      await updateEventStatusInNotion(event.id, "expired");
      console.log(`Event '${event.title}' expired.`);
    }
  }
}
