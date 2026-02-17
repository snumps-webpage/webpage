import { dev } from "$app/environment";
import type { Cookies } from "@sveltejs/kit";

export const DEV_PREVIEW_COOKIE = "snumps_dev_preview";
export const DEV_PREVIEW_MEMBER_EMAIL = "dev-member@snu.ac.kr";
export const DEV_PREVIEW_ADMIN_EMAIL = "dev-admin@snu.ac.kr";

export type DevPreviewRole = "member" | "admin";

function isRole(value: string | null | undefined): value is DevPreviewRole {
  return value === "member" || value === "admin";
}

export function resolveDevPreviewRole(
  url: URL,
  cookies: Cookies,
): DevPreviewRole | null {
  if (!dev) return null;

  const fromQuery = url.searchParams.get("dev_preview");

  if (fromQuery === "off") {
    cookies.delete(DEV_PREVIEW_COOKIE, { path: "/" });
    return null;
  }

  if (isRole(fromQuery)) {
    cookies.set(DEV_PREVIEW_COOKIE, fromQuery, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
    });
    return fromQuery;
  }

  const fromCookie = cookies.get(DEV_PREVIEW_COOKIE);
  if (isRole(fromCookie)) return fromCookie;

  return null;
}

export function buildDevPreviewSession(role: DevPreviewRole) {
  const profile =
    role === "admin"
      ? {
          id: "dev-admin",
          name: "Dev Admin / 운영진 / 수리과학부",
          email: DEV_PREVIEW_ADMIN_EMAIL,
        }
      : {
          id: "dev-member",
          name: "Dev Member / 학부생 / 수리과학부",
          email: DEV_PREVIEW_MEMBER_EMAIL,
        };

  return {
    user: {
      ...profile,
      image: null,
    },
    expires: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
  };
}
