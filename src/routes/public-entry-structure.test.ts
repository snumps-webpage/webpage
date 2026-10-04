import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (name: string) =>
  readFileSync(new URL(name, import.meta.url), "utf8");
const guest = source("../lib/components/dashboard/GuestLanding.svelte");
const archive = source("./(public)/archive/+page.svelte");
const links = source("../lib/components/public/PublicRecordLinks.svelte");
const theme = source("../lib/manuscript.css");

describe("public entry source safeguards,not browser verification", () => {
  it("preserves the original homepage identity and Google sign-in", () => {
    expect(guest).toContain("SymbolBackground");
    expect(guest).toContain('class="paper-page cover-page"');
    expect(guest).toContain('class="paper-page abstract-page"');
    expect(guest).toContain('signIn("google")');
    expect(guest).toContain("@snu.ac.kr");
    expect(guest).toContain(
      'ExecutiveContacts roster={executives} variant="cover"',
    );
    expect(guest).not.toMatch(/mailto:|tel:/);
    expect(guest.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
    expect(theme.match(/scroll-snap-type: y mandatory/g)).toHaveLength(2);
  });
  it("keeps real record links semantic and provides visible focus targets", () => {
    expect(links).toContain("<ul");
    expect(links).toContain("href={entry.href}");
    expect(links).toContain("a:focus-visible");
    expect(links).toContain("min-height: 88px");
    expect(links).toContain('aria-hidden="true"');
    expect(archive).toContain("publicRecordGroups");
    expect(archive).toContain("aria-labelledby");
  });
  it("distinguishes unavailable snapshots from empty live public lists", () => {
    expect(archive).toContain("{#if !data.dataAvailable}");
    expect(archive).toContain("{:else if recordsEmpty}");
    expect(archive).toContain("data-sveltekit-reload");
    for (const name of [
      "seminars",
      "studies",
      "activities",
      "gallery",
      "projects",
    ])
      expect(archive).toContain(`data.archive.${name}.length === 0`);
    expect(archive).not.toContain("PublicDirectoryGrid");
    expect(archive).not.toContain("공개 전용 DTO");
    expect(archive).not.toMatch(/기타 수학\s*자료/);
    expect(archive).toContain("기타 기록 안내");
  });
});
