import { describe, expect, it } from "vitest";
import { stripInvisibles } from "./strings";

/**
 * S7 실측 대응 함수인데 테스트가 없었다. 가입 신청·임원 등록·회원 수정이 전부
 * 이걸 거치므로, 문자 클래스를 손대는 변경은 등가임을 증명한 뒤에만 해야 한다.
 *
 * 코드포인트를 이스케이프로 적는다 — 리터럴 비가시 문자를 넣으면 이 테스트가
 * 무엇을 주장하는지 눈으로 확인할 수 없다.
 */

const STRIPPED: [string, string][] = [
  ["U+00AD soft hyphen", "\u00AD"],
  ["U+200B zero-width space", "\u200B"],
  ["U+200C zero-width non-joiner", "\u200C"],
  ["U+200D zero-width joiner", "\u200D"],
  ["U+FEFF BOM", "\uFEFF"],
  ["U+2060 word joiner", "\u2060"],
];

const KEPT: [string, string][] = [
  ["U+0020 space", " "],
  ["U+00A0 no-break space", "\u00A0"],
  ["U+3000 ideographic space", "\u3000"],
  ["U+200E left-to-right mark", "\u200E"],
  ["U+2061 function application", "\u2061"],
];

describe("stripInvisibles", () => {
  it.each(STRIPPED)("removes %s", (_label, ch) => {
    expect(stripInvisibles(`김${ch}수학`)).toBe("김수학");
  });

  it.each(KEPT)("keeps %s", (_label, ch) => {
    expect(stripInvisibles(`김${ch}수학`)).toBe(`김${ch}수학`);
  });

  it("removes every occurrence, not just the first", () => {
    expect(stripInvisibles("\u200Ba\u200Bb\u200B")).toBe("ab");
  });

  it("leaves ordinary text untouched", () => {
    expect(stripInvisibles("홍길동 / 학부생 / 수리과학부")).toBe(
      "홍길동 / 학부생 / 수리과학부",
    );
    expect(stripInvisibles("")).toBe("");
  });
});
