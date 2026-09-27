import { describe, expect, it } from "vitest";
import { formatPhoneForDisplay } from "./utils";

/**
 * The Notion archive kept a few numbers as bare digits ("010XXXXXXXX"). They
 * are shown as stored everywhere else, so only that one shape is reformatted.
 */
describe("formatPhoneForDisplay", () => {
  it("hyphenates a bare 11-digit 010 number", () => {
    expect(formatPhoneForDisplay("01012345678")).toBe("010-1234-5678");
  });

  it("leaves an already formatted number alone", () => {
    expect(formatPhoneForDisplay("010-1234-5678")).toBe("010-1234-5678");
  });

  it.each(["", "0212345678", "0111234567", "+82 10-1234-5678", "010123456789"])(
    "leaves any other shape as stored (%s)",
    (value) => {
      expect(formatPhoneForDisplay(value)).toBe(value);
    },
  );
});
