import { describe, expect, it } from "vitest";
import { planExternalPresenterBackfill } from "../../../../scripts/ops/ops-notion-backfill-seminars.mjs";

/**
 * 노션 `세미나 기록`에는 **`진행자 (비회원)`** 이라는 rich_text 속성이 있는데,
 * 이주 스크립트는 `externalPresenters: ""` 를 박아 넣었다
 * (`20-export-tables.ts:437`). 값이 원본에 남아 있으므로 되살릴 수 있다.
 *
 * 짝짓기는 제목+학기다 — 노션 세미나에는 id도, 활동과의 relation도 없다.
 * 그래서 **모호하면 건드리지 않는다**: 같은 제목·학기가 둘이면 어느 쪽 값인지
 * 알 수 없고, 잘못 넣은 이름은 사람 이름이라 눈에 띄지도 않는다.
 */

const notion = (over = {}) => ({
  title: "정수론 입문",
  semester: "24-2",
  externalPresenters: "김철수",
  ...over,
});

const seminar = (over = {}) => ({
  id: "s1",
  title: "정수론 입문",
  semester: "24-2",
  externalPresenters: "",
  ...over,
});

const plan = (input: Record<string, unknown>) =>
  planExternalPresenterBackfill({ notionRows: [], seminars: [], ...input });

describe("planExternalPresenterBackfill", () => {
  it("비어 있던 외부 발표자를 원본 값으로 채운다", () => {
    const result = plan({ notionRows: [notion()], seminars: [seminar()] });

    expect(result.rows[0].externalPresenters).toBe("김철수");
    expect(result.planned).toEqual([
      { id: "s1", title: "정수론 입문", semester: "24-2", value: "김철수" },
    ]);
  });

  // 이미 값이 있으면 운영진이 넣었을 수 있다 — 원본으로 덮지 않는다.
  it("이미 값이 있는 행은 덮지 않는다", () => {
    const result = plan({
      notionRows: [notion()],
      seminars: [seminar({ externalPresenters: "이영희" })],
    });

    expect(result.rows[0].externalPresenters).toBe("이영희");
    expect(result.planned).toEqual([]);
  });

  it("원본이 비어 있으면 할 일이 없다", () => {
    const result = plan({
      notionRows: [notion({ externalPresenters: "   " })],
      seminars: [seminar()],
    });

    expect(result.planned).toEqual([]);
    expect(result.changed).toBe(false);
  });

  it("학기가 다르면 같은 제목이라도 잇지 않는다", () => {
    const result = plan({
      notionRows: [notion({ semester: "23-1" })],
      seminars: [seminar()],
    });

    expect(result.rows[0].externalPresenters).toBe("");
    expect(result.unmatched[0].reason).toBe("짝 없음");
  });

  // 같은 제목·학기가 둘이면 어느 쪽 값인지 알 수 없다. 사람 이름은 틀려도 티가 안 난다.
  it("제목·학기가 겹치면 모호함으로 남기고 건드리지 않는다", () => {
    const result = plan({
      notionRows: [notion(), notion({ externalPresenters: "박민수" })],
      seminars: [seminar(), seminar({ id: "s2" })],
    });

    expect(result.rows.every((r) => r.externalPresenters === "")).toBe(true);
    expect(result.unmatched[0].reason).toBe("제목·학기 중복");
  });

  // 실패 목록은 사람이 원본을 찾아보는 데 쓰인다 — 제목이 잘려 나오면 못 찾는다.
  it("짝짓기 실패 보고에 제목과 학기가 온전히 실린다", () => {
    const result = plan({
      notionRows: [notion({ title: "해석학 입문 특강", semester: "23-1" })],
      seminars: [],
    });

    expect(result.unmatched).toEqual([
      { title: "해석학 입문 특강", semester: "23-1", reason: "짝 없음" },
    ]);
  });

  it("앞뒤 공백은 정리해서 넣는다", () => {
    const result = plan({
      notionRows: [notion({ externalPresenters: "  김철수, 이영희  " })],
      seminars: [seminar()],
    });

    expect(result.rows[0].externalPresenters).toBe("김철수, 이영희");
  });
});
