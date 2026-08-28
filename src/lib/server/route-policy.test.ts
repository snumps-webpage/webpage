import { describe, expect, it } from "vitest";
import { matchesPathRoot, shouldBypassMembershipGuard } from "./route-policy";

describe("route policy", () => {
  it("matches only complete path segments", () => {
    expect(matchesPathRoot("/about", "/about")).toBe(true);
    expect(matchesPathRoot("/about/executives", "/about")).toBe(true);
    expect(matchesPathRoot("/about-us", "/about")).toBe(false);
  });

  it("bypasses public pages and API handlers without opening adjacent pages", () => {
    for (const path of [
      "/",
      "/members",
      "/login",
      "/about/executives",
      "/archive/studies",
      "/robots.txt",
      "/sitemap.xml",
      "/favicon.ico",
      "/auth/callback/google",
      "/api/cron/sync-events",
    ]) {
      expect(shouldBypassMembershipGuard(path), path).toBe(true);
    }
    for (const path of [
      "/member",
      "/members/secret",
      "/about-us",
      "/archived",
      "/admin",
      "/settings/notifications",
      "/settings/withdraw",
      "/withdraw/pending",
    ]) {
      expect(shouldBypassMembershipGuard(path), path).toBe(false);
    }
    expect(shouldBypassMembershipGuard("/api/admin/applications")).toBe(true);
  });
});
