import { describe, expect, it } from "vitest";
import { externalHref } from "./links";

// Stored URLs reach public and admin pages as `href`; only forms checked the
// scheme, and rows written by the Notion migration never went through a form
// (audit LC13-1, LA29-7). Svelte does not filter `javascript:` at runtime.
describe("externalHref", () => {
  it("passes http(s) URLs through", () => {
    expect(externalHref("https://example.com/a")).toBe("https://example.com/a");
    expect(externalHref("http://example.com")).toBe("http://example.com");
    expect(externalHref("HTTPS://Example.com/x")).toBe("HTTPS://Example.com/x");
  });

  it("drops script and other schemes", () => {
    expect(externalHref("javascript:alert(1)")).toBeNull();
    expect(externalHref(" javascript:alert(1)")).toBeNull();
    expect(externalHref("data:text/html,<b>x</b>")).toBeNull();
    expect(externalHref("vbscript:x")).toBeNull();
  });

  it("drops what is not an absolute URL", () => {
    expect(externalHref("")).toBeNull();
    expect(externalHref(null)).toBeNull();
    expect(externalHref(undefined)).toBeNull();
    expect(externalHref("example.com")).toBeNull();
    expect(externalHref("https://")).toBeNull();
  });
});
