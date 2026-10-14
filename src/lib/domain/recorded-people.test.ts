import { describe, expect, it } from "vitest";
import { formerIds, pickerChoice } from "./recorded-people";

/**
 * 출석·발표자 편집기의 체크 목록(snumps-webpage/D-000047~49). 운영 명단만
 * 보여 주던 목록은 이주된 기록의 legacy id를 체크로 보이지 못했고, 그대로
 * 저장하면 그 사람들이 지워졌다.
 */
const current = {
  id: "m1",
  name: "현재",
  department: "수리과학부",
  legacyMemberId: null,
};
const rejoined = {
  id: "m2",
  name: "재가입",
  department: "물리천문학부",
  legacyMemberId: "L2",
};

describe("pickerChoice", () => {
  it("checks a member recorded under their own id", () => {
    expect(pickerChoice(current, ["m1"])).toEqual({
      value: "m1",
      checked: true,
    });
  });

  it("checks a rejoined member recorded under the old id, and submits that id", () => {
    expect(pickerChoice(rejoined, ["L2"])).toEqual({
      value: "L2",
      checked: true,
    });
  });

  it("offers the member's own id when they are not recorded", () => {
    expect(pickerChoice(rejoined, ["L9"])).toEqual({
      value: "m2",
      checked: false,
    });
  });
});

describe("formerIds", () => {
  it("lists recorded people the roster does not show, once each, in order", () => {
    expect(
      formerIds(["L1", "m1", "L2", "W1", "L1"], [current, rejoined]),
    ).toEqual(["L1", "W1"]);
  });

  it("is empty when the roster shows everyone recorded", () => {
    expect(formerIds(["m1", "L2"], [current, rejoined])).toEqual([]);
  });
});
