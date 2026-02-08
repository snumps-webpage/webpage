import { f as fail, r as redirect, e as error } from "../../../../../chunks/index.js";
import { b as private_env } from "../../../../../chunks/shared-server.js";
import { c as createEvent } from "../../../../../chunks/events.js";
import { i as createActivityPage, o as getDatabaseSchema } from "../../../../../chunks/notion.js";
import { isAdmin } from "../../../../../chunks/admin.js";
import { A as ACTIVITY_TYPES } from "../../../../../chunks/constants.js";
import { b as getIsoStringWithOffset } from "../../../../../chunks/utils3.js";
const load = async ({ locals }) => {
  const session = await locals.auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    throw error(404, "Not Found");
  }
  const dbId = private_env.NOTION_DB_ACTIVITIES;
  let activityTypes = [...ACTIVITY_TYPES];
  if (dbId) {
    try {
      const schema = await getDatabaseSchema(dbId);
      const typeProp = schema["활동 종류"];
      if (typeProp?.options) {
        activityTypes = typeProp.options;
      }
    } catch (e) {
      console.error("Failed to fetch activity types from Notion:", e);
    }
  }
  return { activityTypes };
};
const actions = {
  default: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !isAdmin(session.user.email)) return fail(401, { error: "Unauthorized" });
    const data = await request.formData();
    const title = data.get("title");
    const dateRaw = data.get("date");
    const timezone = data.get("timezone");
    const type = data.get("type");
    if (!title || !dateRaw || !type) {
      return fail(400, { error: "Missing required fields" });
    }
    try {
      const date = getIsoStringWithOffset(dateRaw, timezone);
      const page = await createActivityPage({
        title,
        date,
        type,
        timeZone: timezone
      });
      await createEvent({
        title,
        date,
        type,
        timeZone: timezone,
        notionPageId: page.id
      });
      throw redirect(302, "/admin");
    } catch (e) {
      if (e && typeof e === "object" && "status" in e && e.status === 302) throw e;
      console.error(e);
      return fail(500, { error: "Creation failed" });
    }
  }
};
export {
  actions,
  load
};
