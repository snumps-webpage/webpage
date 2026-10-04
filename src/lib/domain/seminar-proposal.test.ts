import { describe, expect, it } from "vitest";
import { initialSeminarPresenters } from "./seminar-proposal";
const members = [
  { id: "self", name: "예시 신청자", department: "수리과학부" },
  { id: "other", name: "예시 발표자", department: "통계학과" },
];
describe("seminar presenter recovery", () => {
  it("uses the requester fallback only before a selection has been submitted", () => {
    expect(initialSeminarPresenters(members, undefined, [members[0]])).toEqual([
      members[0],
    ]);
    expect(initialSeminarPresenters(members, [], [members[0]])).toEqual([]);
  });
  it("retains submitted selection order and deduplicates", () => {
    expect(
      initialSeminarPresenters(
        members,
        ["other", "self", "other"],
        [members[0]],
      ),
    ).toEqual([members[1], members[0]]);
  });
  it("does not silently discard stored presenters whose names are unavailable", () => {
    expect(initialSeminarPresenters(members, ["unavailable"], [])).toEqual([
      {
        id: "unavailable",
        name: "정보를 확인할 수 없는 발표자",
        department: "회원 목록 확인 필요",
      },
    ]);
  });
});
