import { describe, expect, it } from "vitest";
import { byCreatedAtAsc } from "./admin-queue-views";

/**
 * FRONTEND-DECISIONS §3-5 sets one rule for all three admin queues: oldest
 * pending request first. Only `applications` sorted; the other two relied on
 * insertion order, which the migration importer does not preserve — it stacks
 * rows in Notion page order. One comparator, six call sites.
 */

describe("byCreatedAtAsc", () => {
  it("puts the oldest request first", () => {
    const rows = [
      { createdAt: "2026-09-03T10:00:00+09:00", id: "c" },
      { createdAt: "2026-09-01T10:00:00+09:00", id: "a" },
      { createdAt: "2026-09-02T10:00:00+09:00", id: "b" },
    ];

    expect([...rows].sort(byCreatedAtAsc).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  // 08-31T20:00Z is the later instant, but sorts first as a string because the
  // other row's local date reads 09-01. Offsets are stored, so compare instants.
  it("orders across offsets by instant, not by string", () => {
    const rows = [
      { createdAt: "2026-08-31T20:00:00+00:00", id: "utc-evening" },
      { createdAt: "2026-09-01T00:30:00+09:00", id: "kst-past-midnight" }, // = 08-31T15:30Z
    ];

    expect([...rows].sort(byCreatedAtAsc).map((r) => r.id)).toEqual([
      "kst-past-midnight",
      "utc-evening",
    ]);
  });
});
