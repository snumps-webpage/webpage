import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARCHIVE_DIRECTORY } from "$lib/public-navigation";
import {
  primaryPublicRecords,
  publicRecordGroups,
  publicRecordLinks,
} from "./public-entry";

describe("public entry presentation preserves the existing directory", () => {
  it("contains all six existing destinations exactly once", () => {
    const grouped = publicRecordGroups.flatMap((group) => group.links);
    expect(grouped).toEqual(publicRecordLinks);
    expect(grouped.map((entry) => entry.href)).toEqual(
      ARCHIVE_DIRECTORY.map((entry) => entry.href),
    );
    expect(new Set(grouped.map((entry) => entry.href)).size).toBe(6);
  });
  it("gives the guest entry public academic records, never member actions", () => {
    expect(primaryPublicRecords.map((entry) => entry.href)).toEqual([
      "/archive/seminars",
      "/archive/studies",
      "/archive/activities",
    ]);
    expect(
      publicRecordLinks.every((entry) => entry.href.startsWith("/archive/")),
    ).toBe(true);
  });
  it("every destination resolves to an existing route file", () => {
    for (const entry of publicRecordLinks) {
      expect(
        existsSync(
          join(
            process.cwd(),
            "src/routes/(public)",
            entry.href,
            "+page.svelte",
          ),
        ),
      ).toBe(true);
    }
  });
  it("does not reinterpret directory source status as live data availability", () => {
    expect(
      ARCHIVE_DIRECTORY.map(({ href, status }) => ({ href, status })),
    ).toEqual([
      { href: "/archive/seminars", status: "available" },
      { href: "/archive/studies", status: "available" },
      { href: "/archive/activities", status: "available" },
      { href: "/archive/gallery", status: "source-pending" },
      { href: "/archive/projects", status: "available" },
      { href: "/archive/misc", status: "source-pending" },
    ]);
    expect(publicRecordLinks.every((entry) => !("status" in entry))).toBe(true);
  });
  it("uses visitor purposes rather than implementation codes or guaranteed records", () => {
    const copy = publicRecordLinks.map((entry) => entry.description).join(" ");
    expect(copy).not.toMatch(/DTO|PUB-|참석자 ID|운영 상태|종료한 활동만/);
    expect(copy).not.toMatch(/\d+개|\d+건/);
  });
});
