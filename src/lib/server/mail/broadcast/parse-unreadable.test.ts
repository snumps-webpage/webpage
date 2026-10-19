import { describe, expect, it, vi } from "vitest";

// postal-mime은 쓰레기 입력에도 던지지 않으므로, 해석 예외 경로는 mock으로 시험함.
vi.mock("postal-mime", () => ({
  default: {
    parse: vi.fn(async () => {
      throw new Error("boom");
    }),
  },
}));

import { BroadcastParseError, parseEml } from "./parse";

describe("parseEml unreadable", () => {
  it("maps a parser exception to unreadable", async () => {
    const err = await parseEml(new Uint8Array([1, 2, 3])).catch((e) => e);
    expect(err).toBeInstanceOf(BroadcastParseError);
    expect(err.code).toBe("unreadable");
  });
});
