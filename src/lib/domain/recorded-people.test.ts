import { describe, expect, it } from "vitest";
import {
  attendeeRowKeys,
  formerIds,
  pickerChoice,
  studyParticipantRows,
  type DirectoryPicker,
  type StudyParticipantRow,
} from "./recorded-people";

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

/**
 * 스터디 참가자 편집기의 칸(D-000043·057): 통합 명부 한 사람 한 칸. 저장된
 * 옛 id는 그대로 다시 제출하고, 주최자 칸은 잠기며, 출석자 후보는 그 사람의
 * 어느 id로든 찾는다.
 */
describe("studyParticipantRows", () => {
  const pickers: DirectoryPicker[] = [
    { ...current, former: false },
    { ...rejoined, former: false },
    {
      id: "m3",
      name: "신입",
      department: "수리과학부",
      legacyMemberId: null,
      former: false,
    },
    {
      id: "L1",
      name: "옛회원",
      department: "물리천문학부",
      legacyMemberId: null,
      former: true,
    },
  ];
  const study = {
    organizerIds: ["m1"],
    participantIds: ["m1", "L2"],
    attendeeCandidates: ["L1", "lost"],
  };
  const pick = (rows: StudyParticipantRow[]) =>
    rows.map((r) => [r.key, r.value, r.organizer, r.saved]);

  it("puts the organizer, then the saved people, then the rest; a legacy id resubmitted as is", () => {
    expect(pick(studyParticipantRows(study, pickers))).toEqual([
      ["m1", "m1", true, true],
      ["m2", "L2", false, true],
      ["m3", "m3", false, false],
      ["L1", "L1", false, false],
    ]);
  });

  it("keeps a recorded id no directory row stands for, named unknown", () => {
    const rows = studyParticipantRows(
      { ...study, participantIds: ["m1", "lost"] },
      pickers,
    );
    expect(rows[1]).toMatchObject({
      key: "lost",
      value: "lost",
      name: "알 수 없음",
      saved: true,
    });
  });

  it("locks an organizer who is not yet a participant", () => {
    const [first] = studyParticipantRows(
      { ...study, organizerIds: ["L2"], participantIds: [] },
      pickers,
    );
    expect(first).toMatchObject({ key: "m2", value: "L2", organizer: true });
  });

  it("finds the attendees' rows by either id, and an unsaved one submits the attended id", () => {
    const rows = studyParticipantRows(
      { ...study, participantIds: ["m1"], attendeeCandidates: ["L2", "L1"] },
      pickers,
    );
    expect(attendeeRowKeys(rows, ["L2", "L1", "lost"])).toEqual(["m2", "L1"]);
    expect(rows.find((r) => r.key === "m2")?.value).toBe("L2");
  });
});
