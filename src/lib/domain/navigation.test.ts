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
});
