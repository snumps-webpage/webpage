import { error, redirect } from "@sveltejs/kit";

export interface AuthenticatedSession {
  user: {
    name: string;
    email: string;
    image?: string;
  };
  expires: string;
}

export async function ensureSession(
  locals: App.Locals,
  url?: URL,
): Promise<AuthenticatedSession> {
  const session = await locals.auth();
  if (!session?.user?.email || !session.user.name) {
    const loginPath = url
      ? `/login?redirectTo=${encodeURIComponent(`${url.pathname}${url.search}`)}`
      : "/login";
    throw redirect(302, loginPath);
  }
  return session as AuthenticatedSession;
}

export async function ensureAdmin(
  locals: App.Locals,
  options: { silent?: boolean } = {},
): Promise<AuthenticatedSession> {
  const session = await locals.auth();
  if (
    !session?.user?.email ||
    locals.member?.isAdmin !== true ||
    locals.member.status === "withdrawn"
  ) {
    if (options.silent) throw error(404, "Not Found");
    throw redirect(302, "/");
  }
  return session as AuthenticatedSession;
}
