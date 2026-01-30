import { error } from "@sveltejs/kit";
import { b as private_env } from "../../../chunks/shared-server.js";
import { o as getDatabaseSchema, A as queryDatabase, B as getPropertyValue } from "../../../chunks/notion.js";
import { isAdmin } from "../../../chunks/admin.js";
const load = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user || !isAdmin(session.user.email)) {
    throw error(404, "Not Found");
  }
  const databaseId = private_env.NOTION_DB_MEMBERS;
  if (!databaseId) {
    return {
      error: "NOTION_DB_MEMBERS가 설정되지 않았습니다.",
      columns: [],
      rows: []
    };
  }
  try {
    const [schema, pages] = await Promise.all([
      getDatabaseSchema(databaseId),
      queryDatabase(databaseId)
    ]);
    const columns = Object.entries(schema).map(([name, prop]) => ({
      name,
      type: prop.type
    }));
    const rows = pages.map((page) => {
      const row = {};
      for (const [name, prop] of Object.entries(page.properties)) {
        const val = getPropertyValue(prop);
        if (Array.isArray(val)) {
          row[name] = val.join(", ");
        } else {
          row[name] = String(val);
        }
      }
      return { id: page.id, ...row };
    });
    return {
      columns,
      rows,
      error: null
    };
  } catch (err) {
    console.error("Notion API Error:", err);
    const errorDetail = JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
    return {
      error: `Notion API 오류: ${errorDetail}`,
      columns: [],
      rows: []
    };
  }
};
export {
  load
};
