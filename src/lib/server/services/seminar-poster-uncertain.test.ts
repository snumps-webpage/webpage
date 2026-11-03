// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

type Row = {
  id: string;
  requesterId: string;
  status: string;
  posterKey: string;
};
const state = vi.hoisted(() => ({
  rows: [] as Row[],
  assets: new Set<string>(),
  staging: true,
  commit: () => {},
  failure: "transport" as "transport" | "refusal",
}));
vi.mock("$lib/server/data/tables", async () => {
  const { AppError } = await import("$lib/server/core/errors");
  return {
    getTableFresh: async (name: string) =>
      name === "seminar-requests" ? state.rows : [],
    mutate: async (_name: string, update: (rows: Row[]) => Row[]) => {
      if (state.failure === "refusal") state.rows[0].status = "approved";
      const next = update(structuredClone(state.rows));
      // HTTP fails while the SQL request is still finishing. A fresh SELECT
      // before commit sees the old row even though that write later succeeds.
      state.commit = () => {
        state.rows = next;
      };
      throw new AppError("SERVICE_UNAVAILABLE");
    },
  };
});
vi.mock("$lib/server/data/flows", () => ({ callFlow: vi.fn() }));
vi.mock("$lib/server/services/uploads", () => ({
  promoteSeminarPoster: async () => {
    state.assets.add("posters/final.png");
    return "posters/final.png";
  },
}));
vi.mock("$lib/server/data/storage", () => ({
  removeStaged: async () => {
    state.staging = false;
  },
  removeAssets: async (keys: string[]) => {
    for (const key of keys) state.assets.delete(key);
  },
}));
import { updateSeminarRequest } from "./seminar-requests";

beforeEach(() => {
  state.rows = [
    { id: "request", requesterId: "owner", status: "pending", posterKey: "" },
  ];
  state.assets.clear();
  state.staging = true;
  state.failure = "transport";
  state.commit = () => {};
});

it("retains the copied poster when a lost response precedes the eventual DB commit", async () => {
  await expect(
    updateSeminarRequest(
      "request",
      { memberId: "owner", isAdmin: false },
      { title: "After" },
      "pending/seminar-poster/upload.png",
    ),
  ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  state.commit();
  expect(state.rows[0].posterKey).toBe("posters/final.png");
  expect(state.assets.has(state.rows[0].posterKey)).toBe(true);
  expect(state.staging).toBe(true);
});

it("reclaims the copied asset after a definite concurrent request refusal", async () => {
  state.failure = "refusal";
  await expect(
    updateSeminarRequest(
      "request",
      { memberId: "owner", isAdmin: false },
      { title: "After" },
      "pending/seminar-poster/upload.png",
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(state.rows[0].posterKey).toBe("");
  expect(state.assets.has("posters/final.png")).toBe(false);
  expect(state.staging).toBe(true);
});
