import { describe, expect, it, vi } from "vitest";

/**
 * The archive layout runs for every page beneath it — including the notice
 * pages (`/archive/problems`, `/discussions`, `/misc`, `/misc/integration-bee`)
 * that display none of the snapshot. Before prerendering was removed those four
 * were static files and survived a dead data layer; now they are rendered, so a
 * throw from the layout would take them down with it.
 *
 * `dataAvailable` is the field that exists to say so. Its consumers (five
 * archive pages) were dead code until the producer was written, so this test
 * pins the producer: reads fail, the load still returns, and it says false.
 */

vi.mock("$lib/server/data/tables", () => ({
  getTable: vi.fn(async () => {
    throw new Error("store unreachable");
  }),
}));

import { load } from "./+layout.server";

describe("archive layout when the data layer is unreachable", () => {
  it("returns instead of throwing, so the notice pages still render", async () => {
    const data = (await load({} as never)) as {
      dataAvailable: boolean;
      archive: Record<string, unknown[]>;
      generatedAt: string;
    };

    expect(data.dataAvailable).toBe(false);
  });

  it("ships an empty snapshot rather than a partial one", async () => {
    const { archive } = (await load({} as never)) as {
      archive: Record<string, unknown[]>;
    };

    // Every key present and empty — the consumers destructure them unguarded.
    expect(Object.keys(archive).sort()).toEqual([
      "activities",
      "gallery",
      "projects",
      "seminars",
      "studies",
    ]);
    expect(
      Object.values(archive).every((v) => Array.isArray(v) && v.length === 0),
    ).toBe(true);
  });

  it("still stamps generatedAt", async () => {
    const { generatedAt } = (await load({} as never)) as {
      generatedAt: string;
    };
    expect(Number.isNaN(Date.parse(generatedAt))).toBe(false);
  });
});
