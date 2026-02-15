import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import {
  queryDatabase,
  getPropertyValue,
  type NotionProperty,
} from "$lib/server/notion";
import { NOTION_PROPS } from "$lib/constants";
import { isAdmin } from "$lib/server/admin";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const session = await event.locals.auth();

  if (!session?.user || !isAdmin(session.user.email)) {
    throw error(404, "Not Found");
  }

  const databaseId = env.NOTION_DB_MEMBERS;

  if (!databaseId) {
    return {
      error: "NOTION_DB_MEMBERS가 설정되지 않았습니다.",
      columns: [],
      rows: [],
    };
  }

  try {
    const pages = await queryDatabase(databaseId);

    const columns = [
      { name: NOTION_PROPS.NAME, label: "이름" },
      { name: NOTION_PROPS.DEPT, label: "학과" },
      { name: NOTION_PROPS.JOIN_DATE, label: "가입일" },
      { name: "link", label: "개인 정보 링크" },
    ];

    const rows = pages.map((page) => {
      const p = page as { id: string; properties: Record<string, NotionProperty> };
      const row: Record<string, string> = {
        id: p.id,
        [NOTION_PROPS.NAME]: String(getPropertyValue(p.properties[NOTION_PROPS.NAME])),
        [NOTION_PROPS.DEPT]: String(getPropertyValue(p.properties[NOTION_PROPS.DEPT])),
        [NOTION_PROPS.JOIN_DATE]: String(getPropertyValue(p.properties[NOTION_PROPS.JOIN_DATE])),
        link: `https://www.notion.so/${p.id.replace(/-/g, "")}`,
      };
      return row;
    });

    return {
      columns,
      rows,
      error: null,
    };
  } catch (err) {
    console.error("Notion API Error:", err);
    const errorDetail = JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
    return {
      error: `Notion API 오류: ${errorDetail}`,
      columns: [],
      rows: [],
    };
  }
};
