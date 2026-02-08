import { j as json } from "../../../../../chunks/index.js";
import { isAdmin, getApplications } from "../../../../../chunks/admin.js";
const GET = async ({ locals }) => {
  const session = await locals.auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const apps = await getApplications();
  const sortedApps = apps.sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
  return json(sortedApps);
};
export {
  GET
};
