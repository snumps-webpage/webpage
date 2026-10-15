/**
 * 회원·게스트에게서 가려야 할 활동 id — **이 규칙의 유일한 정의**다(공개 아카이브
 * 레이아웃도 이것을 부른다; 예전엔 사본이 따로 있었다 — 감사 LB21-1). 서버는
 * `services/visibility.ts`를 거쳐 쓰고, 순수 함수라 ops 스크립트
 * (scripts/ops/ops-promote-regular.ts)도 상대 경로로 같은 정의를 쓴다.
 *
 * - 공개되지 않은(미정·확정·취소) 세미나의 활동
 * - 출석 이벤트가 있고 **그 전부가 취소된** 활동 — 취소된 스터디 회차는 열리지
 *   않은 활동이다. 예전엔 이벤트만 취소되고 활동은 공개 달력·대시보드·회원
 *   이력에 남았다(감사 LB31-1). 이벤트가 없는 활동(기록 편집기로 만든 것)은
 *   건드리지 않는다.
 */
export function hiddenActivityIdsOf(
  seminars: readonly {
    publicationStatus: string;
    activityId: string | null;
  }[],
  events: readonly { activityId: string; status: string }[],
): Set<string> {
  const hidden = new Set<string>();
  for (const s of seminars) {
    if (s.publicationStatus !== "published" && s.activityId)
      hidden.add(s.activityId);
  }
  const live = new Set<string>();
  const withEvents = new Set<string>();
  for (const e of events) {
    withEvents.add(e.activityId);
    if (e.status !== "cancelled") live.add(e.activityId);
  }
  for (const id of withEvents) if (!live.has(id)) hidden.add(id);
  return hidden;
}
