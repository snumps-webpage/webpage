import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import { AppError } from "$lib/server/core/errors";
import { dispatchEmail } from "./client";
import { sendTestTemplate } from "$lib/server/services/mail-admin";

/**
 * The raw message is assembled by joining header lines, and the admin
 * test-send address was checked with an unanchored /.+@.+\..+/. An address
 * carrying CR/LF therefore added headers of its choosing — a hidden Bcc list
 * the club's mail account would send to (audit LB23-6 / LB10-1, confirmed).
 */

const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
beforeEach(async () => {
  await __reset();
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

const INJECTED = "admin@snu.ac.kr\r\nBcc: someone@example.com";

describe("dispatchEmail", () => {
  it.each([
    INJECTED,
    "a@snu.ac.kr\nBcc: b@example.com",
    "a@snu.ac.kr, b@example.com",
    "Name <a@snu.ac.kr>",
    "not-an-address",
  ])("refuses a recipient that is not exactly one address: %j", async (to) => {
    await expect(dispatchEmail("token", [to], "제목", "본문")).rejects.toThrow(
      /recipient/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends to plain addresses", async () => {
    await dispatchEmail(
      "token",
      ["a@snu.ac.kr", "b.c+d@example.co.kr"],
      "제목",
      "본문",
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("admin test send", () => {
  it("refuses an address with a line break before any token is fetched", async () => {
    await expect(
      sendTestTemplate(INJECTED, "signup-received"),
    ).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "VALIDATION_FAILED",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
