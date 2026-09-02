/**
 * LIVE E2E (dev Supabase) — 가입 신청 → 관리자 큐 노출 → 승인 → members/private-info
 * 전환 → 신청 행 제거까지 실데이터 계층으로 검증한다.
 * 실행: scripts/ops/run-signup-e2e.sh (DATA_BACKEND=supabase + dev 키 필요)
 * 평상시 vitest run(메모리 백엔드)에서는 전체 스킵된다.
 */
import { describe, expect, it } from "vitest";
import { env } from "$env/dynamic/private";
import { currentTerm } from "$lib/server/core/semester";
import { getTable, mutate } from "$lib/server/data/tables";
import {
  approveApplication,
  getApplicationForEmail,
  rejectApplication,
  submitApplication,
  withdrawOwnApplication,
} from "./membership";

const LIVE = env.DATA_BACKEND === "supabase" && env.LIVE_E2E === "1";
const suite = LIVE ? describe : describe.skip;

const EMAIL = "e2e-signup-probe@snu.ac.kr";
const EMAIL2 = "e2e-signup-probe2@snu.ac.kr";

suite("signup lifecycle (live dev DB)", () => {
  it("submit → queue → approve → members/private-info → row removed", async () => {
    // 잔재 정리 (이전 실행 실패 대비)
    const stale = await getApplicationForEmail(EMAIL);
    if (stale) await withdrawOwnApplication(EMAIL);

    // 1) 제출 — applications 테이블에 수집 항목 그대로 저장되는가
    const app = await submitApplication({
      email: EMAIL,
      name: "테스트지원자",
      department: "수리과학부",
      phone: "010-1234-5678",
      studentId: "2024-12345",
      background: "E2E 검증용 배경 지식",
    });
    const queued = await getApplicationForEmail(EMAIL);
    expect(queued).not.toBeNull();
    expect(queued!.name).toBe("테스트지원자");
    expect(queued!.phone).toBe("010-1234-5678");
    expect(queued!.background).toBe("E2E 검증용 배경 지식");
    expect(queued!.createdAt).toBeTruthy();

    // 2) 중복 제출 차단
    await expect(
      submitApplication({
        email: EMAIL.toUpperCase(),
        name: "x",
        department: "y",
        phone: "z",
        studentId: "",
        background: "",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // 3) 승인 — private-info + members 생성, 신청 행 제거
    const { name, email } = await approveApplication(app.id);
    expect(name).toBe("테스트지원자");
    expect(email).toBe(EMAIL);

    const members = await getTable("members");
    const member = members.find((m) => m.sourceRequestId === app.id);
    expect(member).toBeDefined();
    expect(member!.status).toBe("associate"); // 준회원으로 시작
    expect(member!.isAdmin).toBe(false);
    expect(member!.name).toBe("테스트지원자");

    const infos = await getTable("private-info");
    const info = infos.find((i) => i.sourceRequestId === app.id);
    expect(info).toBeDefined();
    expect(info!.memberId).toBe(member!.id);
    expect(info!.email).toBe(EMAIL);
    expect(info!.phone).toBe("010-1234-5678");
    expect(info!.background).toBe("E2E 검증용 배경 지식");
    expect(info!.mailPrefs.announcements).toBe(true);

    expect(await getApplicationForEmail(EMAIL)).toBeNull(); // 큐에서 사라짐

    // S9: 승인은 이번 학기 registrations 행도 만든다
    const regs = await getTable("registrations");
    const reg = regs.find((r) => r.sourceRequestId === app.id);
    expect(reg).toBeDefined();
    expect(reg!.memberId).toBe(member!.id);
    expect(reg!.term).toBe(currentTerm());

    // 4) 중복 승인 차단 (행이 이미 전환됨 → CONFLICT)
    await expect(approveApplication(app.id)).rejects.toMatchObject({ code: "CONFLICT" });

    // 정리: 프로브 회원의 등록 행 제거 (중복 승인 검사 뒤에 해야 CONFLICT 판정이 성립)
    await mutate("registrations", (rows) => rows.filter((r) => r.sourceRequestId !== app.id));
  });

  it("reject removes the row outright (no member conversion)", async () => {
    const app = await submitApplication({
      email: EMAIL2,
      name: "거절테스트",
      department: "수리과학부",
      phone: "010-9999-8888",
      studentId: "2024-54321",
      background: "",
    });
    const { email } = await rejectApplication(app.id);
    expect(email).toBe(EMAIL2);
    expect(await getApplicationForEmail(EMAIL2)).toBeNull();
    const members = await getTable("members");
    expect(members.some((m) => m.sourceRequestId === app.id)).toBe(false);
  });
});
