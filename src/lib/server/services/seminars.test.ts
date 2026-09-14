import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import { newId } from "$lib/server/core/id";
import { toKstIso } from "$lib/server/core/time";
import { termOf } from "$lib/server/core/semester";
import { approveSeminar, submitSeminarRequest } from "./seminar-requests";
import { publishSeminar, scheduleSeminar } from "./seminars";

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

  // 초판 테스트는 두 번째 호출을 그냥 이어 불렀는데, 그건 진입 검사에서 튕겨
  // ensureCreated에 닿지도 않았다 — 멱등을 하나도 검증하지 못하는 공허한 단언이었다.
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
    expect(published.announcedAt).not.toBeNull(); // 되살아나지 않게 앵커는 찍는다
  });
});
