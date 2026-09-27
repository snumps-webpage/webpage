import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: testEnv }));
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

const sentMail = vi.hoisted(
  () => [] as { event: string; vars: Record<string, unknown> }[],
);
const mailOutcome = vi.hoisted(() => ({ ok: true }));
vi.mock("$lib/server/mail/dispatch", () => ({
  emitMailEvent: async (event: string, vars: Record<string, unknown>) => {
    sentMail.push({ event, vars });
    return mailOutcome.ok;
  },
}));

import { __docs, __putRawDoc, __reset } from "$lib/server/data/store-memory";
import { expectTablesValid } from "$lib/server/data/expect-tables-valid";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { toKstIso } from "$lib/server/core/time";
import { termOf } from "$lib/server/core/semester";
import { approveSeminar, submitSeminarRequest } from "./seminar-requests";
import {
  cancelSeminar,
  publishSeminar,
  scheduleSeminar,
  updateSeminarSchedule,
} from "./seminars";

/**
 * 승인 → 일정 미정 → 확정 → 공개 (FRONTEND-DECISIONS §3-1).
 *
 * 예전에는 승인 한 번이 activity·event·공지를 전부 만들었고, 세미나 시작
 * 시각이 **승인을 누른 순간**이었다. 그래서 승인된 세미나는 신청이 즉시 닫히고
 * (start <= now) 그날 자정에 만료됐다.
 */

// 고정 날짜를 쓰면 그 날이 지나는 순간 "공개된 세미나는 신청을 받을 수 있다"가
// 자멸한다 — 고친 버그를 지키는 유일한 테스트였다. 상대 시각으로 잡는다.
const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => toKstIso(new Date(Date.now() + offsetMs));
const SCHEDULE = {
  startsAt: at(30 * 24 * HOUR),
  startTime: null,
  endsAt: at(30 * 24 * HOUR + 2 * HOUR),
  location: "27동 325호",
};

async function pendingRequest() {
  return submitSeminarRequest({
    title: "정수론 입문",
    description: "설명",
    prerequisites: "",
    duration: "60",
    preferredTiming: "10월 중반",
    presenterIds: [newId()],
    attachment: "",
    requesterId: newId(),
  });
}

// Rows the SQL flows wrote must decode exactly as TS-written ones.
afterEach(expectTablesValid);

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  sentMail.length = 0;
  mailOutcome.ok = true;
  for (const t of ["seminars", "seminar-requests", "events", "activities"])
    await invalidateCache(`table_${t}`);
});

describe("approveSeminar — 승인은 일정을 만들지 않는다", () => {
  it("세미나를 일정 미정으로 만들고 activity·event는 만들지 않는다", async () => {
    const request = await pendingRequest();

    await approveSeminar(request.id);

    const [seminar] = await getTable("seminars");
    expect(seminar.publicationStatus).toBe("unscheduled");
    expect(seminar.schedule).toBeNull();
    expect(seminar.activityId).toBeNull();
    expect(await getTable("events")).toEqual([]);
    expect(await getTable("activities")).toEqual([]);
  });

  it("승인만으로는 전 회원 공지가 나가지 않는다", async () => {
    await approveSeminar((await pendingRequest()).id);

    expect(sentMail.filter((m) => m.event === "seminar.published")).toEqual([]);
  });
});

describe("scheduleSeminar — 일정 확정", () => {
  it("일정을 저장하고 scheduled로 전이한다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");

    await scheduleSeminar(seminar.id, SCHEDULE);

    const [updated] = await getTable("seminars");
    expect(updated.publicationStatus).toBe("scheduled");
    expect(updated.schedule).toEqual(SCHEDULE);
    expect(await getTable("events")).toEqual([]); // 확정만으로는 출석 이벤트가 없다
  });

  it("확정만으로는 공지가 나가지 않는다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");

    await scheduleSeminar(seminar.id, SCHEDULE);

    expect(sentMail).toEqual([]);
  });
});

describe("publishSeminar — 공개", () => {
  async function approvedAndScheduled() {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, SCHEDULE);
    return seminar.id;
  }

  it("확정된 일정으로 활동과 출석 이벤트를 만든다", async () => {
    const id = await approvedAndScheduled();

    await publishSeminar(id);

    const [activity] = await getTable("activities");
    const [event] = await getTable("events");
    expect(activity.date).toEqual({
      start: SCHEDULE.startsAt,
      end: SCHEDULE.endsAt,
    });
    expect(event.date).toEqual(activity.date);
    expect(event.status).toBe("active");
    expect(event.activityId).toBe(activity.id);
  });

  it("공개된 세미나는 신청을 받을 수 있다 — 이것이 원래 버그였다", async () => {
    const id = await approvedAndScheduled();
    await publishSeminar(id);
    const [event] = await getTable("events");

    const { applyToEvent } = await import("./events");
    await expect(applyToEvent(event.id, "m1")).resolves.not.toThrow();
  });

  it("학기는 승인 시점이 아니라 확정된 일정에서 나온다", async () => {
    const id = await approvedAndScheduled();

    await publishSeminar(id);

    const [seminar] = await getTable("seminars");
    expect(seminar.semester).toBe(termOf(new Date(SCHEDULE.startsAt)));
    expect(seminar.publicationStatus).toBe("published");
    expect(seminar.activityId).not.toBeNull();
  });

  it("공개 시점에 전 회원 공지가 나간다", async () => {
    const id = await approvedAndScheduled();

    await publishSeminar(id);

    expect(sentMail.map((m) => m.event)).toEqual(["seminar.published"]);
  });

  it("일정이 없으면 공개할 수 없다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");

    await expect(publishSeminar(seminar.id)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
  });

  it("공개 공지에는 확정된 일시와 장소가 실린다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, SCHEDULE);

    await publishSeminar(seminar.id);

    expect(sentMail[0].event).toBe("seminar.published");
    expect(sentMail[0].vars.location).toBe(SCHEDULE.location);
    expect(sentMail[0].vars.schedule).not.toBe("추후 공지");
  });

  it("재실행해도 활동·이벤트는 하나뿐이고 공지도 한 번이다", async () => {
    const id = await approvedAndScheduled();
    await publishSeminar(id);

    await publishSeminar(id); // published 상태에서의 재실행 — 수렴해야 한다

    expect((await getTable("activities")).length).toBe(1);
    expect((await getTable("events")).length).toBe(1);
    expect(sentMail.length).toBe(1);
  });

  it("동시에 두 번 공개해도 공지는 한 번이다", async () => {
    const id = await approvedAndScheduled();

    await Promise.allSettled([publishSeminar(id), publishSeminar(id)]);

    expect(sentMail.length).toBe(1);
    expect((await getTable("events")).length).toBe(1);
  });

  // 상태 전이는 성공했는데 메일이 실패하면, 예전 구조에서는 재실행이 CONFLICT로
  // 튕겨 공지가 영영 나가지 않았다. 발송 여부는 announcedAt이 혼자 결정한다.
  it("메일이 실패하면 다음 재실행이 다시 보낸다", async () => {
    const id = await approvedAndScheduled();
    mailOutcome.ok = false;
    await publishSeminar(id);
    expect((await getTable("seminars"))[0].announcedAt).toBeNull();

    mailOutcome.ok = true;
    const { mailFailed } = await publishSeminar(id);

    expect(mailFailed).toBe(false);
    expect((await getTable("seminars"))[0].announcedAt).not.toBeNull();
    expect(sentMail.length).toBe(2);
  });

  it("공개 직전에 일정이 바뀌어도 셋이 갈라지지 않는다", async () => {
    const id = await approvedAndScheduled();

    await scheduleSeminar(id, {
      ...SCHEDULE,
      startsAt: at(60 * 24 * HOUR),
      startTime: null,
      endsAt: null,
    });
    await publishSeminar(id);

    const [seminar] = await getTable("seminars");
    const [event] = await getTable("events");
    expect(event.date.start).toBe(seminar.schedule!.startsAt);
    expect(seminar.semester).toBe(termOf(new Date(seminar.schedule!.startsAt)));
  });

  it("발표자는 자기 세미나의 참가자로 기록된다", async () => {
    const id = await approvedAndScheduled();
    const [seminar] = await getTable("seminars");

    await publishSeminar(id);

    expect((await getTable("activities"))[0].attendeeIds).toEqual(
      seminar.presenterIds,
    );
  });

  it("이미 지난 시각으로도 공개할 수 있다 — 기록 정정 경로", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    const past = { ...SCHEDULE, startsAt: at(-200 * 24 * HOUR), endsAt: null };
    await scheduleSeminar(seminar.id, past);

    await publishSeminar(seminar.id);

    const [published] = await getTable("seminars");
    expect(published.semester).toBe(termOf(new Date(past.startsAt)));
    // 기록 정정이지 안내가 아니다 — 지난 세미나를 전 회원에게 알리지 않는다.
    expect(sentMail).toEqual([]);
    // announcedAt은 "공지가 나갔다"만 뜻한다 — 나가지 않았으니 비어 있다(감사
    // LB30-1). 재발송 버튼은 이미 시작된 세미나에 뜨지 않는다(관리자 보드).
    expect(published.announcedAt).toBeNull();
  });
});

describe("updateSeminarSchedule — 확정 후 일정 변경", () => {
  async function published() {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, SCHEDULE);
    await publishSeminar(seminar.id);
    return seminar.id;
  }

  it("공개 전에는 세미나만 고친다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, SCHEDULE);
    const moved = { ...SCHEDULE, startsAt: at(40 * 24 * HOUR), endsAt: null };

    await updateSeminarSchedule(seminar.id, moved);

    const [updated] = await getTable("seminars");
    expect(updated.schedule).toEqual(moved);
    expect(updated.publicationStatus).toBe("scheduled");
  });

  // 공개된 세미나의 일정은 세 문서에 산다 — 하나만 고치면 회원 화면과 공개
  // 아카이브가 서로 다른 날짜를 말한다.
  it("공개 후에는 활동·출석 이벤트까지 한 작업으로 맞춘다", async () => {
    const id = await published();
    const moved = {
      startsAt: at(45 * 24 * HOUR),
      startTime: null,
      endsAt: at(45 * 24 * HOUR + 3 * HOUR),
      location: "302동 105호",
    };

    await updateSeminarSchedule(id, moved);

    const [seminar] = await getTable("seminars");
    const [activity] = await getTable("activities");
    const [event] = await getTable("events");
    expect(seminar.schedule).toEqual(moved);
    expect(activity.date).toEqual({ start: moved.startsAt, end: moved.endsAt });
    expect(event.date).toEqual(activity.date);
    expect(seminar.semester).toBe(termOf(new Date(moved.startsAt)));
  });

  // 이주로 일정을 잃은 레거시 행(published + schedule: null)을 고치는 입구다.
  it("일정이 비어 있던 공개 세미나에도 일정을 넣을 수 있다", async () => {
    await mutate("seminars", (rows) => [
      ...rows,
      {
        id: "legacy-1",
        title: "이주된 세미나",
        semester: "24-2",
        note: "",
        description: "",
        presenterIds: [],
        externalPresenters: "",
        materials: [],
        photos: [],
        posterKey: "",
        preferredTiming: "",
        publicationStatus: "published" as const,
        schedule: null,
        announcedAt: null,
        semesterPinned: false,
        activityId: null,
        sourceRequestId: null,
      },
    ]);

    await updateSeminarSchedule("legacy-1", SCHEDULE);

    const legacy = (await getTable("seminars")).find(
      (s) => s.id === "legacy-1",
    )!;
    expect(legacy.schedule).toEqual(SCHEDULE);
  });

  it("공개된 세미나의 일정이 바뀌면 변경 공지가 나간다", async () => {
    const id = await published();
    sentMail.length = 0;

    await updateSeminarSchedule(id, { ...SCHEDULE, location: "다른 곳" });

    expect(sentMail.map((m) => m.event)).toEqual(["seminar.schedule-changed"]);
    expect(sentMail[0].vars.location).toBe("다른 곳");
  });

  // 같은 값을 다시 저장하는 것은 변경이 아니다 — 전 회원 메일이 그렇게 새어 나간다.
  it("바뀐 것이 없으면 공지하지 않는다", async () => {
    const id = await published();
    sentMail.length = 0;

    await updateSeminarSchedule(id, SCHEDULE);

    expect(sentMail).toEqual([]);
  });

  it("공개 전 일정 수정은 아무에게도 알리지 않는다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, SCHEDULE);
    sentMail.length = 0;

    await updateSeminarSchedule(seminar.id, {
      ...SCHEDULE,
      location: "다른 곳",
    });

    expect(sentMail).toEqual([]);
  });

  // 지난 일정을 고치는 것은 기록 정정이다 — "일정이 바뀌었습니다"가 아니다.
  it("이미 지난 일정으로 고치면 변경 공지는 나가지 않는다", async () => {
    const id = await published();
    sentMail.length = 0;

    await updateSeminarSchedule(id, {
      startsAt: at(-3 * HOUR),
      startTime: null,
      endsAt: null,
      location: "27동",
    });

    expect(sentMail).toEqual([]);
  });

  it("취소된 세미나는 일정을 바꿀 수 없다", async () => {
    const id = await published();
    await cancelSeminar(id, { memberId: "admin-1", isAdmin: true });

    await expect(updateSeminarSchedule(id, SCHEDULE)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
  });
});

describe("cancelSeminar — 취소", () => {
  it("공개된 세미나를 취소하면 출석 이벤트도 취소된다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, SCHEDULE);
    await publishSeminar(seminar.id);

    await cancelSeminar(seminar.id, { memberId: "admin-1", isAdmin: true });

    expect((await getTable("seminars"))[0].publicationStatus).toBe("cancelled");
    expect((await getTable("events"))[0].status).toBe("cancelled");
  });

  // 기록은 사료다 — 관리자에게는 남고, 회원·공개 면에서만 사라진다.
  it("활동과 출석 기록은 지우지 않는다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, SCHEDULE);
    await publishSeminar(seminar.id);

    await cancelSeminar(seminar.id, { memberId: "admin-1", isAdmin: true });

    const activities = await getTable("activities");
    expect(activities).toHaveLength(1);
    expect(activities[0].attendeeIds).toEqual(seminar.presenterIds);
  });

  it("일정 확정 전에도 취소할 수 있다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");

    await cancelSeminar(seminar.id, { memberId: "admin-1", isAdmin: true });

    expect((await getTable("seminars"))[0].publicationStatus).toBe("cancelled");
    expect(await getTable("events")).toEqual([]);
  });

  it("두 번 취소해도 한 번 취소한 것과 같다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, SCHEDULE);
    await publishSeminar(seminar.id);

    await cancelSeminar(seminar.id, { memberId: "admin-1", isAdmin: true });
    await cancelSeminar(seminar.id, { memberId: "admin-1", isAdmin: true });

    expect((await getTable("seminars"))[0].publicationStatus).toBe("cancelled");
    expect((await getTable("events"))[0].status).toBe("cancelled");
  });
});

describe("취소 재적용 — 남은 이벤트를 다시 덮는다", () => {
  /**
   * 취소의 이벤트 정리가 CAS를 다섯 번 내리 잃으면(`WRITE_CONFLICT`) 세미나는
   * `cancelled`인데 출석 이벤트는 `active`로 남는다. 같은 호출을 다시 하는 것이
   * 복구여야 한다 — 그러지 않으면 손으로 데이터를 고치는 수밖에 없다.
   */
  it("이미 취소된 세미나에 다시 취소를 걸면 남은 이벤트가 정리된다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, SCHEDULE);
    await publishSeminar(seminar.id);
    await cancelSeminar(seminar.id, { memberId: "admin-1", isAdmin: true });
    // 정리가 끝나기 전에 죽은 상태를 만든다.
    await mutate("events", (rows) =>
      rows.map((e) => ({ ...e, status: "active" as const })),
    );
    sentMail.length = 0;

    await cancelSeminar(seminar.id, { memberId: "admin-1", isAdmin: true });

    expect((await getTable("events"))[0].status).toBe("cancelled");
    expect(sentMail).toEqual([]); // 복구는 공지를 다시 보내지 않는다
  });
});

describe("취소 공지", () => {
  async function publishedAt(startOffsetMs: number) {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, {
      startsAt: at(startOffsetMs),
      startTime: null,
      endsAt: null,
      location: "27동",
    });
    await publishSeminar(seminar.id);
    sentMail.length = 0;
    return seminar.id;
  }

  it("공지된 세미나를 취소하면 취소 사실을 알린다", async () => {
    const id = await publishedAt(10 * 24 * HOUR);

    await cancelSeminar(id, { memberId: "admin-1", isAdmin: true });

    expect(sentMail.map((m) => m.event)).toEqual(["seminar.cancelled"]);
    expect(sentMail[0].vars.title).toBe("정수론 입문");
  });

  // 알린 적 없는 세미나의 취소를 알리면 "있었는지도 몰랐던 세미나가 취소됐다"가 된다.
  it("공개되지 않은 세미나의 취소는 알리지 않는다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    sentMail.length = 0;

    await cancelSeminar(seminar.id, { memberId: "admin-1", isAdmin: true });

    expect(sentMail).toEqual([]);
  });

  it("이미 열린 세미나의 취소는 알리지 않는다 — 기록 정정이다", async () => {
    const id = await publishedAt(-3 * HOUR);

    await cancelSeminar(id, {
      memberId: "admin-1",
      isAdmin: true,
      acknowledgeStarted: true,
    });

    expect(sentMail).toEqual([]);
  });

  it("두 번 취소해도 공지는 한 번이다", async () => {
    const id = await publishedAt(10 * 24 * HOUR);

    await cancelSeminar(id, { memberId: "admin-1", isAdmin: true });
    await cancelSeminar(id, { memberId: "admin-1", isAdmin: true });

    expect(sentMail).toHaveLength(1);
  });
});

describe("공지 재발송", () => {
  /**
   * 메일이 실패하면 `publishSeminar`가 앵커를 되돌려 놓는다. 그래서 같은 공개를
   * 다시 실행하는 것이 재발송이다 — 화면에는 그 버튼이 없어 안내가 헛말이었다
   * (이제 `canResendNotice`가 버튼을 되살린다).
   */
  it("발송 실패 후 다시 공개하면 공지가 나간다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, SCHEDULE);

    mailOutcome.ok = false;
    const first = await publishSeminar(seminar.id);
    expect(first.mailFailed).toBe(true);
    // 되돌려졌으므로 재발송 대상으로 보인다.
    expect((await getTable("seminars"))[0].announcedAt).toBeNull();

    sentMail.length = 0;
    mailOutcome.ok = true;
    const second = await publishSeminar(seminar.id);

    expect(second.mailFailed).toBe(false);
    expect(sentMail.map((m) => m.event)).toContain("seminar.published");
    expect((await getTable("seminars"))[0].announcedAt).not.toBeNull();
  });

  it("이미 공지된 세미나를 다시 공개해도 두 번 보내지 않는다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, SCHEDULE);
    await publishSeminar(seminar.id);
    sentMail.length = 0;

    await publishSeminar(seminar.id);

    expect(sentMail).toEqual([]);
  });
});

describe("공지 발송 실패는 삼키지 않는다", () => {
  /**
   * 전 회원 메일은 실패해도 예외를 던지지 않는다(§5-7: 메일이 본 동작을 막지
   * 않는다). 그렇다면 **호출자가 그 사실을 들어야** 한다 — 공개 경로는 이미
   * `mailFailed`로 관리자에게 알리는데, 변경·취소 경로는 결과를 버리고 있어
   * 아무도 재발송이 필요하다는 것을 알 수 없었다.
   */
  async function published() {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, SCHEDULE);
    await publishSeminar(seminar.id);
    sentMail.length = 0;
    return seminar.id;
  }

  it("일정 변경 공지 실패를 알린다", async () => {
    const id = await published();
    mailOutcome.ok = false;

    const { mailFailed } = await updateSeminarSchedule(id, {
      ...SCHEDULE,
      location: "다른 곳",
    });

    expect(mailFailed).toBe(true);
  });

  it("취소 공지 실패를 알린다", async () => {
    const id = await published();
    mailOutcome.ok = false;

    const { mailFailed } = await cancelSeminar(id, {
      memberId: "admin-1",
      isAdmin: true,
    });

    expect(mailFailed).toBe(true);
  });

  it("보낼 공지가 없으면 실패도 아니다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    mailOutcome.ok = false;

    const { mailFailed } = await cancelSeminar(seminar.id, {
      memberId: "admin-1",
      isAdmin: true,
    });

    expect(mailFailed).toBe(false);
  });
});

describe("취소 권한 — 개설자와 관리자", () => {
  const ADMIN = { memberId: "admin-1", isAdmin: true };

  async function publishedSeminar(startOffsetMs: number) {
    const request = await pendingRequest();
    await approveSeminar(request.id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, {
      startsAt: at(startOffsetMs),
      startTime: null,
      endsAt: null,
      location: "27동",
    });
    await publishSeminar(seminar.id);
    return { id: seminar.id, presenter: seminar.presenterIds[0] };
  }

  it("개설자는 시작 전 자기 세미나를 취소할 수 있다", async () => {
    const { id, presenter } = await publishedSeminar(10 * 24 * HOUR);

    await cancelSeminar(id, { memberId: presenter, isAdmin: false });

    expect((await getTable("seminars"))[0].publicationStatus).toBe("cancelled");
  });

  // 이미 열린 세미나를 개설자가 지울 수 있으면 출석 기록이 조용히 사라진다.
  it("개설자는 이미 시작된 세미나를 취소할 수 없다", async () => {
    const { id, presenter } = await publishedSeminar(-2 * HOUR);

    await expect(
      cancelSeminar(id, { memberId: presenter, isAdmin: false }),
    ).rejects.toSatisfy((e) => e instanceof AppError && e.code === "FORBIDDEN");
    expect((await getTable("seminars"))[0].publicationStatus).toBe("published");
  });

  it("남의 세미나는 취소할 수 없다", async () => {
    const { id } = await publishedSeminar(10 * 24 * HOUR);

    await expect(
      cancelSeminar(id, { memberId: "someone-else", isAdmin: false }),
    ).rejects.toSatisfy((e) => e instanceof AppError && e.code === "FORBIDDEN");
  });

  // 관리자는 가능하되, 되돌릴 수 없는 조작이라 명시적 확인을 요구한다.
  it("관리자도 시작된 세미나는 확인 없이 취소할 수 없다", async () => {
    const { id } = await publishedSeminar(-2 * HOUR);

    await expect(cancelSeminar(id, ADMIN)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
  });

  it("관리자가 확인하면 시작된 세미나도 취소된다", async () => {
    const { id } = await publishedSeminar(-2 * HOUR);

    await cancelSeminar(id, { ...ADMIN, acknowledgeStarted: true });

    expect((await getTable("seminars"))[0].publicationStatus).toBe("cancelled");
  });

  // 이주로 일정을 잃은 레거시 공개 행은 이미 치른 세미나다. `schedule`이 비었다는
  // 이유로 "아직 안 열렸다"로 읽으면 몇 해 전 세미나를 개설자가 조용히 지운다.
  it("일정이 비어 있는 공개 세미나는 이미 열린 것으로 다룬다", async () => {
    const { id, presenter } = await publishedSeminar(10 * 24 * HOUR);
    await mutate("seminars", (rows) =>
      rows.map((s) => (s.id === id ? { ...s, schedule: null } : s)),
    );

    await expect(
      cancelSeminar(id, { memberId: presenter, isAdmin: false }),
    ).rejects.toSatisfy((e) => e instanceof AppError && e.code === "FORBIDDEN");
    await expect(cancelSeminar(id, ADMIN)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );

    await cancelSeminar(id, { ...ADMIN, acknowledgeStarted: true });
    expect((await getTable("seminars"))[0].publicationStatus).toBe("cancelled");
  });

  it("시작 전 세미나에는 확인이 필요 없다", async () => {
    const { id } = await publishedSeminar(10 * 24 * HOUR);

    await cancelSeminar(id, ADMIN);

    expect((await getTable("seminars"))[0].publicationStatus).toBe("cancelled");
  });
});

describe("취소 권한은 캐시가 아니라 그 순간의 행으로 판정한다", () => {
  /**
   * 표 읽기는 최대 15초까지 낡을 수 있다. 관리자가 일정을 지난 시각으로
   * 고친 직후, 개설자의 취소가 **낡은 스냅샷**을 보고 "아직 안 열렸다"로
   * 통과하면 이미 치른 세미나의 출석 기록이 회원 면에서 사라진다.
   * 캐시를 건드리지 않고 저장소만 바꿔 그 창을 그대로 만든다.
   */
  async function rewriteScheduleBehindTheCache(id: string, startsAt: string) {
    const docs = await __docs("table");
    const stored = docs.get("seminars")!;
    const envelope = structuredClone(stored.doc) as {
      rows: { id: string; schedule: { startsAt: string } | null }[];
    };
    for (const row of envelope.rows) {
      if (row.id === id && row.schedule) row.schedule.startsAt = startsAt;
    }
    await __putRawDoc("table", "seminars", envelope);
  }

  it("낡은 일정으로 이미 열린 세미나를 취소할 수 없다", async () => {
    const request = await pendingRequest();
    await approveSeminar(request.id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, {
      startsAt: at(10 * 24 * HOUR),
      startTime: null,
      endsAt: null,
      location: "27동",
    });
    await publishSeminar(seminar.id);
    await getTable("seminars"); // 캐시를 데운다 — 이후 판정이 이것을 본다
    await rewriteScheduleBehindTheCache(seminar.id, at(-3 * HOUR));

    await expect(
      cancelSeminar(seminar.id, {
        memberId: seminar.presenterIds[0],
        isAdmin: false,
      }),
    ).rejects.toSatisfy((e) => e instanceof AppError && e.code === "FORBIDDEN");
  });
});

describe("학기 — 자동 도출과 관리자 결정", () => {
  /**
   * 방학 학기(`YY-S`/`YY-W`)는 `termOf`가 **만들 수 없는 값**이다 — 정규 학기
   * 둘만 돌려준다. 그런 행에 자동 도출을 적용하면 사람이 적어 둔 라벨이 반드시
   * 사라진다. 운영 DB에 여름·겨울 세미나가 8건 있고, 그 행들은 이주분이라
   * `semesterPinned`도 false다.
   */
  it("방학 학기는 일정 변경이 덮지 않는다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    await mutate("seminars", (rows) =>
      rows.map((r) =>
        r.id === seminar.id
          ? {
              ...r,
              semester: "25-W",
              publicationStatus: "published" as const,
              semesterPinned: false,
              schedule: SCHEDULE,
            }
          : r,
      ),
    );

    await updateSeminarSchedule(seminar.id, {
      ...SCHEDULE,
      location: "다른 곳",
    });

    expect((await getTable("seminars"))[0].semester).toBe("25-W");
  });

  it("정규 학기는 종전대로 일정에서 도출한다", async () => {
    await approveSeminar((await pendingRequest()).id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, SCHEDULE);
    await publishSeminar(seminar.id);

    const moved = {
      startsAt: at(400 * 24 * HOUR),
      startTime: null,
      endsAt: null,
      location: "27동",
    };
    await updateSeminarSchedule(seminar.id, moved);

    expect((await getTable("seminars"))[0].semester).toBe(
      termOf(new Date(moved.startsAt)),
    );
  });

  it("관리자가 직접 정한 학기는 일정 변경이 덮지 않는다", async () => {
    await mutate("seminars", (rows) => [
      ...rows,
      {
        id: "pinned-1",
        title: "손으로 적은 기록",
        semester: "24-2",
        note: "",
        description: "",
        presenterIds: [],
        externalPresenters: "",
        materials: [],
        photos: [],
        posterKey: "",
        preferredTiming: "",
        publicationStatus: "published" as const,
        schedule: null,
        announcedAt: null,
        semesterPinned: true,
        activityId: null,
        sourceRequestId: null,
      },
    ]);

    await updateSeminarSchedule("pinned-1", SCHEDULE);

    const row = (await getTable("seminars")).find((s) => s.id === "pinned-1")!;
    expect(row.semester).toBe("24-2"); // 자동 도출이 관리자 결정을 이기지 않는다
    expect(row.schedule).toEqual(SCHEDULE);
  });

  it("고정되지 않은 기록은 일정에서 자동으로 도출한다", async () => {
    const request = await pendingRequest();
    await approveSeminar(request.id);
    const [seminar] = await getTable("seminars");
    await scheduleSeminar(seminar.id, SCHEDULE);
    await publishSeminar(seminar.id);

    const moved = { ...SCHEDULE, startsAt: at(200 * 24 * HOUR), endsAt: null };
    await updateSeminarSchedule(seminar.id, moved);

    const [updated] = await getTable("seminars");
    expect(updated.semester).toBe(termOf(new Date(moved.startsAt)));
  });
});
