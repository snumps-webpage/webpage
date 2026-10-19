import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchRaw, GmailQuotaError, GmailSendError } from "./client";

/**
 * dispatchRaw uploads a finished RFC 822 message as-is (.eml broadcast), so the
 * bytes must reach Gmail untouched and quota failures must be told apart from
 * other send failures (the caller stops the run on quota, never retries).
 */

const fetchSpy = vi.fn();
beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });
const errBody = (reason: string) => ({
  error: { errors: [{ reason }] },
});

describe("dispatchRaw", () => {
  it("uploads the raw bytes as message/rfc822", async () => {
    fetchSpy.mockResolvedValue(json(200, {}));
    const raw = Buffer.from("Subject: x\r\n\r\nbody\r\n");
    await dispatchRaw("tok", raw);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.headers["Content-Type"]).toBe("message/rfc822");
    // The body is the caller's own view, never a copy or the pool it was cut
    // from: fetch sends exactly byteOffset..byteOffset+byteLength.
    expect(init.body).toBe(raw);
    expect(init.body.byteLength).toBe(raw.byteLength);
  });

  it.each([
    "dailyLimitExceeded",
    "rateLimitExceeded",
    "quotaExceeded",
    "userRateLimitExceeded",
  ])("throws GmailQuotaError on the reason %s", async (reason) => {
    fetchSpy.mockResolvedValue(json(403, errBody(reason)));
    await expect(dispatchRaw("t", Buffer.from("x"))).rejects.toBeInstanceOf(
      GmailQuotaError,
    );
  });

  it("throws GmailQuotaError on 429", async () => {
    fetchSpy.mockResolvedValue(json(429, {}));
    await expect(dispatchRaw("t", Buffer.from("x"))).rejects.toBeInstanceOf(
      GmailQuotaError,
    );
  });

  it("throws GmailQuotaError on 429 with a non-JSON body", async () => {
    fetchSpy.mockResolvedValue(new Response("slow down", { status: 429 }));
    await expect(dispatchRaw("t", Buffer.from("x"))).rejects.toBeInstanceOf(
      GmailQuotaError,
    );
  });

  it("throws GmailSendError with empty reason on JSON without an error field", async () => {
    fetchSpy.mockResolvedValue(json(400, { message: "no error key" }));
    const err = await dispatchRaw("t", Buffer.from("x")).catch((e) => e);
    expect(err).toBeInstanceOf(GmailSendError);
    expect(err).not.toBeInstanceOf(GmailQuotaError);
    expect(err.reason).toBe("");
  });

  it("throws GmailSendError with status and reason otherwise", async () => {
    fetchSpy.mockResolvedValue(json(400, errBody("invalidArgument")));
    const err = await dispatchRaw("t", Buffer.from("x")).catch((e) => e);
    expect(err).toBeInstanceOf(GmailSendError);
    expect(err).not.toBeInstanceOf(GmailQuotaError);
    expect(err.status).toBe(400);
    expect(err.reason).toBe("invalidArgument");
  });

  it("throws GmailSendError with empty reason on a non-JSON body", async () => {
    fetchSpy.mockResolvedValue(new Response("oops", { status: 500 }));
    const err = await dispatchRaw("t", Buffer.from("x")).catch((e) => e);
    expect(err).toBeInstanceOf(GmailSendError);
    expect(err.status).toBe(500);
    expect(err.reason).toBe("");
  });
});
