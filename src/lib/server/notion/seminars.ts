/**
 * Seminar and Seminar Request Domain Logic.
 */
import { env } from "$env/dynamic/private";
import { withCache } from "../cache";
import { NOTION_PROPS } from "../../constants";
import {
  notionQuery,
  notionCreate,
  notionUpdate,
  notionArchive,
} from "./client";
import { getPropertyValue } from "./utils";

export async function getUserSeminars(memberId: string) {
  const dbId = env.NOTION_DB_SEMINARS;
  if (!dbId) return [];

  const results = await notionQuery(dbId, {
    filter: {
      property: NOTION_PROPS.SEMINAR_SPEAKER,
      relation: { contains: memberId },
    },
    sorts: [
      { property: NOTION_PROPS.SEMINAR_SEMESTER, direction: "descending" },
    ],
  });

  return results.map((page) => ({
    id: page.id,
    title: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_TITLE]),
    remarks: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_REMARKS]),
    semester: getPropertyValue(page.properties[NOTION_PROPS.SEMINAR_SEMESTER]),
  }));
}

export async function createSeminarInNotion(data: {
  title: string;
  speakerIds: string[];
  remarks?: string;
  semester?: string;
}) {
  const dbId = env.NOTION_DB_SEMINARS;
  if (!dbId) throw new Error("NOTION_DB_SEMINARS missing");

  // Use provided semester or calculate current one based on KST
  const { getSemesterInfo } = await import("../../utils");
  const semester = data.semester || getSemesterInfo().key;

  const properties: any = {
    [NOTION_PROPS.SEMINAR_TITLE]: {
      title: [{ text: { content: data.title } }],
    },
    [NOTION_PROPS.SEMINAR_SPEAKER]: {
      relation: data.speakerIds.map((id) => ({ id })),
    },
    [NOTION_PROPS.SEMINAR_SEMESTER]: {
      select: { name: semester },
    },
  };

  if (data.remarks) {
    properties[NOTION_PROPS.SEMINAR_REMARKS] = {
      rich_text: [{ text: { content: data.remarks } }],
    };
  }

  return await notionCreate(dbId, properties);
}

export async function getSeminarRequestsFromNotion(skipCache = false) {
  return withCache(
    "all_seminar_requests",
    60000,
    async () => {
      const dbId = env.NOTION_DB_SEMINAR_REQUESTS;
      if (!dbId) return [];

      const results = await notionQuery(dbId, {
        filter_properties: [
          NOTION_PROPS.SEMINAR_REQ_TITLE,
          NOTION_PROPS.SEMINAR_REQ_DESC,
          NOTION_PROPS.SEMINAR_REQ_PREREQ,
          NOTION_PROPS.SEMINAR_REQ_DURATION,
          NOTION_PROPS.SEMINAR_REQ_SPEAKERS,
          NOTION_PROPS.SEMINAR_FILES,
          NOTION_PROPS.SEMINAR_REQ_APPROVED,
        ],
      });

      return results.map((page) => ({
        id: page.id,
        title: getPropertyValue(
          page.properties[NOTION_PROPS.SEMINAR_REQ_TITLE],
        ),
        description: getPropertyValue(
          page.properties[NOTION_PROPS.SEMINAR_REQ_DESC],
        ),
        prerequisites: getPropertyValue(
          page.properties[NOTION_PROPS.SEMINAR_REQ_PREREQ],
        ),
        duration: getPropertyValue(
          page.properties[NOTION_PROPS.SEMINAR_REQ_DURATION],
        ),
        speakerIds: getPropertyValue(
          page.properties[NOTION_PROPS.SEMINAR_REQ_SPEAKERS],
        ),
        attachment: getPropertyValue(
          page.properties[NOTION_PROPS.SEMINAR_FILES],
        ),
        status: getPropertyValue(
          page.properties[NOTION_PROPS.SEMINAR_REQ_APPROVED],
        )
          ? "approved"
          : "pending",
        submittedAt: (page as any).created_time,
      }));
    },
    { skipCache },
  );
}

export async function createSeminarRequestInNotion(data: {
  title: string;
  description: string;
  prerequisites: string;
  duration: string;
  speakerIds: string[];
  attachment?: string;
}) {
  const dbId = env.NOTION_DB_SEMINAR_REQUESTS;
  if (!dbId) return null;

  const properties: any = {
    [NOTION_PROPS.SEMINAR_REQ_TITLE]: {
      title: [{ text: { content: data.title } }],
    },
    [NOTION_PROPS.SEMINAR_REQ_DESC]: {
      rich_text: [{ text: { content: data.description } }],
    },
    [NOTION_PROPS.SEMINAR_REQ_PREREQ]: {
      rich_text: [{ text: { content: data.prerequisites } }],
    },
    [NOTION_PROPS.SEMINAR_REQ_DURATION]: {
      rich_text: [{ text: { content: data.duration } }],
    },
    [NOTION_PROPS.SEMINAR_REQ_SPEAKERS]: {
      relation: (data.speakerIds || []).map((id) => ({ id })),
    },
  };

  if (data.attachment) {
    properties[NOTION_PROPS.SEMINAR_FILES] = { url: data.attachment };
  }

  const page = await notionCreate(dbId, properties);
  return page.id;
}

export async function updateSeminarRequestInNotion(
  id: string,
  data: {
    title?: string;
    description?: string;
    prerequisites?: string;
    duration?: string;
    speakerIds?: string[];
    attachment?: string;
  },
) {
  const properties: any = {};
  if (data.title !== undefined)
    properties[NOTION_PROPS.SEMINAR_REQ_TITLE] = {
      title: [{ text: { content: data.title } }],
    };
  if (data.description !== undefined)
    properties[NOTION_PROPS.SEMINAR_REQ_DESC] = {
      rich_text: [{ text: { content: data.description } }],
    };
  if (data.prerequisites !== undefined)
    properties[NOTION_PROPS.SEMINAR_REQ_PREREQ] = {
      rich_text: [{ text: { content: data.prerequisites } }],
    };
  if (data.duration !== undefined)
    properties[NOTION_PROPS.SEMINAR_REQ_DURATION] = {
      rich_text: [{ text: { content: data.duration } }],
    };
  if (data.speakerIds !== undefined)
    properties[NOTION_PROPS.SEMINAR_REQ_SPEAKERS] = {
      relation: data.speakerIds.map((sid) => ({ id: sid })),
    };
  if (data.attachment !== undefined) {
    properties[NOTION_PROPS.SEMINAR_FILES] = data.attachment
      ? { url: data.attachment }
      : { url: null };
  }

  await notionUpdate(id, properties);
}

export async function updateSeminarRequestStatusInNotion(
  id: string,
  status: string,
) {
  await notionUpdate(id, {
    [NOTION_PROPS.SEMINAR_REQ_APPROVED]: { checkbox: status === "approved" },
  });
}

export const removeSeminarRequestInNotion = notionArchive;

export async function updateSeminar(
  pageId: string,
  data: { title?: string; remarks?: string },
) {
  const props: any = {};
  if (data.title !== undefined)
    props[NOTION_PROPS.SEMINAR_TITLE] = {
      title: [{ text: { content: data.title } }],
    };
  if (data.remarks !== undefined)
    props[NOTION_PROPS.SEMINAR_REMARKS] = {
      rich_text: [{ text: { content: data.remarks } }],
    };
  await notionUpdate(pageId, props);
}
