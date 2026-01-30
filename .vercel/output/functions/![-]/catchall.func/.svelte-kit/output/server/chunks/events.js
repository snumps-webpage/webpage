import { p as checkPageExists, q as updateEventStatusInNotion, r as getAttendanceQueueFromNotion, w as withCache, s as createEventInNotion, t as removeAttendanceRecordInNotion, v as updateAttendanceRecordInNotion, x as deleteEventInNotion, y as createAttendanceRecordInNotion, z as getEventsFromNotion } from "./notion.js";
async function getEvents() {
  return withCache("all_events", 6e4, async () => {
    try {
      return await getEventsFromNotion();
    } catch (e) {
      console.error("Failed to fetch events from Notion:", e);
      return [];
    }
  });
}
async function getEvent(id) {
  const events = await getEvents();
  return events.find((e) => e.id === id);
}
async function getEventByPathId(pathId) {
  const events = await getEvents();
  return events.find((e) => e.pathId === pathId);
}
async function createEvent(data) {
  const newEventData = {
    title: data.title,
    date: data.date,
    timeZone: data.timeZone,
    type: data.type,
    status: "draft",
    pathId: crypto.randomUUID().slice(0, 8),
    attendCode: crypto.randomUUID().slice(0, 12),
    notionPageId: data.notionPageId
  };
  const id = await createEventInNotion(newEventData);
  if (!id) throw new Error("Failed to create event in Notion");
  return { ...newEventData, id };
}
async function updateEventStatus(id, status, notionPageId) {
  await updateEventStatusInNotion(id, status, notionPageId);
}
async function deleteEvent(id) {
  await deleteEventInNotion(id);
}
async function getAttendanceQueue() {
  try {
    const results = await getAttendanceQueueFromNotion();
    return results.map((r) => ({ ...r, notionId: r.id }));
  } catch (e) {
    console.error("Failed to fetch attendance queue from Notion:", e);
    return [];
  }
}
async function recordAttendance(eventId, user) {
  const queue = await getAttendanceQueue();
  const existing = queue.find((r) => r.eventId === eventId && r.userEmail === user.email);
  if (existing) {
    return { record: existing, isNew: false };
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const notionId = await createAttendanceRecordInNotion({
      eventId,
      userEmail: user.email,
      userName: user.name,
      userDept: user.dept,
      startTime: now
    });
    if (notionId) {
      updateAttendanceRecordInNotion(notionId, { endTime: now }).catch(console.error);
      const newRecord = {
        id: notionId,
        notionId,
        eventId,
        userEmail: user.email,
        userName: user.name,
        userDept: user.dept,
        startTime: now,
        endTime: now,
        status: "pending"
      };
      return { record: newRecord, isNew: true };
    }
  } catch (e) {
    console.error("Notion attendance write failed:", e);
  }
  throw new Error("Failed to record attendance in Notion");
}
async function updateAttendanceRecord(recordId, updates) {
  await updateAttendanceRecordInNotion(recordId, updates);
}
async function updateAttendanceStatus(recordId, status) {
  await updateAttendanceRecordInNotion(recordId, { status });
}
async function removeAttendanceRecord(recordId) {
  await removeAttendanceRecordInNotion(recordId);
}
async function syncEventStatuses() {
  const events = await getEvents();
  const now = /* @__PURE__ */ new Date();
  for (const event of events) {
    if (event.notionPageId) {
      const exists = await checkPageExists(event.notionPageId);
      if (!exists) {
        console.warn(`Event '${event.title}' (ID: ${event.id}) removed because Notion page ${event.notionPageId} is missing or archived.`);
        if (event.status !== "expired") {
          await updateEventStatusInNotion(event.id, "expired");
        }
        continue;
      }
    }
    const eventDate = new Date(event.date);
    const tz = event.timeZone || "Asia/Seoul";
    const nowInTz = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
    const eventDayInTz = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(eventDate);
    if (event.status === "draft" && nowInTz >= eventDayInTz) {
      await updateEventStatusInNotion(event.id, "active");
      console.log(`Event '${event.title}' activated.`);
    }
    if (event.status === "active" && nowInTz > eventDayInTz) {
      await updateEventStatusInNotion(event.id, "expired");
      console.log(`Event '${event.title}' expired.`);
    }
  }
}
export {
  getEvents as a,
  updateAttendanceStatus as b,
  createEvent as c,
  getEvent as d,
  deleteEvent as e,
  updateEventStatus as f,
  getAttendanceQueue as g,
  getEventByPathId as h,
  recordAttendance as i,
  removeAttendanceRecord as r,
  syncEventStatuses as s,
  updateAttendanceRecord as u
};
