import { createHmac, timingSafeEqual } from "node:crypto";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import type { Cookies } from "@sveltejs/kit";

export const DEV_PREVIEW_COOKIE = "snumps_dev_preview";
export const DEV_PREVIEW_MEMBER_EMAIL = "dev-member@snu.ac.kr";
export const DEV_PREVIEW_ADMIN_EMAIL = "dev-admin@snu.ac.kr";

export type DevPreviewRole = "member" | "admin";

const COOKIE_MAX_AGE = 60 * 60 * 8;
const MIN_KEY_LENGTH = 32;

function isRole(value: string | null | undefined): value is DevPreviewRole {
  return value === "member" || value === "admin";
}

/**
 * The preview deploy's own login bypass (snumps-webpage/D-000177): Google
 * OAuth does not accept preview hosts, so a Vercel preview can turn the dev
 * preview roles on — but only with the flag AND a long key in its Preview env.
 * The preview holds the real Gmail token, so the key, not Vercel's SSO alone,
 * is what keeps a stranger from becoming an admin there.
 */
function previewKey(): string | null {
  if (env.VERCEL_ENV !== "preview") return null;
  if (env.PREVIEW_LOGIN_BYPASS !== "on") return null;
  const key = env.PREVIEW_LOGIN_KEY ?? "";
  return key.length >= MIN_KEY_LENGTH ? key : null;
}

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// The role and its expiry are signed with the key: a cookie written or
// extended by hand is not a login, and the server keeps the 8 hours itself
// (snumps-webpage/D-000184).
const sign = (role: DevPreviewRole, exp: number, key: string) =>
  createHmac("sha256", key)
    .update(`dev-preview:${role}:${exp}`)
    .digest("base64url");

const nowSeconds = () => Math.floor(Date.now() / 1000);

function signedCookie(role: DevPreviewRole, key: string): string {
  const exp = nowSeconds() + COOKIE_MAX_AGE;
  return `${role}.${exp}.${sign(role, exp, key)}`;
}

function roleFromSignedCookie(
  value: string | undefined,
  key: string,
): DevPreviewRole | null {
  const parts = value?.split(".") ?? [];
  if (parts.length !== 3) return null;
  const [role, expText, sig] = parts;
  if (!isRole(role) || !/^\d+$/.test(expText)) return null;
  const exp = Number(expText);
  if (exp <= nowSeconds()) return null;
  return sameText(sig, sign(role, exp, key)) ? role : null;
}

/**
 * Where to send the browser after a preview login: the same address without
 * `key` and `dev_preview`, so the key does not stay in the address bar, the
 * history or a shared link (snumps-webpage/D-000182). Null when nothing needs
 * removing, in local dev, or when the bypass is off.
 */
export function previewLoginLanding(url: URL): string | null {
  if (dev || !previewKey()) return null;
  if (!url.searchParams.has("key") && !url.searchParams.has("dev_preview"))
    return null;
  const clean = new URL(url);
  clean.searchParams.delete("key");
  clean.searchParams.delete("dev_preview");
  return `${clean.pathname}${clean.search}`;
}

const PREVIEW_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  maxAge: COOKIE_MAX_AGE,
} as const;

/**
 * The preview login itself: check the key, write the signed cookie and send
 * the browser to the address without `key`/`dev_preview` (D-000177·182). The
 * cookie goes into this response's own Set-Cookie — SvelteKit attaches
 * `event.cookies` only to resolved responses and thrown redirects, not to a
 * Response a handle returns. A wrong key still redirects, with no cookie.
 */
export function previewLoginResponse(
  url: URL,
  cookies: Cookies,
  extraHeaders: Record<string, string> = {},
): Response | null {
  const landing = previewLoginLanding(url);
  const key = previewKey();
  if (!landing || !key) return null;
  const headers = new Headers(extraHeaders);
  headers.set("location", landing);
  headers.set("referrer-policy", "no-referrer");
  const role = url.searchParams.get("dev_preview");
  if (role === "off") {
    headers.append(
      "set-cookie",
      cookies.serialize(DEV_PREVIEW_COOKIE, "", {
        ...PREVIEW_COOKIE_OPTIONS,
        maxAge: 0,
      }),
    );
  } else if (isRole(role) && sameText(url.searchParams.get("key") ?? "", key)) {
    headers.append(
      "set-cookie",
      cookies.serialize(
        DEV_PREVIEW_COOKIE,
        signedCookie(role, key),
        PREVIEW_COOKIE_OPTIONS,
      ),
    );
  }
  return new Response(null, { status: 303, headers });
}

/**
 * Refuse to run a production deploy with the bypass flag set — the same
 * stance as DATA_BACKEND=memory (audit LA35-1). Called on every request by the
 * hook, so a mis-set env answers 500 rather than serving a bypass.
 */
export function assertPreviewBypassAllowed(): void {
  if (env.VERCEL_ENV === "production" && env.PREVIEW_LOGIN_BYPASS) {
    throw new Error(
      "PREVIEW_LOGIN_BYPASS is set on a production deploy — remove it",
    );
  }
}

export function resolveDevPreviewRole(
  url: URL,
  cookies: Cookies,
): DevPreviewRole | null {
  const key = dev ? null : previewKey();
  if (!dev && !key) return null;

  const fromQuery = url.searchParams.get("dev_preview");

  if (fromQuery === "off") {
    cookies.delete(DEV_PREVIEW_COOKIE, { path: "/" });
    return null;
  }

  if (isRole(fromQuery)) {
    if (key) {
      if (!sameText(url.searchParams.get("key") ?? "", key)) return null;
      cookies.set(
        DEV_PREVIEW_COOKIE,
        signedCookie(fromQuery, key),
        PREVIEW_COOKIE_OPTIONS,
      );
      return fromQuery;
    }
    cookies.set(DEV_PREVIEW_COOKIE, fromQuery, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
    });
    return fromQuery;
  }

  const fromCookie = cookies.get(DEV_PREVIEW_COOKIE);
  if (key) return roleFromSignedCookie(fromCookie, key);
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
