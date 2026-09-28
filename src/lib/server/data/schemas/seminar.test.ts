import { describe, expect, it } from "vitest";
import { SEMINAR_PUBLICATION_STATUSES } from "$lib/domain/seminars";
import type { SeminarSchedule as DomainSeminarSchedule } from "$lib/domain/admin-seminars";
import { SeminarSchema, type SeminarSchedule } from "./seminar";

/**
 * 세미나는 승인 즉시 공개되지 않는다 (FRONTEND-DECISIONS §3-1):
 * 승인 → 일정 미정 → 일정 확정 → 공개. 그 상태와 확정된 일정이 저장돼야
 * 관리자 화면이 단계를 구분할 수 있다 — 지금은 `activityId` 유무로 추측하고
 * 있어 승인된 것이 전부 "공개"로 보인다.
 */

const base = {
  id: "sem1",
  title: "정수론 세미나",
  semester: "26-2",
  note: "설명",
  presenterIds: ["m1"],
  externalPresenters: "",
  materials: [],
  photos: [],
  publicationStatus: "published" as const,
  kind: null,
  durationMinutes: null,
  prerequisites: "",
  announce: true,
  activityId: null,
  sourceRequestId: null,
};

/**
 * 구분(정기/비정기)·소요 시간·선수지식은 세미나 자신의 기록이다 (결정 #7·#12).
 * 관리자 편집기가 보내던 값을 액션이 버렸고, 화면은 신청서에서 빌려 오거나
 * (`kind`를 sourceRequestId 유무로 추측) 지어냈다(소요 시간 60분). 공지 대상
 * 여부(`announce`)는 기록을 직접 만든 경우와 신청 흐름을 가른다 (결정 #21).
 * 이주 규칙은 마이그레이션 20260928000300이 한 번 적는다 — 기본값은 없다.
 */
describe("SeminarSchema — 기록 필드", () => {
  it.each(["kind", "durationMinutes", "prerequisites", "announce"] as const)(
    "%s가 없는 행은 거부한다 (기본값에 기대지 않는다)",
    (key) => {
      const row: Record<string, unknown> = { ...base };
      delete row[key];

      expect(SeminarSchema.safeParse(row).success).toBe(false);
    },
  );

  it("구분·소요 시간·선수지식을 그대로 보관한다", () => {
    const parsed = SeminarSchema.parse({
      ...base,
      kind: "irregular",
      durationMinutes: 90,
      prerequisites: "선형대수",
      announce: false,
    });

    expect(parsed).toMatchObject({
      kind: "irregular",
      durationMinutes: 90,
      prerequisites: "선형대수",
      announce: false,
    });
  });

  it("구분은 정기·비정기·미상(null)뿐이다", () => {
    expect(SeminarSchema.safeParse({ ...base, kind: "regular" }).success).toBe(
      true,
    );
    expect(SeminarSchema.safeParse({ ...base, kind: "weekly" }).success).toBe(
      false,
    );
  });

  it("소요 시간은 입력 폼과 같은 범위의 정수 분이다", () => {
    const ok = (durationMinutes: unknown) =>
      SeminarSchema.safeParse({ ...base, durationMinutes }).success;

    expect(ok(10)).toBe(true);
    expect(ok(600)).toBe(true);
    expect(ok(9)).toBe(false);
    expect(ok(601)).toBe(false);
    expect(ok(60.5)).toBe(false);
    expect(ok("60")).toBe(false);
  });
});

describe("SeminarSchema — 공개 상태와 일정", () => {
  // 이주 규칙("필드가 없던 행은 공개된 세미나")은 마이그레이션
  // 20260928000100이 디스크에 한 번 적었다 — 스키마는 더 이상 추측하지 않는다.
  it("공개 상태가 없는 행은 거부한다", () => {
    const { publicationStatus: _omit, ...legacy } = base;
    void _omit;

    expect(SeminarSchema.safeParse(legacy).success).toBe(false);
  });

  it("일정이 없던 기존 행은 일정 없음으로 읽힌다", () => {
    expect(SeminarSchema.parse(base).schedule).toBeNull();
  });

  /**
   * 세미나의 **개요**는 노션 페이지 본문에 있었고 속성이 아니었다. 이주가 속성만
   * 읽는 바람에 25건 모두 설명 없이 넘어왔고, 공개 상세의 "1. 개요"가 비었다.
   * 그 글이 살 자리를 만든다 — `note`(비고)와는 다른 것이다.
   */
  it("설명은 비고와 별개의 자리를 가진다", () => {
    const parsed = SeminarSchema.parse({ ...base, description: "개요 본문" });

    expect(parsed.description).toBe("개요 본문");
    expect(parsed.note).toBe("설명"); // 비고는 그대로
  });

  it("설명이 없던 기존 행은 빈 문자열로 읽힌다", () => {
    expect(SeminarSchema.parse(base).description).toBe("");
  });

  it("새 세미나는 일정 미정으로 만들 수 있다", () => {
    const parsed = SeminarSchema.parse({
      ...base,
      publicationStatus: "unscheduled",
    });

    expect(parsed.publicationStatus).toBe("unscheduled");
  });

  it("확정된 일정은 시작·종료·장소를 함께 보관한다", () => {
    const schedule = {
      startsAt: "2026-10-15T19:00:00+09:00",
      startTime: null,
      endsAt: "2026-10-15T21:00:00+09:00",
      location: "27동 325호",
    };

    expect(
      SeminarSchema.parse({ ...base, publicationStatus: "scheduled", schedule })
        .schedule,
    ).toEqual(schedule);
  });

  it("종료 시각은 비워 둘 수 있다", () => {
    const schedule = {
      startsAt: "2026-10-15T19:00:00+09:00",
      startTime: null,
      endsAt: null,
      location: "27동",
    };

    expect(
      SeminarSchema.parse({ ...base, schedule }).schedule?.endsAt,
    ).toBeNull();
  });

  it("상태 집합은 도메인과 같은 목록이다", () => {
    for (const status of SEMINAR_PUBLICATION_STATUSES) {
      expect(
        SeminarSchema.parse({ ...base, publicationStatus: status })
          .publicationStatus,
      ).toBe(status);
    }
    expect(() =>
      SeminarSchema.parse({ ...base, publicationStatus: "draft" }),
    ).toThrow();
  });

  it("일정의 시각은 ISO 8601이어야 한다 (오프셋 또는 Z)", () => {
    const ok = (startsAt: string) =>
      SeminarSchema.safeParse({
        ...base,
        schedule: { startsAt, endsAt: null, location: "x" },
      }).success;

    expect(ok("2026-10-15 19:00")).toBe(false); // 공백 구분 — 거절
    expect(ok("2026-10-15T19:00:00+09:00")).toBe(true);
    expect(ok("2026-10-15T10:00:00Z")).toBe(true); // Z도 유효한 instant다
  });

  // 저장 스키마가 입력 폼보다 헐거우면 "장소는 여기가 유일한 자리"가 빈 값으로 퇴화한다.
  it("장소는 비어 있을 수 없고 길이 상한이 있다", () => {
    const withLocation = (location: string) =>
      SeminarSchema.safeParse({
        ...base,
        schedule: {
          startsAt: "2026-10-15T19:00:00+09:00",
          startTime: null,
          endsAt: null,
          location,
        },
      }).success;

    expect(withLocation("")).toBe(false);
    expect(withLocation("x".repeat(161))).toBe(false);
    expect(withLocation("27동 325호")).toBe(true);
  });

  /**
   * 노션 원본의 `일정`은 **날짜만** 적힌 것이 대부분이다(24/24). 그것을 자정으로
   * 저장하면 화면이 "오전 12:00"이라는 **없던 사실**을 말하게 된다. 그래서 시각은
   * 따로, null을 가질 수 있게 둔다 — null은 "시각을 모른다"는 뜻이고, 화면은
   * 그때 날짜만 보여 준다.
   */
  it("시각은 모를 수 있다 — null이 곧 미상이다", () => {
    const parsed = SeminarSchema.parse({
      ...base,
      schedule: {
        startsAt: "2025-03-21T00:00:00+09:00",
        startTime: null,
        endsAt: null,
        location: "기록 없음",
      },
    });

    expect(parsed.schedule?.startTime).toBeNull();
  });

  it("시각을 알면 HH:mm으로 함께 적는다", () => {
    const parsed = SeminarSchema.parse({
      ...base,
      schedule: {
        startsAt: "2026-10-15T19:00:00+09:00",
        startTime: "19:00",
        endsAt: null,
        location: "27동",
      },
    });

    expect(parsed.schedule?.startTime).toBe("19:00");
  });

  // 두 자리에 같은 사실이 사는 만큼, 어긋나면 어느 쪽을 믿을지 알 수 없다.
  it("적어 둔 시각은 시작 시각과 같아야 한다", () => {
    const withTime = (startTime: string) =>
      SeminarSchema.safeParse({
        ...base,
        schedule: {
          startsAt: "2026-10-15T19:00:00+09:00",
          startTime,
          endsAt: null,
          location: "27동",
        },
      }).success;

    expect(withTime("19:00")).toBe(true);
    expect(withTime("07:30")).toBe(false);
  });

  it("시각 필드가 없던 기존 행은 미상으로 읽힌다", () => {
    const parsed = SeminarSchema.parse({
      ...base,
      schedule: {
        startsAt: "2026-10-15T19:00:00+09:00",
        startTime: null,
        endsAt: null,
        location: "27동",
      },
    });

    expect(parsed.schedule?.startTime).toBeNull();
  });

  it("종료 시각은 시작보다 늦어야 한다", () => {
    const range = (startsAt: string, endsAt: string) =>
      SeminarSchema.safeParse({
        ...base,
        schedule: { startsAt, endsAt, location: "27동" },
      }).success;

    expect(
      range("2026-10-15T19:00:00+09:00", "2026-10-15T18:00:00+09:00"),
    ).toBe(false);
    expect(
      range("2026-10-15T19:00:00+09:00", "2026-10-15T21:00:00+09:00"),
    ).toBe(true);
  });

  // 감사 LA26-1: 순서를 문자열로 비교해서, 오프셋이 다르면 판정이 뒤집혔다.
  it("오프셋이 달라도 instant로 순서를 본다", () => {
    const range = (startsAt: string, endsAt: string) =>
      SeminarSchema.safeParse({
        ...base,
        schedule: { startsAt, endsAt, location: "27동" },
      }).success;

    // 종료 = 19:30 KST, 시작 30분 뒤 — 문자열로는 앞선다
    expect(range("2026-10-15T19:00:00+09:00", "2026-10-15T10:30:00Z")).toBe(
      true,
    );
    // 시작 = 16일 07:00 KST, 종료는 그보다 10시간 앞 — 문자열로는 뒤다
    expect(
      range("2026-10-15T19:00:00-03:00", "2026-10-15T21:00:00+09:00"),
    ).toBe(false);
  });

  // 같은 모양이 도메인 DTO와 저장 스키마 두 곳에 선언돼 있다. 갈라지면 zod가
  // 미지의 키를 조용히 벗겨내므로(저장 시 소실) 컴파일 시점에 묶어 둔다.
  it("저장 일정 모양이 도메인 DTO와 같다", () => {
    const fromDomain: DomainSeminarSchedule = {
      startsAt: "2026-10-15T19:00:00+09:00",
      startTime: null,
      endsAt: null,
      location: "27동",
    };
    const stored: SeminarSchedule = fromDomain;
    const backToDomain: DomainSeminarSchedule = stored;

    expect(backToDomain).toEqual(fromDomain);
  });
});
