import { describe, expect, it } from "vitest";
import {
  filterPublicIndex,
  formatArchiveTerm,
  projectIndexItems,
  seminarIndexItems,
  type PublicSeminarRecord,
} from "./public-content";

const seminar: PublicSeminarRecord = {
  id: "seminar-1",
  title: "확률적 방법",
  term: "26-2",
  description: "존재성 증명의 기본 아이디어",
  prerequisites: "이산수학",
  durationMinutes: 90,
  presenterNames: ["김수학"],
  scheduledAt: "2026-09-08T18:30:00+09:00",
  location: "27동 220호",
  files: [],
};

describe("public content projections", () => {
  it("formats canonical academic terms", () => {
    expect(formatArchiveTerm("26-2")).toBe("2026년 2학기");
    expect(formatArchiveTerm("legacy")).toBe("legacy");
  });

  it("builds searchable seminar index items", () => {
    const items = seminarIndexItems([seminar]);
    expect(items[0]).toMatchObject({
      title: "확률적 방법",
      eyebrow: "2026년 2학기",
      href: "/archive/seminars/seminar-1",
    });
    expect(filterPublicIndex(items, "김수학")).toHaveLength(1);
    expect(filterPublicIndex(items, "해석학")).toHaveLength(0);
  });
});

describe("seminarIndexItems 정렬", () => {
  const at = (over: Partial<PublicSeminarRecord>): PublicSeminarRecord => ({
    ...seminar,
    ...over,
  });

  /**
   * 예전 비교자는 **두 쪽 다 날짜가 있을 때만** 날짜로, 아니면 학기로 비교했다.
   * 키가 섞이면 순서가 전이적이지 않다 — A<C(날짜), B<A(학기), B==C(학기) 같은
   * 조합이 생기고, 그때 `Array.sort`의 결과는 엔진 마음이다.
   */
  it("날짜가 없는 항목이 섞여도 순서가 일관된다", () => {
    const a = at({
      id: "a",
      term: "24-2",
      scheduledAt: "2024-10-15T19:00:00+09:00",
    });
    const b = at({ id: "b", term: "25-1", scheduledAt: null });
    const c = at({
      id: "c",
      term: "25-1",
      scheduledAt: "2025-03-02T19:00:00+09:00",
    });

    const order = (rows: PublicSeminarRecord[]) =>
      seminarIndexItems(rows).map((i) => i.id);

    // 어떤 입력 순서로 넣어도 같은 결과여야 한다.
    const first = order([a, b, c]);
    expect(order([c, b, a])).toEqual(first);
    expect(order([b, a, c])).toEqual(first);
    // 최신 학기가 앞이고, 같은 학기 안에서는 최신 날짜가 앞이다.
    expect(first[first.length - 1]).toBe("a");
  });

  it("같은 학기 안에서는 최신 날짜가 먼저다", () => {
    const older = at({
      id: "older",
      term: "25-1",
      scheduledAt: "2025-03-02T19:00:00+09:00",
    });
    const newer = at({
      id: "newer",
      term: "25-1",
      scheduledAt: "2025-05-09T19:00:00+09:00",
    });

    expect(seminarIndexItems([older, newer]).map((i) => i.id)).toEqual([
      "newer",
      "older",
    ]);
  });
});

// The stored project URL became the public link as it was; a row the
// migration wrote could carry `javascript:` (audit LC13-1).
describe("projectIndexItems links", () => {
  const project = (url: string | null) => ({
    memberId: "m1",
    memberName: "김수학",
    department: "수리과학부",
    title: "프로젝트",
    url,
  });

  it("links an http(s) project URL", () => {
    expect(projectIndexItems([project("https://example.com")])[0]?.href).toBe(
      "https://example.com",
    );
  });

  it("renders no link for any other scheme", () => {
    expect(
      projectIndexItems([project("javascript:alert(1)")])[0]?.href,
    ).toBeUndefined();
    expect(projectIndexItems([project(null)])[0]?.href).toBeUndefined();
  });
});
