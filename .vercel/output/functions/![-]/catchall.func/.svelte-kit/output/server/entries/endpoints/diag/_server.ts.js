import { j as json } from "../../../chunks/index.js";
import { b as private_env } from "../../../chunks/shared-server.js";
import { Client } from "@notionhq/client";
import { isAdmin } from "../../../chunks/admin.js";
const GET = async ({ locals }) => {
  const session = await locals.auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const diag = {
    env: {
      NOTION_API_KEY: !!private_env.NOTION_API_KEY,
      NOTION_DB_MEMBERS: private_env.NOTION_DB_MEMBERS,
      NOTION_DB_PRIVATE_INFO: private_env.NOTION_DB_PRIVATE_INFO
    },
    notion: "untested"
  };
  try {
    if (!private_env.NOTION_API_KEY) throw new Error("Missing API Key");
    const notion = new Client({ auth: private_env.NOTION_API_KEY });
    const me = await notion.users.me({});
    diag.notion = { success: true, name: "name" in me ? me.name || "Unknown" : "Unknown" };
  } catch (e) {
    diag.notion = { success: false, error: e.message };
  }
  return json(diag);
};
export {
  GET
};
