/**
 * Event and Attendance Record Domain Logic.
 */
import { env } from "$env/dynamic/private";
import { withCache } from "../cache";
import { NOTION_PROPS } from "../../constants";
import {
  notionQuery,
  notionCreate,
  notionUpdate,
  notionArchive,
  notionRetrieve,
  notionRetrieveDatabase,
} from "./client";
import { getPropertyValue } from "./utils";

export async function getEventsFromNotion() {
  const dbId = env.NOTION_DB_EVENTS;
  if (!dbId) return [];

  const results = await notionQuery(dbId, {
    filter_properties: [
      NOTION_PROPS.EVENT_TITLE,
      NOTION_PROPS.EVENT_DATE,
      NOTION_PROPS.EVENT_TYPE,
      NOTION_PROPS.EVENT_STATUS,
      NOTION_PROPS.EVENT_PATH_ID,
      NOTION_PROPS.EVENT_ATTEND_CODE,
      NOTION_PROPS.EVENT_NOTION_PAGE_ID,
    ],
  });
  return results.map((page) => ({
    id: page.id,
    title: getPropertyValue(page.properties[NOTION_PROPS.EVENT_TITLE]),
    date: getPropertyValue(page.properties[NOTION_PROPS.EVENT_DATE]),
    type: getPropertyValue(page.properties[NOTION_PROPS.EVENT_TYPE]),
    status:
      getPropertyValue(page.properties[NOTION_PROPS.EVENT_STATUS]) || "draft",
    pathId: getPropertyValue(page.properties[NOTION_PROPS.EVENT_PATH_ID]),
    attendCode: getPropertyValue(
      page.properties[NOTION_PROPS.EVENT_ATTEND_CODE],
    ),
    notionPageId: getPropertyValue(
      page.properties[NOTION_PROPS.EVENT_NOTION_PAGE_ID],
    ),
  }));
}

export async function createEventInNotion(data: any) {
  const dbId = env.NOTION_DB_EVENTS;
  if (!dbId) return null;

  const props: any = {
    [NOTION_PROPS.EVENT_TITLE]: { title: [{ text: { content: data.title } }] },
    [NOTION_PROPS.EVENT_TYPE]: { select: { name: data.type } },
    [NOTION_PROPS.EVENT_STATUS]: { select: { name: data.status } },
    [NOTION_PROPS.EVENT_PATH_ID]: {
      rich_text: [{ text: { content: data.pathId } }],
    },
    [NOTION_PROPS.EVENT_ATTEND_CODE]: {
      rich_text: [{ text: { content: data.attendCode } }],
    },
  };

  if (data.date) {
    props[NOTION_PROPS.EVENT_DATE] = { date: { start: data.date } };
  }

  if (data.notionPageId) {
    props[NOTION_PROPS.EVENT_NOTION_PAGE_ID] = {
      rich_text: [{ text: { content: data.notionPageId } }],
    };
  }

  const page = await notionCreate(dbId, props);
  return page.id;
}

export async function updateEventStatusInNotion(
  id: string,
  status: string,
  notionPageId?: string,
) {
  const props: any = {
    [NOTION_PROPS.EVENT_STATUS]: { select: { name: status } },
  };
  if (notionPageId) {
    props[NOTION_PROPS.EVENT_NOTION_PAGE_ID] = {
      rich_text: [{ text: { content: notionPageId } }],
    };
  }
  await notionUpdate(id, props);
}

export const deleteEventInNotion = notionArchive;

export async function getAttendanceQueueFromNotion() {
  const dbId = env.NOTION_DB_ATTENDANCE_QUEUE;
  if (!dbId) return [];
  const results = await notionQuery(dbId);
  return results.map((page) => ({
    id: page.id,
    eventId: getPropertyValue(page.properties.EventId),
    userEmail: getPropertyValue(page.properties.UserEmail),
    userName: getPropertyValue(page.properties.UserName),
    userDept: getPropertyValue(page.properties.UserDept),
    startTime: getPropertyValue(page.properties.StartTime),
    endTime: getPropertyValue(page.properties.EndTime),
    status: getPropertyValue(page.properties.Status) || "pending",
  }));
}

export async function createAttendanceRecordInNotion(data: any) {
  const dbId = env.NOTION_DB_ATTENDANCE_QUEUE;
  if (!dbId) return null;
  const page = await notionCreate(dbId, {
    UserName: { title: [{ text: { content: data.userName } }] },
    UserEmail: { email: data.userEmail },
    UserDept: { rich_text: [{ text: { content: data.userDept } }] },
    EventId: { rich_text: [{ text: { content: data.eventId } }] },
    StartTime: { date: { start: data.startTime } },
    Status: { select: { name: "pending" } },
  });
  return page.id;
}

export async function updateAttendanceRecordInNotion(id: string, updates: any) {
  const props: any = {};
  if (updates.endTime) props.EndTime = { date: { start: updates.endTime } };
  if (updates.startTime)
    props.StartTime = { date: { start: updates.startTime } };
  if (updates.status) props.Status = { select: { name: updates.status } };
  await notionUpdate(id, props);
}

export const removeAttendanceRecordInNotion = notionArchive;

export async function checkPageExists(pageId: string): Promise<boolean> {
  try {
    const page = await notionRetrieve(pageId);
    return !!page && !page.archived;
  } catch {
    return false;
  }
}

export async function getDatabaseSchema(databaseId: string): Promise<any> {
  return withCache(`schema_${databaseId}`, 3600000, async () => {
    const response = await notionRetrieveDatabase(databaseId);
    const result: any = {};
    if (response && response.properties) {
      for (const [key, value] of Object.entries(response.properties)) {
        const type = (value as any).type;
        const options = (value as any)[type]?.options?.map((o: any) => o.name);
        result[key] = { type, options };
      }
    }
    return result;
  });
}
