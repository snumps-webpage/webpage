/**
 * Membership Application Domain Logic.
 */
import { env } from "$env/dynamic/private";
import { withCache } from "../cache";
import { NOTION_PROPS } from "../../constants";
import {
  notionQuery,
  notionQueryFirst,
  notionCreate,
  notionUpdate,
  notionArchive,
} from "./client";
import { getPropertyValue } from "./utils";

export async function getApplicationByEmail(email: string, skipCache = false) {
  return withCache(
    `application_${email}`,
    60000,
    async () => {
      const dbId = env.NOTION_DB_APPLICATIONS;
      if (!dbId) return null;

      const page = await notionQueryFirst(dbId, {
        filter: { property: NOTION_PROPS.EMAIL, email: { equals: email } },
      });

      if (!page) return null;

      return {
        id: page.id,
        email: getPropertyValue(page.properties[NOTION_PROPS.EMAIL]),
        name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
        phone: getPropertyValue(page.properties[NOTION_PROPS.PHONE_APP]),
        department: getPropertyValue(page.properties[NOTION_PROPS.DEPT]),
        background: getPropertyValue(page.properties[NOTION_PROPS.BACKGROUND]),
        accepted: getPropertyValue(page.properties[NOTION_PROPS.APP_ACCEPTED]),
        submittedAt: (page as any).created_time,
      };
    },
    { skipCache },
  );
}

export async function getApplicationsFromNotion(skipCache = false) {
  return withCache(
    "all_applications",
    60000,
    async () => {
      const dbId = env.NOTION_DB_APPLICATIONS;
      if (!dbId) return [];

      const results = await notionQuery(dbId);

      return results.map((page) => ({
        id: page.id,
        email: getPropertyValue(page.properties[NOTION_PROPS.EMAIL]),
        name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
        phone: getPropertyValue(page.properties[NOTION_PROPS.PHONE_APP]),
        department: getPropertyValue(page.properties[NOTION_PROPS.DEPT]),
        background: getPropertyValue(page.properties[NOTION_PROPS.BACKGROUND]),
        accepted: getPropertyValue(page.properties[NOTION_PROPS.APP_ACCEPTED]),
        submittedAt: (page as any).created_time,
      }));
    },
    { skipCache },
  );
}

export async function markApplicationAsAccepted(id: string) {
  const propertyName = NOTION_PROPS.APP_ACCEPTED.normalize("NFC");
  await notionUpdate(id, { [propertyName]: { checkbox: true } });
}

export async function updateApplicationInNotion(
  id: string,
  data: {
    name: string;
    phone: string;
    department: string;
    background: string;
  },
) {
  await notionUpdate(id, {
    [NOTION_PROPS.NAME]: { title: [{ text: { content: data.name } }] },
    [NOTION_PROPS.PHONE_APP]: { phone_number: data.phone },
    [NOTION_PROPS.DEPT]: {
      rich_text: [{ text: { content: data.department } }],
    },
    [NOTION_PROPS.BACKGROUND]: {
      rich_text: [{ text: { content: data.background } }],
    },
  });
}

export async function createApplicationInNotion(data: {
  email: string;
  name: string;
  phone: string;
  department: string;
  background: string;
}) {
  const dbId = env.NOTION_DB_APPLICATIONS;
  if (!dbId) return null;

  const page = await notionCreate(dbId, {
    [NOTION_PROPS.NAME]: { title: [{ text: { content: data.name } }] },
    [NOTION_PROPS.EMAIL]: { email: data.email },
    [NOTION_PROPS.PHONE_APP]: { phone_number: data.phone },
    [NOTION_PROPS.DEPT]: {
      rich_text: [{ text: { content: data.department } }],
    },
    [NOTION_PROPS.BACKGROUND]: {
      rich_text: [{ text: { content: data.background } }],
    },
  });
  return page.id;
}

export const removeApplicationInNotion = notionArchive;
