import { describe, expect, it } from "vitest";
import { API_ERROR_CODES, actionErrorText } from "./api";

// Forms rendered `message ?? error`; once the action wrapper stopped sending
// raw exception text (audit LB02-2) a failure showed the bare code
// "SERVICE_UNAVAILABLE". The code is the contract, never the text.
describe("actionErrorText", () => {
  it("prefers the server's Korean message", () => {
    expect(
      actionErrorText({ error: "CONFLICT", message: "이미 처리됨" }, "x"),
    ).toBe("이미 처리됨");
  });

  it("never shows a bare code", () => {
    for (const error of API_ERROR_CODES) {
      const text = actionErrorText({ error }, "실패했습니다.");
      expect(text).not.toBe(error);
      expect(text).not.toMatch(/^[A-Z_]+$/);
    }
    expect(actionErrorText({ error: "SOMETHING_NEW" }, "실패했습니다.")).toBe(
      "실패했습니다.",
    );
  });
});
