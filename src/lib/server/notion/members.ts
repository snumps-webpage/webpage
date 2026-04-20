/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Member and Private Info Domain Logic.
 */
import { env } from "$env/dynamic/private";
import { withCache } from "../cache";
import { NOTION_PROPS } from "../../constants";
import {
  notionCreate,
  notionQuery,
  notionQueryFirst,
  notionRetrieve,
  notionUpdate,
} from "./client";
import { getPropertyValue } from "./utils";

export async function createMember(data: {
  name: string;
  email: string;
  phone: string;
  department: string;
  background: string;
}) {
  const privateDbId = env.NOTION_DB_PRIVATE_INFO;
  const memberDbId = env.NOTION_DB_MEMBERS;
  if (!privateDbId || !memberDbId) throw new Error("DB IDs missing");

  const privatePage = await notionCreate(privateDbId, {
    [NOTION_PROPS.NAME]: { title: [{ text: { content: data.name } }] },
    [NOTION_PROPS.EMAIL]: { email: data.email },
    [NOTION_PROPS.PHONE]: { phone_number: data.phone },
    [NOTION_PROPS.BACKGROUND]: {
      rich_text: [{ text: { content: data.background } }],
    },
  });

  await notionCreate(memberDbId, {
    [NOTION_PROPS.NAME]: { title: [{ text: { content: data.name } }] },
    [NOTION_PROPS.DEPT]: {
      rich_text: [{ text: { content: data.department } }],
    },
    [NOTION_PROPS.MEMBER_TO_PRIVATE]: { relation: [{ id: privatePage.id }] },
    [NOTION_PROPS.JOIN_DATE]: {
      date: {
        start: new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
        }).format(new Date()),
      },
    },
  });
}

export async function getMemberByEmail(email: string, skipCache = false) {
  return withCache(
    `member_${email}`,
    300000,
    async () => {
      const dbId = env.NOTION_DB_PRIVATE_INFO;
      if (!dbId) throw new Error("NOTION_DB_PRIVATE_INFO missing");

      const page = await notionQueryFirst(dbId, {
        filter: { property: NOTION_PROPS.EMAIL, email: { equals: email } },
        filter_properties: [NOTION_PROPS.PRIVATE_TO_MEMBER],
      });

      if (!page) return null;

      const relationProp: any = page.properties[NOTION_PROPS.PRIVATE_TO_MEMBER];
      if (
        !relationProp ||
        relationProp.type !== "relation" ||
        !relationProp.relation?.length
      ) {
        return null;
      }

      return {
        privateInfoId: page.id,
        memberId: relationProp.relation[0].id,
      };
    },
    { skipCache },
  );
}

export async function getMemberById(memberId: string) {
  const page = await notionRetrieve(memberId);
  return {
    id: page.id,
    name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
    department: getPropertyValue(page.properties[NOTION_PROPS.DEPT]),
    privateInfoId: (page.properties[NOTION_PROPS.MEMBER_TO_PRIVATE] as any)
      ?.relation?.[0]?.id,
  };
}

export async function getAllMembers(skipCache = false) {
  return withCache(
    "all_members",
    60000,
    async () => {
      const dbId = env.NOTION_DB_MEMBERS;
      if (!dbId) throw new Error("NOTION_DB_MEMBERS missing");

      const results = await notionQuery(dbId, {
        filter: { property: NOTION_PROPS.NAME, title: { is_not_empty: true } },
        sorts: [{ property: NOTION_PROPS.NAME, direction: "ascending" }],
        filter_properties: [
          NOTION_PROPS.NAME,
          NOTION_PROPS.DEPT,
          NOTION_PROPS.JOIN_DATE,
        ],
      });

      return results.map((page) => ({
        id: page.id,
        name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
        department: getPropertyValue(page.properties[NOTION_PROPS.DEPT]),
        joinDate: getPropertyValue(page.properties[NOTION_PROPS.JOIN_DATE]),
      }));
    },
    { skipCache },
  );
}

export interface ExecutiveInfo {
  name: string;
  phone: string;
}

export interface LatestExecutives {
  president: ExecutiveInfo;
  vicePresident: ExecutiveInfo;
}

export async function getLatestExecutives(): Promise<LatestExecutives> {
  return withCache("latest_executives", 3600000, async () => {
    const dbId = env.NOTION_DB_MEMBERS;
    const defaultExecs = {
      president: { name: "공석", phone: "" },
      vicePresident: { name: "공석", phone: "" },
    };

    if (!dbId) return defaultExecs;

    const results = await notionQuery(dbId, {
      filter: {
        property: NOTION_PROPS.EXECUTIVES,
        multi_select: { is_not_empty: true },
      },
      filter_properties: [
        NOTION_PROPS.NAME,
        NOTION_PROPS.EXECUTIVES,
        NOTION_PROPS.MEMBER_TO_PRIVATE,
      ],
    });

    if (results.length === 0) return defaultExecs;

    let latestSemesterValue = -1;
    const semesterMap: Record<
      number,
      { presidentId?: string; vicePresidentId?: string }
    > = {};

    for (const page of results) {
      const executives =
        page.properties[NOTION_PROPS.EXECUTIVES]?.multi_select || [];
      for (const tag of executives) {
        const tagName = tag.name as string;
        const match = tagName.match(/(\d{2})-(\d)\s*(회\s*장|부\s*회\s*장)/);

        if (match) {
          const year = parseInt(match[1]);
          const sem = parseInt(match[2]);
          const role = match[3].replace(/\s/g, "");
          const score = year + sem / 10;

          if (score > latestSemesterValue) {
            latestSemesterValue = score;
          }

          if (!semesterMap[score]) semesterMap[score] = {};
          if (role === "회장") {
            semesterMap[score].presidentId = page.id;
          } else if (role === "부회장") {
            semesterMap[score].vicePresidentId = page.id;
          }
        }
      }
    }

    if (latestSemesterValue === -1) return defaultExecs;

    const latest = semesterMap[latestSemesterValue];

    const fetchExecutive = async (
      id: string | undefined,
    ): Promise<ExecutiveInfo> => {
      if (!id) return { name: "공석", phone: "" };
      try {
        const page = await notionRetrieve(id);
        const name = getPropertyValue(page.properties[NOTION_PROPS.NAME]);
        const privateRelation = (
          page.properties[NOTION_PROPS.MEMBER_TO_PRIVATE] as any
        )?.relation?.[0]?.id;
        if (!privateRelation) return { name, phone: "" };
        const privateInfo = await getPrivateInfo(privateRelation);
        return { name, phone: privateInfo.phone || "" };
      } catch (e) {
        console.error(`Failed to fetch executive info for ${id}:`, e);
        return { name: "오류", phone: "" };
      }
    };

    const [president, vicePresident] = await Promise.all([
      fetchExecutive(latest.presidentId),
      fetchExecutive(latest.vicePresidentId),
    ]);

    return { president, vicePresident };
  });
}

export async function getPrivateInfo(pageId: string) {
  const page = await notionRetrieve(pageId);
  return {
    email: getPropertyValue(page.properties[NOTION_PROPS.EMAIL]),
    name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
    phone: getPropertyValue(page.properties[NOTION_PROPS.PHONE]),
    background: getPropertyValue(page.properties[NOTION_PROPS.BACKGROUND]),
  };
}

export async function getAllPrivateInfo() {
  const dbId = env.NOTION_DB_PRIVATE_INFO;
  if (!dbId) throw new Error("NOTION_DB_PRIVATE_INFO missing");

  const results = await notionQuery(dbId, {
    filter_properties: [
      NOTION_PROPS.NAME,
      NOTION_PROPS.EMAIL,
      NOTION_PROPS.PRIVATE_TO_MEMBER,
    ],
  });

  return results.map((page) => ({
    id: page.id,
    name: getPropertyValue(page.properties[NOTION_PROPS.NAME]),
    email: getPropertyValue(page.properties[NOTION_PROPS.EMAIL]),
    memberId: (page.properties[NOTION_PROPS.PRIVATE_TO_MEMBER] as any)
      ?.relation?.[0]?.id,
  }));
}

export async function updatePrivateInfo(
  pageId: string,
  data: { phone?: string; background?: string },
) {
  const props: any = {};
  if (data.phone !== undefined)
    props[NOTION_PROPS.PHONE] = { phone_number: data.phone };
  if (data.background !== undefined)
    props[NOTION_PROPS.BACKGROUND] = {
      rich_text: [{ text: { content: data.background } }],
    };
  await notionUpdate(pageId, props);
}
