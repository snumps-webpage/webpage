import { beforeEach, describe, expect, it, vi } from "vitest";

const signed = vi.hoisted(() => ({ paths: [] as string[] }));
vi.mock("$lib/server/data/storage", () => ({
  createUploadUrl: async (path: string) => {
    signed.paths.push(path);
    return `https://staging.example.test/${path}?sig=1`;
  },
}));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import { POST } from "./+server";

/**
 * The presign endpoint typed its JSON body by assertion: a non-object body
 * crashed on `body.purpose`, and filename/contentType had no bound. It now
 * parses with presignBodySchema (the domain presign request minus the
 * client-side operationId) after the capability/admin checks and answers
 * 400 {error: VALIDATION_FAILED} — the REST envelope — without signing.
 */

const admin = {
  member: {
    memberId: "admin",
    privateInfoId: null,
    name: "관리자",
    status: "regular",
    isAdmin: true,
    isAlumni: false,
    registered: true,
    capabilities: [],
  },
  auth: async () => ({ user: { email: "admin@snu.ac.kr", name: "관리자" } }),
} as unknown as App.Locals;
const outsider = {
  member: null,
  auth: async () => null,
} as unknown as App.Locals;

function call(body: unknown, locals = admin, raw = false) {
  return POST({
    request: new Request("http://localhost/api/uploads/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
    locals,
  } as never);
}

const valid = {
  purpose: "gallery-photo",
  filename: "dinner.jpg",
  contentType: "image/jpeg",
  size: 1024,
};

beforeEach(() => {
  __reset();
  signed.paths = [];
});

describe("POST /api/uploads/presign", () => {
  it("signs a valid admin request", async () => {
    const response = await call(valid);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      s3Key: expect.stringMatching(/^pending\/gallery-photo\//),
    });
    expect(signed.paths).toHaveLength(1);
  });

  it.each([
    ["an unknown purpose", { purpose: "avatar" }],
    ["an empty filename", { filename: "  " }],
    ["an overlong filename", { filename: `${"a".repeat(200)}.jpg` }],
    ["an overlong content type", { contentType: `image/${"x".repeat(100)}` }],
    ["a fractional size", { size: 1.5 }],
    ["a zero size", { size: 0 }],
    ["a string size", { size: "1024" }],
  ])("refuses %s with 400 and signs nothing", async (_label, over) => {
    const response = await call({ ...valid, ...over });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "VALIDATION_FAILED" });
    expect(signed.paths).toEqual([]);
  });

  it.each([
    ["malformed JSON", "{", true],
    ["a null body", "null", true],
    ["an array body", "[]", true],
  ])("refuses %s with 400", async (_label, body, raw) => {
    const response = await call(body, admin, raw);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "VALIDATION_FAILED" });
  });

  it("still answers 403 before validating for a caller without rights", async () => {
    const response = await call({ purpose: "avatar" }, outsider);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "FORBIDDEN" });
  });

  it("keeps the per-purpose type check of the service", async () => {
    const response = await call({ ...valid, contentType: "application/pdf" });

    expect(response.status).toBe(400);
    expect(signed.paths).toEqual([]);
  });
});
