// @vitest-environment node
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import type { AdminMemberDetail } from "$lib/domain/members";
import type { AdminMemberActionState } from "$lib/domain/admin-member-editor";
import MemberRecordSections from "./MemberRecordSections.svelte";

const member: AdminMemberDetail = {
  id: "m1",
  name: "홍길동",
  department: "수리과학부",
  joinedAt: "2024-03-01",
  status: "regular",
  statusChangedAt: "2026-09-01T10:00:00+09:00",
  isAlumni: true,
  alumniRevoked: false,
  alumniRevocationReason: null,
  roles: [],
  isAdmin: false,
  withdrawal: null,
  project: null,
  privateInfo: null,
};

const html = (
  over: Partial<AdminMemberDetail> = {},
  actionState: AdminMemberActionState | null = null,
) =>
  render(MemberRecordSections, {
    props: {
      member: { ...member, ...over },
      actionState,
      busy: false,
      submit: () => () => {},
    },
  }).body;

describe("MemberRecordSections", () => {
  // Decision #3 (audit LC11-3): a member without a join date used to get no
  // record form at all — nothing on the page could fill the gap. The form
  // now shows, and asks for the date it lacks.
  it("offers the record form, join date required, when the join date is missing", () => {
    const body = html({ joinedAt: null });

    expect(body).toContain('action="?/updateMember"');
    expect(body).toMatch(/<input[^>]*name="joinedAt"[^>]*required/);
    expect(body).toContain("가입일 기록이 없습니다");
    expect(body).not.toContain("가입 정보 레코드가 없어");
  });

  // Decision #1/#19 (audit LB16-3, LC11-1): no publicContact rides along.
  it("posts no publicContact with the record", () => {
    expect(html()).not.toContain('name="publicContact"');
  });

  // Decision #18 (audit LA30-1): the reason is on the member row now, so
  // the page shows it where it shows the revocation.
  it("shows the stored revocation reason", () => {
    const body = html({
      isAlumni: false,
      alumniRevoked: true,
      alumniRevocationReason: "회칙상 유고 처리",
    });

    expect(body).toContain("회칙상 유고 처리");
  });
});

describe("native member editor", () => {
  it("renders failed raw record fields and issues on the native response", () => {
    const body = html(
      {},
      {
        memberId: "m1",
        operation: "memberUpdated",
        error: "VALIDATION_FAILED",
        issues: { name: "이름 입력 필요" },
        values: {
          name: "  ",
          department: "raw department",
          joinedAt: "2024-03-01",
          projectTitle: "",
          projectUrl: "",
        },
      },
    );
    expect(body).toMatch(
      /name="name"[^>]*value=" {2}"[^>]*aria-invalid="true"/,
    );
    expect(body).toContain("이름 입력 필요");
    expect(body).toContain("raw department");
  });
  it("does not restore another member's failed fields", () => {
    const body = html(
      {},
      {
        memberId: "other",
        operation: "memberUpdated",
        error: "VALIDATION_FAILED",
        values: { name: "other draft" },
      },
    );
    expect(body).not.toContain("other draft");
    expect(body).toContain("홍길동");
  });
  it("uses the same KST clamped calendar grace as withdrawal services", () => {
    const body = html({
      status: "withdrawn",
      withdrawal: {
        requestedAt: "2026-01-31T23:00:00+09:00",
        previousStatus: "regular",
        holdBy: null,
        holdAt: null,
      },
    });
    expect(body).toContain("2월 28일");
    expect(body).toContain("1개월 유예 기준");
    expect(body).not.toContain("3월 3일");
  });
});
