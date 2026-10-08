import { describe, expect, it } from "vitest";
import {
  applyMemberSectionResult,
  memberAdminNotice,
  memberRecordDraft,
  memberRolesText,
  scopedMemberAction,
} from "./admin-member-editor";
import type { AdminMemberDetail } from "./members";

const member: AdminMemberDetail = {
  id: "fixture-member",
  name: "예시 회원",
  department: "수리과학부",
  joinedAt: "2026-09-01",
  status: "regular",
  statusChangedAt: "2026-09-01T00:00:00+09:00",
  isAlumni: true,
  alumniRevoked: false,
  alumniRevocationReason: null,
  roles: [
    { term: "26-2", title: "학술 부장" },
    { term: "26-1", title: "총무" },
  ],
  isAdmin: false,
  withdrawal: null,
  project: null,
  privateInfo: {
    email: "fixture@snu.ac.kr",
    phone: "010-0000-0000",
    background: "해석학",
    mailPrefs: { announcements: false },
  },
};

describe("existing member editor state", () => {
  it("serializes saved roles in the existing native line wire format", () => {
    expect(memberRolesText(member)).toBe("26-2 학술 부장\n26-1 총무");
    expect(memberRolesText({ ...member, roles: [] })).toBe("");
  });
  it("ignores responses scoped to a different member", () => {
    const state = {
      memberId: "other",
      operation: "memberUpdated" as const,
      values: { name: "other" },
      error: "VALIDATION_FAILED",
    };
    const draft = memberRecordDraft(member);
    expect(scopedMemberAction(state, member.id)).toBeNull();
    expect(applyMemberSectionResult(draft, member, state)).toBe(draft);
    expect(memberAdminNotice(state, member)).toBeNull();
  });
  it("restores raw failed fields only in the submitted section", () => {
    const draft = {
      ...memberRecordDraft(member),
      name: "unsaved name",
      background: "unsaved background",
    };
    const next = applyMemberSectionResult(draft, member, {
      memberId: member.id,
      operation: "privateInfoUpdated",
      error: "VALIDATION_FAILED",
      values: {
        email: "  invalid raw  ",
        phone: "",
        background: "  raw background  ",
        name: "do not cross sections",
      },
    });
    expect(next).toMatchObject({
      name: "unsaved name",
      email: "  invalid raw  ",
      phone: "",
      background: "  raw background  ",
    });
    expect(draft.background).toBe("unsaved background");
  });
  it("resyncs only the successful section from the reloaded authority", () => {
    const draft = {
      ...memberRecordDraft(member),
      name: "unsaved name",
      reason: "unsaved reason",
      email: "draft email",
    };
    const changed = {
      ...member,
      privateInfo: { ...member.privateInfo!, email: "normalized@snu.ac.kr" },
    };
    const next = applyMemberSectionResult(draft, changed, {
      memberId: member.id,
      operation: "privateInfoUpdated",
      success: true,
    });
    expect(next).toMatchObject({
      name: "unsaved name",
      reason: "unsaved reason",
      email: "normalized@snu.ac.kr",
    });
  });
  it("clears a successful alumni reason without erasing unrelated drafts", () => {
    const draft = {
      ...memberRecordDraft(member),
      reason: "  reason  ",
      department: "unsaved department",
    };
    expect(
      applyMemberSectionResult(draft, member, {
        memberId: member.id,
        operation: "alumniRevoked",
        success: true,
      }),
    ).toMatchObject({ reason: "", department: "unsaved department" });
  });
  it("retains explicit malformed status for field-level refusal", () => {
    expect(
      applyMemberSectionResult(memberRecordDraft(member), member, {
        memberId: member.id,
        operation: "statusUpdated",
        error: "VALIDATION_FAILED",
        values: { status: "withdrawn" },
      }).status,
    ).toBe("withdrawn");
  });
  it("distinguishes known refusal from uncertain service result", () => {
    expect(
      memberAdminNotice(
        {
          memberId: member.id,
          operation: "adminUpdated",
          error: "CONFLICT",
          message: "마지막 관리자의 권한은 회수할 수 없습니다.",
        },
        member,
      )?.message,
    ).toBe("마지막 관리자의 권한은 회수할 수 없습니다.");
    expect(
      memberAdminNotice(
        {
          memberId: member.id,
          operation: "memberUpdated",
          error: "SERVICE_UNAVAILABLE",
        },
        member,
      )?.message,
    ).toContain("상태가 바뀌었을 수");
  });
  it("reports success only for an explicit successful matching operation", () => {
    expect(
      memberAdminNotice(
        { memberId: member.id, operation: "adminUpdated" },
        member,
      ),
    ).toBeNull();
    expect(
      memberAdminNotice(
        { memberId: member.id, operation: "adminUpdated", success: true },
        { ...member, isAdmin: true },
      )?.message,
    ).toContain("부여");
  });
});
