/** --- DOMAIN LOGIC --- 
 * Manages event lifecycle and attendance tracking.
 */
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

export async function getEvents(): Promise<Event[]> {
  /** [Performance: TTL] 1-minute cache ensures freshness for active events while reducing API load. */
  return withCache("all_events", 60000, async () => {
    try {
      return (await getEventsFromNotion()) as Event[];
    } catch (e) {
      console.error("[Events Domain] Failed to fetch events:", e);
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
  date?: string;
  type: string;
  notionPageId?: string;
}) {
  /** [Security: Obscurity] Generates high-entropy tokens for public URLs to prevent enumeration. */
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

export async function getAttendanceQueue(): Promise<AttendanceRecord[]> {
  try {
    const results = await getAttendanceQueueFromNotion();
    return results.map((r) => ({ ...r, notionId: r.id })) as AttendanceRecord[];
  } catch (e) {
    console.error("[Events Domain] Failed to fetch attendance queue:", e);
    return [];
  }
}

/** 
 * [Domain: Atomic Record] 
 * Records both check-in and check-out simultaneously for club efficiency. 
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
    console.error("[Events Domain] Attendance write failed:", e);
  }

  throw new Error("Failed to record attendance");
}

export async function updateAttendanceRecord(
  recordId: string,
  updates: { startTime?: string; endTime?: string },
) {
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
 * [Domain: Lifecycle Management] 
 * Reconciles scheduled dates with current time to auto-activate or expire events. 
 */
export async function syncEventStatuses() {
  const events = await getEvents();
  const now = new Date();

  for (const event of events) {
    if (event.notionPageId) {
      const exists = await checkPageExists(event.notionPageId);
      if (!exists) {
        if (event.status !== "expired") {
          await updateEventStatusInNotion(event.id, "expired");
        }
        continue;
      }
    }

    const eventDate = new Date(event.date);
    const nowDay = now.toISOString().split("T")[0];
    const eventDay = eventDate.toISOString().split("T")[0];

    if (event.status === "draft" && nowDay >= eventDay) {
      await updateEventStatusInNotion(event.id, "active");
    }

    if (event.status === "active" && nowDay > eventDay) {
      await updateEventStatusInNotion(event.id, "expired");
    }
  }
}
