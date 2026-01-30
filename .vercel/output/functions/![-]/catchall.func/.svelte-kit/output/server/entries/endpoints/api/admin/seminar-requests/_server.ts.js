import { json } from "@sveltejs/kit";
import { isAdmin } from "../../../../../chunks/admin.js";
import { g as getSeminarRequests } from "../../../../../chunks/seminars.js";
import { g as getAllMembers } from "../../../../../chunks/notion.js";
const GET = async ({ locals }) => {
  const session = await locals.auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const [seminarRequests, members] = await Promise.all([
    getSeminarRequests(),
    getAllMembers()
  ]);
  const requestWithSpeakers = seminarRequests.filter((r) => r.status === "pending").sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()).map((r) => ({
    ...r,
    speakerNames: Array.isArray(r.speakerIds) ? r.speakerIds.map((id) => {
      const m = members.find((member) => member.id === id);
      return m ? m.name : "Unknown";
    }) : []
  }));
  return json(requestWithSpeakers);
};
export {
  GET
};
