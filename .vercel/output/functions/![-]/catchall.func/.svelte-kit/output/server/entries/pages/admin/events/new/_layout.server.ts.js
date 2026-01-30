import { redirect } from "@sveltejs/kit";
import { isAdmin } from "../../../../../chunks/admin.js";
const load = async (event) => {
  const session = await event.locals.auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    throw redirect(302, "/");
  }
  return {};
};
export {
  load
};
