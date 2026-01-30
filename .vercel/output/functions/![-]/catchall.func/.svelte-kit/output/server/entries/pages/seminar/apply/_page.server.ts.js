import { fail, redirect } from "@sveltejs/kit";
import { c as createSeminarRequest } from "../../../../chunks/seminars.js";
import { b as getMemberByEmail, g as getAllMembers, C as getAllPrivateInfo } from "../../../../chunks/notion.js";
const load = async ({ locals, url }) => {
  const session = await locals.auth();
  if (!session?.user) throw redirect(302, `/login?redirect=${encodeURIComponent(url.pathname)}`);
  const [members, privateInfos] = await Promise.all([
    getAllMembers(),
    getAllPrivateInfo()
  ]);
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const searchableMembers = privateInfos.filter((p) => p.memberId && memberMap.has(p.memberId)).map((p) => {
    const member = memberMap.get(p.memberId);
    return {
      id: member.id,
      // We use the Member Database ID for relations
      name: member.name,
      department: member.department,
      email: p.email
    };
  });
  return {
    user: session.user,
    members: searchableMembers
  };
};
const actions = {
  default: async ({ request, locals }) => {
    const session = await locals.auth();
    if (!session?.user?.email || !session.user.name) {
      return fail(401, { error: "Authentication required to apply for a seminar." });
    }
    const data = await request.formData();
    const title = data.get("title");
    const description = data.get("description");
    const prerequisites = data.get("prerequisites");
    const duration = data.get("duration");
    const speakerIdsRaw = data.get("speakerIds");
    const member = await getMemberByEmail(session.user.email);
    if (!member) return fail(404, { error: "Member record not found. Please ensure you are a registered member." });
    let speakerIds = [];
    if (speakerIdsRaw) {
      try {
        speakerIds = JSON.parse(speakerIdsRaw);
      } catch {
        speakerIds = speakerIdsRaw.split(",").filter((id) => id.trim());
      }
    }
    if (speakerIds.length === 0) {
      speakerIds = [member.memberId];
    }
    if (!title || !description) {
      return fail(400, { error: "Seminar title and description are required." });
    }
    try {
      await createSeminarRequest({
        title,
        description,
        prerequisites: prerequisites || "",
        duration,
        speakerIds
      });
      const { sendSeminarApplicationNotification } = await import("../../../../chunks/mail.js");
      await sendSeminarApplicationNotification(session.user.name, title);
      return { success: true };
    } catch (e) {
      console.error("[Seminar Apply] Action Error:", e);
      return fail(500, { error: "Internal server error while processing seminar application." });
    }
  }
};
export {
  actions,
  load
};
