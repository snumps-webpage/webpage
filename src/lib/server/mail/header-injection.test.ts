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
  // The stored-email rule (z.email) accepts an apostrophe; refusing it here
  // failed a whole Bcc batch over one member (review L1). It cannot add a
  // header or a recipient.
  it("accepts an apostrophe in the local part", async () => {
    await expect(
      dispatchEmail("token", ["o'neil@snu.ac.kr"], "제목", "본문"),
    ).resolves.not.toThrow();
  });

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

/** The RFC 2822 message the Gmail API received, decoded from `raw`. */
function sentMessage(): string {
  const init = (fetchSpy.mock.calls[0] as unknown[])[1] as RequestInit;
  const { raw } = JSON.parse(String(init.body)) as { raw: string };
  return Buffer.from(raw, "base64url").toString("utf8");
}

describe("recipient headers", () => {
  // The Gmail API answers 400 "Invalid To header" to the empty group
  // `To: undisclosed-recipients:;` — every all-member send was refused
  // (live probe 2026-10-17, snumps-webpage/D-000143). A Bcc-only message
  // carries no To: at all.
  it("sends a Bcc batch with a Bcc header and no To header", async () => {
    await dispatchEmail(
      "token",
      ["a@snu.ac.kr", "b@snu.ac.kr"],
      "제목",
      "본문",
      {
        bcc: true,
      },
    );
    const headers = sentMessage().split("\r\n\r\n")[0].split("\r\n");
    expect(headers).toContain("Bcc: a@snu.ac.kr, b@snu.ac.kr");
    expect(headers.some((h) => /^To:/i.test(h))).toBe(false);
  });

  it("folds a 400-recipient Bcc header between addresses (D-000225)", async () => {
    const many = Array.from({ length: 400 }, (_, i) => `member${i}@snu.ac.kr`);
    await dispatchEmail("token", many, "제목", "본문", { bcc: true });
    const head = sentMessage().split("\r\n\r\n")[0];
    const lines = head.split("\r\n");
    expect(lines.every((l) => l.length <= 78)).toBe(true);
    expect(lines.some((l) => /^To:/i.test(l))).toBe(false);
    // 접은 줄을 펴면 원래 목록과 같음(이어지는 줄은 공백으로 시작)
    const unfolded = head.replace(/\r\n(?=[ \t])/g, "");
    const bcc = unfolded.split("\r\n").find((l) => l.startsWith("Bcc:"));
    expect(
      bcc
        ?.slice(4)
        .split(",")
        .map((s) => s.trim()),
    ).toEqual(many);
  });

  it("sends a direct mail with a To header and no Bcc header", async () => {
    await dispatchEmail("token", ["a@snu.ac.kr"], "제목", "본문");
    const headers = sentMessage().split("\r\n\r\n")[0].split("\r\n");
    expect(headers).toContain("To: a@snu.ac.kr");
    expect(headers.some((h) => /^Bcc:/i.test(h))).toBe(false);
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
