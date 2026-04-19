/**
 * Activity and Attendance Domain Logic.
 */
import { env } from "$env/dynamic/private";
import { withCache } from "../cache";
import { NOTION_PROPS } from "../../constants";
import {
  notionQuery,
  notionCreate,
  notionUpdate,
  notionRetrieve,
} from "./client";
import { getPropertyValue } from "./utils";

export async function getActivities(
  startDate: string,
  endDate: string,
  skipCache = false,
) {
  return withCache(
    `activities_${startDate}_${endDate}`,
    300000,
    async () => {
      const dbId = env.NOTION_DB_ACTIVITIES;
      if (!dbId) throw new Error("NOTION_DB_ACTIVITIES missing");

      const results = await notionQuery(dbId, {
        filter: {
          and: [
            {
              property: NOTION_PROPS.ACTIVITY_DATE,
              date: { on_or_after: startDate },
            },
            {
              property: NOTION_PROPS.ACTIVITY_DATE,
              date: { on_or_before: endDate },
            },
          ],
        },
        sorts: [
          { property: NOTION_PROPS.ACTIVITY_DATE, direction: "descending" },
        ],
        filter_properties: [
          NOTION_PROPS.ACTIVITY_NAME,
          NOTION_PROPS.ACTIVITY_DATE,
          NOTION_PROPS.ACTIVITY_TYPE,
          NOTION_PROPS.ATTENDANCE,
        ],
      });

      return results.map((page) => ({
        id: page.id,
        name: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_NAME]),
        date: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_DATE]),
        type: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_TYPE]),
        attendees: getPropertyValue(page.properties[NOTION_PROPS.ATTENDANCE]),
        url: (page as any).public_url || page.url,
      }));
    },
    { skipCache },
  );
}

export async function getAllActivities() {
  return withCache("all_activities", 60000, async () => {
    const dbId = env.NOTION_DB_ACTIVITIES;
    if (!dbId) throw new Error("NOTION_DB_ACTIVITIES missing");

    const results = await notionQuery(dbId, {
      sorts: [
        { property: NOTION_PROPS.ACTIVITY_DATE, direction: "descending" },
      ],
      filter_properties: [
        NOTION_PROPS.ACTIVITY_NAME,
        NOTION_PROPS.ACTIVITY_DATE,
        NOTION_PROPS.ACTIVITY_TYPE,
      ],
    });

    return results.map((page) => ({
      id: page.id,
      name: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_NAME]),
      date: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_DATE]),
      type: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_TYPE]),
      url: (page as any).public_url || page.url,
    }));
  });
}

export async function getUserActivities(memberId: string, skipCache = false) {
  return withCache(
    `user_activities_${memberId}`,
    300000,
    async () => {
      const dbId = env.NOTION_DB_ACTIVITIES;
      if (!dbId) throw new Error("NOTION_DB_ACTIVITIES missing");

      const results = await notionQuery(dbId, {
        filter: {
          property: NOTION_PROPS.ATTENDANCE,
          relation: { contains: memberId },
        },
        sorts: [
          { property: NOTION_PROPS.ACTIVITY_DATE, direction: "descending" },
        ],
        filter_properties: [
          NOTION_PROPS.ACTIVITY_NAME,
          NOTION_PROPS.ACTIVITY_DATE,
          NOTION_PROPS.ACTIVITY_TYPE,
        ],
      });

      return results.map((page) => ({
        id: page.id,
        name: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_NAME]),
        date: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_DATE]),
        type: getPropertyValue(page.properties[NOTION_PROPS.ACTIVITY_TYPE]),
        url: (page as any).public_url || page.url,
      }));
    },
    { skipCache },
  );
}

export async function createActivityPage(data: {
  title: string;
  date?: string;
  type: string;
  attendeeIds?: string[];
}) {
  const dbId = env.NOTION_DB_ACTIVITIES;
  if (!dbId) throw new Error("NOTION_DB_ACTIVITIES missing");

  const properties: any = {
    [NOTION_PROPS.ACTIVITY_NAME]: {
      title: [{ text: { content: data.title } }],
    },
    [NOTION_PROPS.ACTIVITY_TYPE]: { select: { name: data.type } },
  };

  if (data.date) {
    properties[NOTION_PROPS.ACTIVITY_DATE] = { date: { start: data.date } };
  }

  if (data.attendeeIds && data.attendeeIds.length > 0) {
    properties[NOTION_PROPS.ATTENDANCE] = {
      relation: data.attendeeIds.map((id) => ({ id })),
    };
  }

  return await notionCreate(dbId, properties);
}

export async function addAttendeeToActivity(pageId: string, memberId: string) {
  const page = await notionRetrieve(pageId);
  const currentIds =
    getPropertyValue(page.properties[NOTION_PROPS.ATTENDANCE]) || [];
  if (currentIds.includes(memberId)) return;
  const newIds = [...currentIds, memberId].map((id: string) => ({ id }));
  await notionUpdate(pageId, {
    [NOTION_PROPS.ATTENDANCE]: { relation: newIds },
  });
}
