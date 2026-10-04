import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
const guest = read("../lib/components/dashboard/GuestLanding.svelte");
const layout = read("./+layout.svelte");
const theme = read("../lib/manuscript.css");

describe("original public homepage restoration,source-only verification", () => {
  it("keeps GuestLanding byte-identical to the original main source", () => {
    expect(createHash("sha256").update(guest).digest("hex")).toBe(
      "e0c9b5a992cf65a542015e2add1a0eb181253faada3cf55cb414bd66445e8987",
    );
  });
  it("keeps cover,logo,background symbols,contacts,Abstract and their original order", () => {
    expect(guest).toContain(
      "<SymbolBackground date={MANUSCRIPT.FOUNDATION_DATE}",
    );
    expect(guest).toContain('class="paper-logo"');
    expect(guest.indexOf("<ExecutiveContacts")).toBeLessThan(
      guest.indexOf("google-login-btn"),
    );
    expect(guest.indexOf("google-login-btn")).toBeLessThan(
      guest.indexOf('class="paper-page abstract-page"'),
    );
    expect(guest).toContain("Section I: Abstract");
  });
  it("scopes original guest navigation styling without removing member hierarchy", () => {
    expect(layout).toContain("{#if isGuestLanding}");
    for (const label of ["About", "Archive", "Members"])
      expect(layout).toContain(`>${label}</a>`);
    expect(layout).toContain("{#if !isGuestLanding}");
    expect(layout).toContain("navigation.memberLinks");
    expect(layout).toContain('isGuestLanding && link.href === "/archive"');
    expect(layout).toContain(".global-nav.guest-latex .guest-wordmark");
    expect(layout).toContain(
      "@media (min-width: 769px) and (max-width: 900px)",
    );
    expect(layout).toContain("isGuestLanding && window.innerWidth > 768");
  });
  it("restores original guest scroll snap while retaining the approved paper palette", () => {
    expect(theme.match(/scroll-snap-type: y mandatory/g)).toHaveLength(2);
    expect(theme).toContain("--latex-bg: #e7e3da");
    expect(theme).toContain("--latex-muted: #575a53");
  });
});
