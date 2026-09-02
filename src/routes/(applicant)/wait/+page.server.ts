import { redirect } from "@sveltejs/kit";
import { handleUserAction } from "$lib/server/auth-guards";
import { withdrawOwnApplication } from "$lib/server/services/membership";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { session, isMember, application, isAdmin } = await event.parent();

  if (!session?.user) throw redirect(302, "/");
  if (isMember && !isAdmin) throw redirect(302, "/");
  if (!application && !isAdmin) throw redirect(302, "/signup");

  return { user: session.user, application };
};

export const actions = {
  /** MEM-03: the applicant withdraws their own pending application. */
  withdrawApplication: async ({ locals }: { locals: App.Locals }) => {
    return handleUserAction(locals, async (session) => {
      await withdrawOwnApplication(session.user.email);
      throw redirect(303, "/");
    });
  },
};
