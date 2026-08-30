import { describe, expect, it } from "vitest";
import {
  filterPublicIndex,
  formatArchiveTerm,
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
