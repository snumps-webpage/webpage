import { z } from "zod";
import { SEMINAR_PUBLICATION_STATUSES } from "$lib/domain/seminars";
import { DateTime, Id, Semester, SourceRequestId } from "./common";

// 공개 상태의 닫힌 집합은 도메인이 단일 원천 — 관리자 화면이 같은 목록으로
// 칼럼을 나눈다 (seminar-request.ts가 SEMINAR_TIMING_OPTIONS를 다루는 방식과 동일).
export const SeminarPublicationStatus = z.enum(SEMINAR_PUBLICATION_STATUSES);
export type SeminarPublicationStatus = z.infer<typeof SeminarPublicationStatus>;

/**
 * 확정된 세미나 일정.
 *
 * **소유권**: 여기가 *의도된 일정*의 원천이고, `events.date`는 *출석 창*의
 * 원천이다. 공개가 이 값을 event·activity로 복사하고, 이후 일정 수정은 셋을
 * 한 작업으로 다시 맞춘다 (§3-1 7항). 읽는 쪽이 헷갈리지 않도록 방향을
 * 한쪽으로 고정한다 — event에서 세미나 일정을 역산하지 않는다.
 *
 * **장소는 중복이 아니다**: activity에도 event에도 장소 필드가 없다. 공개 전
 * 세미나는 event 자체가 없는데 관리자는 그때 장소를 입력한다.
 *
 * 검증 강도는 입력 폼(`seminarScheduleInputSchema`)과 맞춘다 — 저장 계층이
 * 폼보다 헐거우면 "유일한 자리"라는 주장이 빈 문자열로 퇴화한다.
 */
/** KST 기준 "HH:mm" — 화면이 읽는 시각. */
const KST_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 어떤 시간대로 적혀 있든 KST의 벽시계 시각을 뽑는다. */
function kstClock(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export const SeminarScheduleSchema = z
  .object({
    startsAt: DateTime,
    /**
     * 시작 **시각**. `null`은 "모른다"는 뜻이다.
     *
     * 왜 따로 두나: 이주된 세미나의 원본(노션 `일정`)은 대부분 **날짜만** 적혀
     * 있다. 그것을 자정 instant로만 저장하면 화면이 "오전 12:00"이라는 없던
     * 사실을 말한다. 날짜는 사실이고 시각은 모르는 것이므로, 모르는 것을
     * null로 적는다 — 화면은 그때 날짜만 보여 준다.
     *
     * `startsAt`은 활동·출석 이벤트가 쓰는 instant라 그대로 둔다(시각 미상이면
     * 자정). 두 자리가 어긋나지 않도록 아래에서 묶는다.
     */
    startTime: z.string().regex(KST_TIME).nullable().default(null),
    endsAt: DateTime.nullable(),
    location: z.string().min(1).max(160),
  })
  .refine((s) => s.endsAt === null || s.endsAt > s.startsAt, {
    path: ["endsAt"],
    message: "endsAt must be later than startsAt",
  })
  .refine((s) => s.startTime === null || s.startTime === kstClock(s.startsAt), {
    path: ["startTime"],
    message: "startTime must match the KST clock time of startsAt",
  });
export type SeminarSchedule = z.infer<typeof SeminarScheduleSchema>;

export const SeminarSchema = z.object({
  id: Id,
  title: z.string().min(1),
  semester: Semester,
  note: z.string(),
  /**
   * 세미나 소개글. 노션 원본에서는 페이지 **본문**의 `개요` 절이었고, 이주는
   * 속성만 읽었으므로 한 건도 넘어오지 않았다 — 공개 상세의 "1. 개요"가 비어
   * 있던 이유다. `note`(비고)와는 다른 글이라 자리를 따로 둔다.
   */
  description: z.string().default(""),
  presenterIds: z.array(Id),
  externalPresenters: z.string(), // non-member presenters, free text
  materials: z.array(z.string()), // s3Keys
  photos: z.array(z.string()), // s3Keys
  // 세미나가 소유하는 포스터의 assets 키 (직접 업로드분). 빈 값이면 자동 생성
  // 포스터를 쓴다. 파일 바이트는 assets 버킷, 여기엔 참조 키만.
  posterKey: z.string().default(""),
  // 신청자 선호 세미나 시점 (승인 시 신청서에서 이관 — 조율 참고 기록)
  preferredTiming: z.string().default(""),
  /**
   * 승인 → 일정 미정 → 확정 → 공개 수명주기 (FRONTEND-DECISIONS §3-1).
   *
   * 기본값이 `published`인 것이 **이주 규칙**이다: 이 필드가 없는 기존 행은
   * 승인 즉시 activity·event까지 만들던 시절의 것이라 이미 공개된 세미나다.
   * 새로 만드는 세미나는 approveSeminar가 명시적으로 `unscheduled`를 넣는다.
   *
   * ⚠️ **일방통행이다.** 기본값은 읽을 때만 씌우는 렌즈가 아니다 — `mutate`가
   * 표 문서 전체를 다시 쓰므로, 아무 세미나 한 건만 수정해도 그 순간 손대지
   * 않은 행에까지 이 값이 **디스크에 기록**된다(실행으로 확인). "필드가
   * 없었다"는 사실은 그때 영구 소멸하고 명시적 결정과 구분되지 않는다.
   * 규칙을 바꿀 거라면 첫 쓰기 전에 바꿔야 한다.
   */
  publicationStatus: SeminarPublicationStatus.default("published"),
  /** 확정 전에는 null. 공개 시 이 값으로 activity·event의 날짜를 만든다. */
  schedule: SeminarScheduleSchema.nullable().default(null),
  /**
   * 전 회원 공지를 실제로 보낸 시각. 공개 상태와 **분리된** 사실이다.
   *
   * 공개 CAS가 커밋된 뒤 메일이 실패하면 재실행이 상태만 보고 "이미 공개됨"으로
   * 튕겨 공지가 영영 안 나가고, 반대로 상태를 되감으면 공지가 두 번 나간다.
   * 둘 다 실측된 결함이다. 발송 여부는 이 앵커가 혼자 결정한다.
   */
  announcedAt: DateTime.nullable().default(null),
  /**
   * 학기를 관리자가 직접 정했다는 표시.
   *
   * 학기는 기본적으로 확정된 일정에서 자동 도출된다(결정 4). 그러나 관리자가
   * 아카이브 기록에 학기를 직접 입력했다면 그 결정이 자동 도출보다 위다 —
   * 손으로 적은 "24-2"가 일정 입력 한 번에 조용히 바뀌면 안 된다.
   */
  semesterPinned: z.boolean().default(false),
  activityId: Id.nullable(), // archive↔activity link, stamped at publication
  sourceRequestId: SourceRequestId,
});

export type Seminar = z.infer<typeof SeminarSchema>;
