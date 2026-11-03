import { beforeEach, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock(
  "$lib/server/data/storage",
  () => import("$lib/server/data/storage-memory"),
);
const failures = vi.hoisted(() => ({ write: false }));
vi.mock("$lib/server/data/tables", async (original) => {
  const real = await original<typeof import("$lib/server/data/tables")>();
  return {
    ...real,
    mutate: async (...args: Parameters<typeof real.mutate>) => {
      if (failures.write && args[0] === "seminar-requests")
        throw new Error("synthetic store unavailable");
      return real.mutate(...args);
    },
  };
});

import { __reset as resetStore } from "$lib/server/data/store-memory";
import {
  __reset as resetStorage,
  __stageBytes,
  __exists,
  listBackups,
} from "$lib/server/data/storage-memory";
import { invalidateCache } from "$lib/server/cache";
import {
  getTable,
  mutate,
  _resetDataLayerForTests,
} from "$lib/server/data/tables";
import { TABLE_NAMES, type SeminarRequest } from "$lib/server/data/schemas";
import { submitSeminarRequest, updateSeminarRequest } from "./seminar-requests";

const pendingKey = "pending/seminar-poster/upload-figure.png";
const actor = { memberId: "owner", isAdmin: false };
const request: SeminarRequest = {
  id: "request",
  requesterId: "owner",
  status: "pending",
  title: "Before",
  description: "",
  prerequisites: "",
  duration: "",
  preferredTiming: "",
  presenterIds: ["owner"],
  attachment: "",
  posterKey: "",
  closedAs: null,
  kind: "regular",
  createdAt: "2026-11-04T00:00:00+09:00",
};
function stage() {
  __stageBytes(
    pendingKey,
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    "image/png",
  );
}

beforeEach(async () => {
  await resetStore();
  resetStorage();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  failures.write = false;
  for (const name of TABLE_NAMES) await invalidateCache(`table_${name}`);
});

for (const scenario of ["missing", "forbidden", "closed"] as const) {
  it(`leaves the upload untouched when request is ${scenario}`, async () => {
    stage();
    if (scenario !== "missing")
      await mutate("seminar-requests", () => [
        { ...request, status: scenario === "closed" ? "approved" : "pending" },
      ]);
    await expect(
      updateSeminarRequest(
        "request",
        scenario === "forbidden" ? { ...actor, memberId: "other" } : actor,
        { title: "After" },
        pendingKey,
      ),
    ).rejects.toMatchObject({
      code:
        scenario === "missing"
          ? "NOT_FOUND"
          : scenario === "forbidden"
            ? "FORBIDDEN"
            : "CONFLICT",
    });
    expect(__exists("staging", pendingKey)).toBe(true);
    expect(await listBackups("assets-mirror")).toEqual([]);
  });
}

it("preserves the pending upload and supports retry after a failed write", async () => {
  stage();
  await mutate("seminar-requests", () => [request]);
  failures.write = true;
  await expect(
    updateSeminarRequest("request", actor, { title: "After" }, pendingKey),
  ).rejects.toThrow("synthetic store unavailable");
  expect(__exists("staging", pendingKey)).toBe(true);
  expect((await getTable("seminar-requests"))[0].posterKey).toBe("");
  failures.write = false;
  await updateSeminarRequest("request", actor, { title: "After" }, pendingKey);
  const saved = (await getTable("seminar-requests"))[0];
  expect(saved.title).toBe("After");
  expect(saved.posterKey).not.toBe("");
  expect(__exists("assets", saved.posterKey)).toBe(true);
  expect(__exists("staging", pendingKey)).toBe(false);
});

it("retains a poster when creating a proposal fails before DB commit", async () => {
  stage();
  failures.write = true;
  const input = {
    title: "Synthetic",
    description: "",
    prerequisites: "",
    duration: "",
    preferredTiming: "",
    presenterIds: ["owner"],
    attachment: "",
    requesterId: "owner",
    posterPendingKey: pendingKey,
  };
  await expect(submitSeminarRequest(input)).rejects.toThrow(
    "synthetic store unavailable",
  );
  expect(__exists("staging", pendingKey)).toBe(true);
  failures.write = false;
  const row = await submitSeminarRequest(input);
  expect(__exists("assets", row.posterKey)).toBe(true);
});
