// @vitest-environment node
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type { AdminStudyRecord } from "$lib/domain/admin-records";
import type { DirectoryPicker } from "$lib/domain/recorded-people";
import AdminStudyRecordEditor from "./AdminStudyRecordEditor.svelte";

/**
 * 주최자 변경 선택지는 스터디 상태를 따른다(D-000044·054): 종료·취소면 통합
 * 명부, 모집·진행이면 운영 명단. 참가자 편집기는 카드마다 있다(D-000043).
 */

const members = [{ id: "m1", name: "현재", department: "수리과학부" }];
const pickers: DirectoryPicker[] = [
  { ...members[0], legacyMemberId: null, former: false },
  {
    id: "L1",
    name: "옛회원",
    department: "물리천문학부",
    legacyMemberId: null,
    former: true,
  },
];

const record = (status: AdminStudyRecord["status"]): AdminStudyRecord => ({
  id: "s1",
  sourceRequestId: null,
  title: "해석학",
  term: "25-1",
  status,
  description: "",
  material: "",
  organizerIds: ["m1"],
  organizerNames: ["현재"],
  participantIds: ["m1"],
  participantPeople: [{ id: "m1", name: "현재", department: "수리과학부" }],
  attendeeCandidates: [],
  pendingTransfer: null,
  transferHistory: [],
  sessionCount: 0,
  linkedActivityCount: 0,
  files: [],
});

const html = (status: AdminStudyRecord["status"]) =>
  render(AdminStudyRecordEditor, {
    props: { records: [record(status)], members, pickers, currentTerm: "26-2" },
  }).body;

describe("AdminStudyRecordEditor organizer choices", () => {
  it.each(["finished", "cancelled"] as const)(
    "offers the merged directory on a %s study",
    (status) => {
      expect(html(status)).toContain("옛회원 · 이전 회원");
    },
  );

  it.each(["recruiting", "ongoing"] as const)(
    "offers the operating roster only on a %s study",
    (status) => {
      const body = html(status);
      expect(body).toContain("현재 · 수리과학부");
      expect(body).not.toContain("옛회원");
    },
  );

  it("has a participant editor on the card", () => {
    expect(html("finished")).toContain("참가자 편집");
  });
});
