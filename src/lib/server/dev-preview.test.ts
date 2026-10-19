// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const devFlag = vi.hoisted(() => ({ value: false }));
const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$app/environment", () => ({
  get dev() {
    return devFlag.value;
  },
}));
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));

import {
  assertPreviewBypassAllowed,
  DEV_PREVIEW_COOKIE,
  previewLoginLanding,
  previewLoginResponse,
  resolveDevPreviewRole,
} from "./dev-preview";

const KEY = "k".repeat(40);

function jar(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const sets: { name: string; value: string; opts: Record<string, unknown> }[] =
    [];
  return {
    get: (n: string) => store.get(n),
    set: (n: string, v: string, opts: Record<string, unknown>) => {
      store.set(n, v);
      sets.push({ name: n, value: v, opts });
    },
    delete: (n: string) => void store.delete(n),
    serialize: (n: string, v: string, opts: Record<string, unknown>) =>
      `${n}=${v}; Max-Age=${opts.maxAge}${opts.httpOnly ? "; HttpOnly" : ""}${opts.secure ? "; Secure" : ""}`,
    store,
    sets,
  };
}
const url = (q: string) => new URL(`https://p.example/admin${q}`);
const resolve = (q: string, cookies: ReturnType<typeof jar>) =>
  resolveDevPreviewRole(url(q), cookies as never);

beforeEach(() => {
  devFlag.value = false;
  for (const k of Object.keys(testEnv)) delete testEnv[k];
});

function previewEnv() {
  testEnv.VERCEL_ENV = "preview";
  testEnv.PREVIEW_LOGIN_BYPASS = "on";
  testEnv.PREVIEW_LOGIN_KEY = KEY;
}

describe("local dev (unchanged)", () => {
  it("grants the role from the query and remembers it", () => {
    devFlag.value = true;
    const c = jar();
    expect(resolve("?dev_preview=admin", c)).toBe("admin");
    expect(resolve("", c)).toBe("admin");
  });
});

describe("production build outside a preview", () => {
  it("never grants a role", () => {
    const c = jar({ [DEV_PREVIEW_COOKIE]: "admin" });
    expect(resolve("?dev_preview=admin", c)).toBeNull();
    expect(resolve("", c)).toBeNull();
  });

  it("stays off on a preview without the flag or without a key", () => {
    testEnv.VERCEL_ENV = "preview";
    testEnv.PREVIEW_LOGIN_KEY = KEY;
    expect(resolve(`?dev_preview=admin&key=${KEY}`, jar())).toBeNull();
    testEnv.PREVIEW_LOGIN_BYPASS = "on";
    delete testEnv.PREVIEW_LOGIN_KEY;
    expect(resolve("?dev_preview=admin&key=", jar())).toBeNull();
  });

  it("stays off with a short key", () => {
    previewEnv();
    testEnv.PREVIEW_LOGIN_KEY = "short";
    expect(resolve("?dev_preview=admin&key=short", jar())).toBeNull();
  });
});

describe("Vercel preview with the bypass on (D-000177)", () => {
  it("needs the key on the first visit", () => {
    previewEnv();
    expect(resolve("?dev_preview=admin", jar())).toBeNull();
    expect(resolve("?dev_preview=admin&key=wrong", jar())).toBeNull();
  });

  it("grants the role with the key and sets a signed, http-only cookie", () => {
    previewEnv();
    const c = jar();
    expect(resolve(`?dev_preview=admin&key=${KEY}`, c)).toBe("admin");
    const set = c.sets.at(-1)!;
    expect(set.value).not.toBe("admin");
    expect(set.value.startsWith("admin.")).toBe(true);
    expect(set.opts).toMatchObject({ httpOnly: true, secure: true });
    // the signed cookie alone keeps the role on later requests
    expect(resolve("", c)).toBe("admin");
  });

  it("refuses a hand-made cookie without the signature", () => {
    previewEnv();
    expect(resolve("", jar({ [DEV_PREVIEW_COOKIE]: "admin" }))).toBeNull();
    expect(
      resolve("", jar({ [DEV_PREVIEW_COOKIE]: "admin.forged" })),
    ).toBeNull();
  });

  it("refuses a member cookie signature reused for admin", () => {
    previewEnv();
    const c = jar();
    resolve(`?dev_preview=member&key=${KEY}`, c);
    const [, exp, sig] = c.store.get(DEV_PREVIEW_COOKIE)!.split(".");
    expect(
      resolve("", jar({ [DEV_PREVIEW_COOKIE]: `admin.${exp}.${sig}` })),
    ).toBeNull();
  });

  // D-000184: the 8 hours are kept by the server, not only by the browser
  it("refuses the cookie after it expires, even if the browser keeps it", () => {
    previewEnv();
    const c = jar();
    resolve(`?dev_preview=admin&key=${KEY}`, c);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 8 * 60 * 60 * 1000 + 1000);
      expect(resolve("", c)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a cookie whose expiry was pushed forward by hand", () => {
    previewEnv();
    const c = jar();
    resolve(`?dev_preview=admin&key=${KEY}`, c);
    const [role, exp, sig] = c.store.get(DEV_PREVIEW_COOKIE)!.split(".");
    const later = String(Number(exp) + 10 * 60 * 60);
    expect(
      resolve("", jar({ [DEV_PREVIEW_COOKIE]: `${role}.${later}.${sig}` })),
    ).toBeNull();
  });

  it("dev_preview=off clears the cookie", () => {
    previewEnv();
    const c = jar();
    resolve(`?dev_preview=admin&key=${KEY}`, c);
    expect(resolve("?dev_preview=off", c)).toBeNull();
    expect(c.store.has(DEV_PREVIEW_COOKIE)).toBe(false);
  });
});

// D-000182: the key must not stay in the address bar, history or a share
describe("landing after the preview login", () => {
  it("drops key and dev_preview and keeps the rest of the address", () => {
    previewEnv();
    expect(
      previewLoginLanding(
        new URL(
          `https://p.example/admin/mail?x=1&dev_preview=admin&key=${KEY}`,
        ),
      ),
    ).toBe("/admin/mail?x=1");
  });

  it("redirects even on a wrong key, so no key-like value stays", () => {
    previewEnv();
    expect(previewLoginLanding(new URL("https://p.example/a?key=nope"))).toBe(
      "/a",
    );
  });

  it("does nothing without those parameters, in dev, or with the bypass off", () => {
    previewEnv();
    expect(previewLoginLanding(new URL("https://p.example/a?x=1"))).toBeNull();
    devFlag.value = true;
    expect(
      previewLoginLanding(new URL("https://p.example/a?dev_preview=admin")),
    ).toBeNull();
    devFlag.value = false;
    delete testEnv.PREVIEW_LOGIN_BYPASS;
    expect(
      previewLoginLanding(new URL(`https://p.example/a?key=${KEY}`)),
    ).toBeNull();
  });
});

describe("the preview login response", () => {
  const login = (q: string) =>
    previewLoginResponse(
      new URL(`https://p.example/admin/mail${q}`),
      jar() as never,
      { "cache-control": "private, no-store" },
    );

  it("redirects without the key, with the signed cookie in its own Set-Cookie", () => {
    previewEnv();
    const r = login(`?dev_preview=admin&key=${KEY}`)!;
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/admin/mail");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    const cookie = r.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^snumps_dev_preview=admin\.\d+\.[\w-]+;/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    // the written cookie is accepted on the next request
    const value = cookie.split(";")[0].split("=")[1];
    expect(resolve("", jar({ [DEV_PREVIEW_COOKIE]: value }))).toBe("admin");
  });

  it("redirects a wrong key with no cookie", () => {
    previewEnv();
    const r = login("?dev_preview=admin&key=wrong")!;
    expect(r.status).toBe(303);
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("clears the cookie on dev_preview=off", () => {
    previewEnv();
    const r = login("?dev_preview=off")!;
    expect(r.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("is null outside the preview bypass", () => {
    devFlag.value = true;
    expect(login("?dev_preview=admin")).toBeNull();
  });
});

describe("production guard", () => {
  it("throws when the flag is set on production", () => {
    testEnv.VERCEL_ENV = "production";
    testEnv.PREVIEW_LOGIN_BYPASS = "on";
    expect(() => assertPreviewBypassAllowed()).toThrow(/production/);
  });

  it("is quiet on preview and when the flag is unset", () => {
    previewEnv();
    expect(() => assertPreviewBypassAllowed()).not.toThrow();
    testEnv.VERCEL_ENV = "production";
    delete testEnv.PREVIEW_LOGIN_BYPASS;
    expect(() => assertPreviewBypassAllowed()).not.toThrow();
  });
});
