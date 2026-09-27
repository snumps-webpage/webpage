import { beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

const sent: Array<{ recipients: string[]; bcc: boolean; body: string }> = [];
vi.mock("./client", () => ({
  getAdminAccessToken: async () => "token",
  dispatchEmail: async (
    _t: string,
    recipients: string[],
    _s: string,
    body: string,
    opts?: { bcc?: boolean },
  ) => {
    sent.push({ recipients, bcc: !!opts?.bcc, body });
  },
}));

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { currentTerm } from "$lib/server/core/semester";
import { nowKstIso } from "$lib/server/core/time";
import {
  chunk,
  sendSeminarAnnouncement,
  sendSeminarCancellation,
  sendSeminarScheduleChange,
} from "./announcements";

async function seedInfos(entries: [email: string, announcements: boolean][]) {
  const rows = entries.map(([email, announcements]) => ({
    email,
    announcements,
    memberId: newId(),
  }));
  // One write per table, not per recipient: each write rewrites the whole
  // table document, so seeding one-by-one is quadratic and times out under load.
  await mutate("members", (existing) => [
    ...existing,
    ...rows.map((r) => ({
      id: r.memberId,
      name: r.email,
      department: "수리과학부",
      joinedAt: "2024-03-01",
      status: "regular" as const,
      statusChangedAt: nowKstIso(),
      withdrawal: null,
      isAlumni: false,
      alumniRevoked: false,
      roles: [],
      isAdmin: false,
      publicContact: null,
      project: null,
      legacyMemberId: null,
      sourceRequestId: null,
    })),
  ]);
  await mutate("registrations", (existing) => [
    ...existing,
    ...rows.map((r) => ({
      id: newId(),
      memberId: r.memberId,
      term: currentTerm(),
      registeredAt: nowKstIso(),
      sourceRequestId: null,
    })),
  ]);
  await mutate("private-info", (existing) => [
    ...existing,
    ...rows.map((r) => ({
      id: newId(),
      memberId: r.memberId,
      email: r.email,
      phone: "",
      studentId: "",
      background: "",
      mailPrefs: { announcements: r.announcements },
      hidePublicPhone: false,
      sourceRequestId: null,
    })),
  ]);
}

/** A member registered this term — announcements go only to those (and alumni). */
const seedInfo = (email: string, announcements: boolean) =>
  seedInfos([[email, announcements]]);

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  sent.length = 0;
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  for (const t of ["private-info", "members", "registrations"]) {
    await invalidateCache(`table_${t}`);
  }
});

describe("site origin in mail links", () => {
  it("uses SITE_ORIGIN when it is set", async () => {
    testEnv.SITE_ORIGIN = "https://mps.example";
    await seedInfo("a@snu.ac.kr", true);

    await sendSeminarAnnouncement({ title: "T", description: "D" });

    expect(sent[0].body).toContain(
      "https://mps.example/settings/notifications",
    );
  });

  it("falls back to the production origin when SITE_ORIGIN is unset", async () => {
    await seedInfo("a@snu.ac.kr", true);

    await sendSeminarAnnouncement({ title: "T", description: "D" });

    expect(sent[0].body).toContain(
      "https://snumps.vercel.app/settings/notifications",
    );
  });
});

describe("seminar announcement (SEM-04 / BE-45)", () => {
  it("sends Bcc-only to opted-in members, deduped, with the opt-out link", async () => {
    await seedInfo("a@snu.ac.kr", true);
    await seedInfo("A@snu.ac.kr", true); // duplicate after normalization
    await seedInfo("optout@snu.ac.kr", false);

    const ok = await sendSeminarAnnouncement({
      title: "정수론",
      description: "설명",
    });

    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].bcc).toBe(true); // never a To: list
    expect(sent[0].recipients).toEqual(["a@snu.ac.kr"]);
    expect(sent[0].body).toContain("/settings/notifications");
  });

  it("splits large recipient lists into batches", async () => {
    await seedInfos(
      Array.from({ length: 170 }, (_, i) => [`m${i}@snu.ac.kr`, true]),
    );
    await sendSeminarAnnouncement({ title: "T", description: "D" });
    expect(sent.length).toBe(3); // 80 + 80 + 10
    expect(sent.every((s) => s.bcc)).toBe(true);
  });

  it("chunk splits exactly", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

/**
 * 공지는 공개·변경·취소 셋이다. 공개 공지가 제목만 싣던 시절에는 회원이
 * "언제 어디서"를 알려면 사이트를 다시 열어야 했다 — 확정 일정을 알리는 것이
 * 이 메일의 목적인데도 그랬다.
 */
const SCHEDULE = {
  startsAt: "2026-10-15T19:00:00+09:00",
  startTime: "19:00",
  endsAt: "2026-10-15T21:00:00+09:00",
  location: "27동 325호",
};

describe("확정 일정 안내 — 공개 공지", () => {
  it("본문에 확정된 일시와 장소가 실린다", async () => {
    await seedInfo("a@snu.ac.kr", true);

    await sendSeminarAnnouncement({
      title: "정수론",
      description: "설명",
      schedule: SCHEDULE,
    });

    expect(sent[0].body).toContain("10월 15일");
    expect(sent[0].body).toContain("27동 325호");
  });
});

describe("시각 미정 일정", () => {
  /**
   * 관리자 화면의 `시각 미정` 체크박스는 "날짜는 알고 시각은 아직"인 세미나를
   * 위한 것이다(`startTime: null`). 그렇게 저장한 세미나를 공개하면 전 회원에게
   * 메일이 나가는데, 거기서 자정을 시각으로 적으면 **아무도 적지 않은 사실**을
   * 수백 명에게 말하게 된다. 화면은 이미 날짜만 보여 주고 있다.
   */
  const dateOnly = {
    startsAt: "2026-10-15T00:00:00+09:00",
    startTime: null,
    endsAt: null,
    location: "27동 325호",
  };

  it("공개 공지는 날짜만 싣는다", async () => {
    await seedInfo("a@snu.ac.kr", true);

    await sendSeminarAnnouncement({
      title: "정수론",
      description: "설명",
      schedule: dateOnly,
    });

    expect(sent[0].body).toContain("10월 15일");
    expect(sent[0].body).not.toContain("12:00");
    expect(sent[0].body).not.toMatch(/오전|오후/);
  });

  it("변경 공지도 날짜만 싣는다", async () => {
    await seedInfo("a@snu.ac.kr", true);

    await sendSeminarScheduleChange({ title: "정수론", schedule: dateOnly });

    expect(sent[0].body).toContain("10월 15일");
    expect(sent[0].body).not.toMatch(/오전|오후/);
  });

  it("시각을 아는 일정은 종전대로 시각을 싣는다", async () => {
    await seedInfo("a@snu.ac.kr", true);

    await sendSeminarAnnouncement({
      title: "정수론",
      description: "설명",
      schedule: { ...SCHEDULE, startTime: "19:00" },
    });

    expect(sent[0].body).toMatch(/오전|오후/);
  });
});

describe("일정 변경 공지", () => {
  it("바뀐 일시와 장소를 수신 동의 회원에게 Bcc로 보낸다", async () => {
    await seedInfo("a@snu.ac.kr", true);
    await seedInfo("optout@snu.ac.kr", false);

    const ok = await sendSeminarScheduleChange({
      title: "정수론",
      schedule: SCHEDULE,
    });

    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].bcc).toBe(true);
    expect(sent[0].recipients).toEqual(["a@snu.ac.kr"]);
    expect(sent[0].body).toContain("10월 15일");
    expect(sent[0].body).toContain("27동 325호");
  });
});

describe("취소 공지", () => {
  // 결정: 취소 **사실만** 알린다. 사유를 적을 자리를 만들면 그 자리가 채워진다.
  it("취소 사실을 알리되 사유는 싣지 않는다", async () => {
    await seedInfo("a@snu.ac.kr", true);

    const ok = await sendSeminarCancellation({ title: "정수론" });

    expect(ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].bcc).toBe(true);
    expect(sent[0].body).toContain("정수론");
    expect(sent[0].body).toContain("취소");
    expect(sent[0].body).not.toContain("사유");
  });
});
