import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** AUTH-04: dedicated sign-in page; bounces authenticated users back. */
export const load: PageServerLoad = async ({ locals, url }) => {
  const session = await locals.auth();
  if (session?.user) {
    const target = url.searchParams.get("redirect") ?? "/";
    // Only same-site relative paths — never an absolute URL from the query.
    throw redirect(303, target.startsWith("/") && !target.startsWith("//") ? target : "/");
  }
  return { redirectTo: url.searchParams.get("redirect") ?? "/" };
};
