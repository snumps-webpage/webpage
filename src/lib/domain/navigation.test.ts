import { describe, expect, it } from "vitest";
import { safeInternalRedirect } from "./navigation";

describe("safeInternalRedirect", () => {
  it("keeps internal paths with query strings", () => {
    expect(safeInternalRedirect("/settings/notifications?source=mail")).toBe(
      "/settings/notifications?source=mail",
    );
  });

  it("rejects absolute, protocol-relative and backslash redirects", () => {
    expect(safeInternalRedirect("https://example.com")).toBe("/");
    expect(safeInternalRedirect("//example.com/path")).toBe("/");
    expect(safeInternalRedirect("/\\example.com/path")).toBe("/");
  });

  // Found by the adversarial HTTP run: the URL parser resolves dot-segments,
  // so a value that passes the raw-string check can come OUT as "//host".
  it.each([
    "/.//example.com",
    "/%2e//example.com",
    "/..//example.com",
    "/a/..//example.com",
    "/%2E%2E//example.com",
    "/./\\example.com",
    "/.\\\\example.com",
    "/.///example.com/x",
  ])("rejects %s, which normalizes to a protocol-relative path", (value) => {
    expect(safeInternalRedirect(value)).toBe("/");
  });

  it("still resolves harmless dot-segments inside the site", () => {
    expect(safeInternalRedirect("/study/../archive")).toBe("/archive");
  });
});
