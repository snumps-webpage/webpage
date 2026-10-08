import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (name: string) =>
  readFileSync(new URL(name, import.meta.url), "utf8");
const layout = source("./+layout.svelte");
const home = source("./(public)/+page.svelte");
describe("home/navigation source safeguards,not browser verification", () => {
  it("desktop and mobile render the same guarded navigation model", () => {
    expect(layout).toContain("memberNavigation({");
    expect(layout).toContain("navigation.publicLinks");
    expect(layout).toContain("navigation.memberLinks");
    expect(layout).toContain("navigation.adminLinks");
    expect(layout).not.toContain(">Seminar<");
  });
  it("closed menu keeps its controlled DOM target and supports Escape and resize exit", () => {
    expect(layout).toContain('id="mobile-nav-menu"');
    expect(layout).toContain("hidden={!isMobileMenuOpen}");
    expect(layout).toContain('event.key === "Escape"');
    expect(layout).toContain("menuToggle?.focus()");
    expect(layout).toContain("window.innerWidth > 900");
  });
  it("authenticated errors have a real reload action instead of the guest login cover", () => {
    const fail = home.slice(
      home.indexOf('<article class="paper-document dashboard-error"'),
    );
    expect(fail).toContain("data-sveltekit-reload");
    expect(fail.split("{:else}")[0]).not.toContain("GuestLanding");
  });
  it("profile editing appears after the actual activity ledger", () => {
    expect(home.indexOf("<DashboardActivityLedger")).toBeLessThan(
      home.indexOf("<DashboardProfilePanel"),
    );
    expect(home).toContain("canManageSelf={data.canManageSelf}");
  });
  it("home shortcuts point at actual existing sections/destinations", () => {
    expect(home).toContain('href="#home-activities"');
    expect(home).toContain('href="/study"');
    expect(home).toContain('href="/seminar/apply"');
    expect(home).toContain('id="home-profile"');
  });
});
