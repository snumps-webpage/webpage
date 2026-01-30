import { redirect } from "@sveltejs/kit";
const load = async (event) => {
  const { session, isMember, application, isAdmin } = await event.parent();
  if (!session?.user) {
    throw redirect(302, "/");
  }
  if (isMember && !isAdmin) {
    throw redirect(302, "/");
  }
  if (!application && !isAdmin) {
    throw redirect(302, "/signup");
  }
  return {
    user: session.user
  };
};
export {
  load
};
