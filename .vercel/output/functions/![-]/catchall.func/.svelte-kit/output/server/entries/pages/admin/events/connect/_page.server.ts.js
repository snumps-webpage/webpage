import { redirect, error } from "@sveltejs/kit";
import { n as getAllActivities } from "../../../../../chunks/notion.js";
import { c as createEvent } from "../../../../../chunks/events.js";
import { a as getSemesterKeyFromDate } from "../../../../../chunks/utils3.js";
import { isAdmin } from "../../../../../chunks/admin.js";
const load = async ({ locals }) => {
  const session = await locals.auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    throw error(404, "Not Found");
  }
  const activities = await getAllActivities();
  const semesters = Array.from(new Set(activities.map((a) => getSemesterKeyFromDate(a.date)))).sort().reverse();
  return { activities, semesters };
};
const actions = {
  publish: async ({ request }) => {
    const data = await request.formData();
    const notionPageId = data.get("notionPageId");
    const title = data.get("title");
    const date = data.get("date");
    const type = data.get("type");
    if (!notionPageId) return { error: "이벤트를 선택해주세요." };
    await createEvent({ title, date, type, notionPageId });
    throw redirect(302, "/admin");
  }
};
export {
  actions,
  load
};
