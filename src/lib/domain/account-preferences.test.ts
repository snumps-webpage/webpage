import { describe, expect, it } from "vitest";
import { preferenceFeedback } from "./account-preferences";

describe("account preference feedback", () => {
  it("distinguishes the two successful writes", () => {
    expect(
      preferenceFeedback({
        success: true,
        operation: "phonePreferenceUpdated",
      }),
    ).toEqual({ error: false, text: "전화번호 공개 설정을 저장했습니다." });
    expect(
      preferenceFeedback({ success: true, operation: "mailPreferenceUpdated" }),
    ).toEqual({ error: false, text: "공지 메일 설정을 저장했습니다." });
  });
  it("never invents success for absent or failed operation data", () => {
    expect(preferenceFeedback(null)).toBeNull();
    expect(preferenceFeedback({ success: true })).toBeNull();
    expect(
      preferenceFeedback({ operation: "phonePreferenceUpdated" }),
    ).toBeNull();
  });
  it("keeps privacy validation separate from mail feedback", () => {
    expect(
      preferenceFeedback({
        error: "VALIDATION_FAILED",
        operation: "phonePreferenceUpdated",
        issues: { hide: "공개 여부 확인" },
      }),
    ).toEqual({
      error: true,
      text: "전화번호 공개 설정을 저장하지 못했습니다. 공개 여부 확인",
    });
  });
  it("uses safe operational explanations rather than raw error codes", () => {
    expect(
      preferenceFeedback({
        error: "SERVICE_UNAVAILABLE",
        operation: "mailPreferenceUpdated",
      })?.text,
    ).toBe("공지 메일 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    expect(
      preferenceFeedback({
        error: "UNAUTHORIZED",
        operation: "phonePreferenceUpdated",
      })?.text,
    ).toContain("다시 로그인");
  });
  it("preserves safe server guidance", () => {
    expect(
      preferenceFeedback({
        error: "FORBIDDEN",
        operation: "phonePreferenceUpdated",
        message: "운영진 확인이 필요합니다.",
      })?.text,
    ).toContain("운영진 확인이 필요합니다.");
  });
});
