import { afterEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));

import { isMemoryBackend } from "./supabase";

/**
 * DATA_BACKEND=memory is an empty in-process database. A production server
 * configured with it used to run on that silently (audit LA35-1); now it
 * refuses, and production builds do not contain the backend at all.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  delete testEnv.DATA_BACKEND;
});

describe("isMemoryBackend", () => {
  it("is the memory backend in development and tests", () => {
    testEnv.DATA_BACKEND = "memory";
    expect(isMemoryBackend()).toBe(true);
  });

  it("is not, for any other setting", () => {
    testEnv.DATA_BACKEND = "supabase";
    expect(isMemoryBackend()).toBe(false);
    delete testEnv.DATA_BACKEND;
    expect(isMemoryBackend()).toBe(false);
  });

  it("refuses to run a production build on it", () => {
    vi.stubEnv("DEV", false);
    testEnv.DATA_BACKEND = "memory";
    expect(() => isMemoryBackend()).toThrow(/only available in development/);
  });
});
