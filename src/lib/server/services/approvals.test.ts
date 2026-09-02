import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/data/store", () => import("$lib/server/data/store-memory"));

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { AppError } from "$lib/server/core/errors";
import {
  approveApplication,
  submitApplication,
  withdrawOwnApplication,
} from "./membership";
import { approveSeminar, submitSeminarRequest, withdrawSeminarRequest } from "./seminar-requests";

async function clearCaches() {
  for (const t of ["applications", "members", "private-info", "registrations", "legacy-private-info", "activities", "events", "seminars", "seminar-requests"]) {
    await invalidateCache(`table_${t}`);
  }
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  await clearCaches();
});

describe("membership conversion (§7-2 approve)", () => {
  it("converts the application into member + private-info and removes the row", async () => {
    const app = await submitApplication({
      email: "Test@snu.ac.kr",
      name: "홍길동",
      department: "수리과학부",
      phone: "010-1234-5678",
      studentId: "2024-12345",
      background: "",
    });

    await approveApplication(app.id);

    const members = await getTable("members");
    const infos = await getTable("private-info");
    expect(members).toHaveLength(1);
    expect(members[0].status).toBe("associate");
    expect(members[0].sourceRequestId).toBe(app.id);
    expect(infos[0].memberId).toBe(members[0].id);
    expect(infos[0].email).toBe("test@snu.ac.kr"); // normalized
    expect(infos[0].studentId).toBe("2024-12345");
    // S9: 승인은 이번 학기 등록 행도 만든다
    const regs = await getTable("registrations");
    expect(regs).toHaveLength(1);
    expect(regs[0]).toMatchObject({ memberId: members[0].id, sourceRequestId: app.id });
    expect(await getTable("applications")).toHaveLength(0);
  });

  it("re-run after full completion is CONFLICT with zero duplicates", async () => {
    const app = await submitApplication({
      email: "a@snu.ac.kr", name: "A", department: "D", phone: "010-0000-0000", studentId: "", background: "",
    });
    await approveApplication(app.id);
    await expect(approveApplication(app.id)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
    expect(await getTable("members")).toHaveLength(1);
  });

  it("re-run after a mid-sequence crash fills in only the missing records", async () => {
    const app = await submitApplication({
      email: "b@snu.ac.kr", name: "B", department: "D", phone: "010-0000-0000", studentId: "", background: "",
    });
    // Simulate: member creation succeeded, then the process died.
    await mutate("members", (rows) => [
      ...rows,
      {
        id: newId(), name: app.name, department: app.department,
        joinedAt: "2026-08-29", status: "associate" as const,
        statusChangedAt: nowKstIso(), withdrawal: null,
        isAlumni: false, alumniRevoked: false, roles: [], isAdmin: false,
        publicContact: null, project: null, legacyMemberId: null, sourceRequestId: app.id,
      },
    ]);

    await approveApplication(app.id);

    expect(await getTable("members")).toHaveLength(1); // no duplicate member
    expect(await getTable("private-info")).toHaveLength(1); // missing step filled
    expect(await getTable("applications")).toHaveLength(0);
  });

  it("self-withdrawal removes the row and its PII", async () => {
    await submitApplication({
      email: "c@snu.ac.kr", name: "C", department: "D", phone: "010-0000-0000", studentId: "", background: "",
    });
    await withdrawOwnApplication("c@snu.ac.kr");
    expect(await getTable("applications")).toHaveLength(0);
  });

  it("duplicate application for the same email is CONFLICT", async () => {
    await submitApplication({
      email: "d@snu.ac.kr", name: "D", department: "D", phone: "010-0000-0000", studentId: "", background: "",
    });
    await expect(
      submitApplication({
        email: "D@snu.ac.kr", name: "D2", department: "D", phone: "010-0000-0000", studentId: "", background: "",
      }),
    ).rejects.toSatisfy((e) => e instanceof AppError && e.code === "CONFLICT");
  });

  it("re-registration for an existing email updates the row instead of creating a member", async () => {
    const first = await submitApplication({
      email: "re@snu.ac.kr", name: "재", department: "D", phone: "010-1111-1111",
      studentId: "2023-11111", background: "",
    });
    await approveApplication(first.id);

    // 같은 이메일로 다음 학기 재가입 신청 → 승인
    const second = await submitApplication({
      email: "RE@snu.ac.kr", name: "재", department: "D", phone: "010-2222-2222",
      studentId: "2023-11111", background: "재가입",
    });
    await approveApplication(second.id);

    const members = await getTable("members");
    const infos = await getTable("private-info");
    expect(members).toHaveLength(1); // 두 번째 회원이 생기지 않는다
    expect(infos).toHaveLength(1);
    expect(infos[0].phone).toBe("010-2222-2222"); // 연락 정보는 신청 내용으로 갱신
    const regs = await getTable("registrations");
    expect(regs.map((r) => r.sourceRequestId).sort()).toEqual([first.id, second.id].sort());
    expect(regs.every((r) => r.memberId === members[0].id)).toBe(true);
  });

  it("inherits joinedAt/roles/project from the legacy archive on first re-application", async () => {
    __putRawDoc("table", "legacy-members", {
      schemaVersion: 1,
      rows: [
        {
          id: "LEG1", name: "김기존", department: "수리과학부", joinedAt: "2022-03-05",
          status: "associate", statusChangedAt: "2022-03-05T00:00:00+09:00",
          withdrawal: null, isAlumni: false, alumniRevoked: false,
          roles: [{ term: "23-1", title: "회장" }], isAdmin: false,
          publicContact: "010-1234-5678 · old@snu.ac.kr", project: { title: "옛 프로젝트" },
          legacyMemberId: null, sourceRequestId: null,
        },
      ],
    });
    __putRawDoc("table", "legacy-private-info", {
      schemaVersion: 1,
      rows: [
        {
          id: "LEGP1", memberId: "LEG1", email: "old-member@snu.ac.kr", phone: "010-0000-0000",
          studentId: "", background: "", mailPrefs: { announcements: true }, sourceRequestId: null,
        },
      ],
    });
    await invalidateCache("table_legacy-members");

    const app = await submitApplication({
      email: "old-member@snu.ac.kr", name: "김기존", department: "수리과학부",
      phone: "010-9999-0000", studentId: "2022-54321", background: "재가입",
    });
    await approveApplication(app.id);

    const member = (await getTable("members")).find((m) => m.sourceRequestId === app.id)!;
    expect(member.legacyMemberId).toBe("LEG1");
    expect(member.joinedAt).toBe("2022-03-05"); // 원 가입일 보존 — 재가입일이 아니다
    expect(member.roles).toEqual([{ term: "23-1", title: "회장" }]); // 임원 이력 상속
    expect(member.project).toEqual({ title: "옛 프로젝트" });
    expect(member.status).toBe("associate"); // 지위는 상속 안 함 (§9 재분류 전)
    expect(member.publicContact).toBeNull(); // 공개 연락처는 동의 재확인 전 null
  });
});

describe("seminar approval chain (§7-2 approveSeminar)", () => {
  const submit = () =>
    submitSeminarRequest({
      title: "위상수학 세미나",
      description: "설명",
      prerequisites: "",
      duration: "1h",
      presenterIds: ["m-presenter"],
      attachment: "", preferredTiming: "",
      requesterId: "m-presenter",
    });

  it("creates activity + event + archive record and marks the request approved", async () => {
    const req = await submit();
    await approveSeminar(req.id);

    const [activities, events, seminars, requests] = await Promise.all([
      getTable("activities"), getTable("events"), getTable("seminars"), getTable("seminar-requests"),
    ]);
    expect(activities).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0].activityId).toBe(activities[0].id);
    expect(events[0].presenterIds).toEqual(["m-presenter"]);
    expect(events[0].status).toBe("active");
    expect(seminars[0].activityId).toBe(activities[0].id);
    expect(requests[0].status).toBe("approved");
  });

  it("carries the request's posterKey and preferredTiming onto the approved seminar", async () => {
    const req = await submit();
    await mutate("seminar-requests", (rows) =>
      rows.map((r) =>
        r.id === req.id
          ? { ...r, posterKey: "seminars/posters/x/p.png", preferredTiming: "주말 오후" }
          : r,
      ),
    );
    await approveSeminar(req.id);
    const seminars = await getTable("seminars");
    expect(seminars[0].posterKey).toBe("seminars/posters/x/p.png");
    expect(seminars[0].preferredTiming).toBe("주말 오후");
  });

  it("re-run after the activity-only crash creates the missing event and record once", async () => {
    const req = await submit();
    // Simulate: only the activity landed before the crash.
    await mutate("activities", (rows) => [
      ...rows,
      {
        id: newId(), title: req.title, date: { start: nowKstIso(), end: null },
        type: "세미나" as const, attendeeIds: ["m-presenter"], sourceRequestId: req.id,
      },
    ]);

    await approveSeminar(req.id);

    expect(await getTable("activities")).toHaveLength(1);
    expect(await getTable("events")).toHaveLength(1);
    expect(await getTable("seminars")).toHaveLength(1);
  });

  it("approving a non-pending request is CONFLICT", async () => {
    const req = await submit();
    await withdrawSeminarRequest(req.id, "m-presenter");
    await expect(approveSeminar(req.id)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
  });
});
