import { describe, expect, it } from "vitest";
import { extractOverview } from "../../../../scripts/ops/ops-notion-backfill-seminars.mjs";

/**
 * 세미나의 **개요**는 속성이 아니라 페이지 본문에 있다 — `개요` 제목 아래의
 * 문단들이다. 이주는 속성만 읽었으므로 25/25 세미나의 설명이 통째로 넘어오지
 * 않았고, 공개 상세 페이지의 "1. 개요"가 비어 있다.
 *
 * 다음 제목(`활동 내역` 등)이 나오면 거기서 끊는다 — 활동 기록의 링크 목록까지
 * 설명으로 끌어오면 안 된다.
 */

const block = (type: string, text: string, depth = 0) => ({
  type,
  text,
  depth,
});

describe("extractOverview", () => {
  it("개요 제목 아래의 문단을 모은다", () => {
    const blocks = [
      block("heading_2", "개요"),
      block("paragraph", "첫 문단."),
      block("paragraph", "둘째 문단."),
    ];

    expect(extractOverview(blocks)).toBe("첫 문단.\n\n둘째 문단.");
  });

  it("다음 제목에서 끊는다", () => {
    const blocks = [
      block("heading_2", "개요"),
      block("paragraph", "설명."),
      block("heading_2", "활동 내역"),
      block("paragraph", "https://youtube.com/watch?v=1"),
    ];

    expect(extractOverview(blocks)).toBe("설명.");
  });

  // 실제 원본은 "활동 내역"과 "활동내역" 둘 다 쓴다.
  it("띄어쓰기가 다른 제목에서도 끊는다", () => {
    const blocks = [
      block("heading_2", "개요"),
      block("paragraph", "설명."),
      block("heading_2", "활동내역"),
      block("paragraph", "링크"),
    ];

    expect(extractOverview(blocks)).toBe("설명.");
  });

  it("목록 항목도 설명의 일부다", () => {
    const blocks = [
      block("heading_2", "개요"),
      block("paragraph", "여는 말."),
      block("numbered_list_item", "첫 주제"),
      block("paragraph", "첫 주제 설명.", 1),
    ];

    expect(extractOverview(blocks)).toBe(
      "여는 말.\n\n첫 주제\n\n첫 주제 설명.",
    );
  });

  it("개요 제목이 없으면 빈 문자열이다", () => {
    expect(extractOverview([block("paragraph", "제목 없는 글")])).toBe("");
  });

  it("개요가 비어 있으면 빈 문자열이다", () => {
    const blocks = [
      block("heading_2", "개요"),
      block("heading_2", "활동 내역"),
    ];

    expect(extractOverview(blocks)).toBe("");
  });

  it("빈 블록은 건너뛴다", () => {
    const blocks = [
      block("heading_2", "개요"),
      block("paragraph", "   "),
      block("paragraph", "본문."),
    ];

    expect(extractOverview(blocks)).toBe("본문.");
  });
});
