import { z } from "zod";
import { SEMINAR_PUBLICATION_STATUSES } from "$lib/domain/admin-seminars";
import { DateTime, Id, Semester, SourceRequestId } from "./common";

// 공개 상태의 닫힌 집합은 도메인이 단일 원천 — 관리자 화면이 같은 목록으로
// 칼럼을 나눈다 (seminar-request.ts가 SEMINAR_TIMING_OPTIONS를 다루는 방식과 동일).
export const SeminarPublicationStatus = z.enum(SEMINAR_PUBLICATION_STATUSES);
export type SeminarPublicationStatus = z.infer<typeof SeminarPublicationStatus>;

/** 확정된 세미나 일정. 장소는 event/activity가 갖지 않으므로 여기가 유일한 자리다. */
export const SeminarScheduleSchema = z.object({
  startsAt: DateTime,
  endsAt: DateTime.nullable(),
  location: z.string(),
});
export type SeminarSchedule = z.infer<typeof SeminarScheduleSchema>;

export const SeminarSchema = z.object({
  id: Id,
  title: z.string().min(1),
  semester: Semester,
  note: z.string(),
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
   */
  publicationStatus: SeminarPublicationStatus.default("published"),
  /** 확정 전에는 null. 공개 시 이 값으로 activity·event의 날짜를 만든다. */
  schedule: SeminarScheduleSchema.nullable().default(null),
  activityId: Id.nullable(), // archive↔activity link, stamped at publication
  sourceRequestId: SourceRequestId,
});

export type Seminar = z.infer<typeof SeminarSchema>;
