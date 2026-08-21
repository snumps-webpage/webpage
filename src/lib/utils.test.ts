import { describe, it, expect } from "vitest";
import {
  PHONE_HTML_PATTERN,
  isValidPhoneNumber,
  normalizePhoneNumber,
} from "./utils";

describe("isValidPhoneNumber", () => {
  it("accepts 11-digit mobile numbers", () => {
    expect(isValidPhoneNumber("01012345678")).toBe(true);
    expect(isValidPhoneNumber("010-1234-5678")).toBe(true);
    expect(isValidPhoneNumber("010 1234 5678")).toBe(true);
  });

  it("accepts 10-digit numbers, including area codes", () => {
    expect(isValidPhoneNumber("0311234567")).toBe(true);
    expect(isValidPhoneNumber("031-123-4567")).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(isValidPhoneNumber("  010-1234-5678  ")).toBe(true);
  });

  it("rejects empty input", () => {
    expect(isValidPhoneNumber("")).toBe(false);
    expect(isValidPhoneNumber("   ")).toBe(false);
  });

  it("rejects numbers not starting with 0", () => {
    expect(isValidPhoneNumber("11012345678")).toBe(false);
  });

  it("rejects wrong digit counts", () => {
    expect(isValidPhoneNumber("010123456")).toBe(false); // 9
    expect(isValidPhoneNumber("010123456789")).toBe(false); // 12
  });

  it("rejects non-digit, non-separator characters", () => {
    expect(isValidPhoneNumber("010-1234-567a")).toBe(false);
    expect(isValidPhoneNumber("+82-10-1234-5678")).toBe(false);
  });
});

describe("normalizePhoneNumber", () => {
  it("formats 11 digits as 3-4-4", () => {
    expect(normalizePhoneNumber("01012345678")).toBe("010-1234-5678");
    expect(normalizePhoneNumber("010 1234 5678")).toBe("010-1234-5678");
  });

  it("formats 10 digits as 3-3-4", () => {
    expect(normalizePhoneNumber("0311234567")).toBe("031-123-4567");
  });

  it("returns the input untouched when the length is unexpected", () => {
    expect(normalizePhoneNumber("123")).toBe("123");
  });
});

describe("PHONE_HTML_PATTERN", () => {
  // The browser anchors `pattern` implicitly; mirror that when testing.
  const re = new RegExp(`^(?:${PHONE_HTML_PATTERN})$`);

  it("matches every form the validator accepts", () => {
    for (const value of [
      "01012345678",
      "010-1234-5678",
      "0311234567",
      "031-123-4567",
    ]) {
      expect(re.test(value)).toBe(true);
    }
  });

  it("rejects the old 11-digit-only assumptions", () => {
    expect(re.test("010123456")).toBe(false);
    expect(re.test("1234567890")).toBe(false);
  });
});
