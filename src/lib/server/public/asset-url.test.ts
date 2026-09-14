import { afterEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));

import { assetUrl } from "./archive";

/**
 * With no CDN configured, assetUrl used to return "/assets-unavailable/<key>",
 * a diagnostic string in the slot where a URL goes. No route serves it, and the
 * gallery's `{#if item.thumbnailUrl && item.displayUrl}` guard treats a
 * non-empty string as a usable image — so the placeholder branch was skipped
 * and the browser rendered a broken-image icon (W-8 / K-2).
 */

afterEach(() => {
  delete testEnv.ASSETS_CDN_URL;
});

describe("assetUrl", () => {
  it("builds a CDN URL when one is configured", () => {
    testEnv.ASSETS_CDN_URL = "https://cdn.example/assets/";

    expect(assetUrl("gallery/a.jpg")).toBe(
      "https://cdn.example/assets/gallery/a.jpg",
    );
  });

  it("returns an empty string when no CDN is configured, so the guard holds", () => {
    expect(assetUrl("gallery/a.jpg")).toBe("");
  });
});
