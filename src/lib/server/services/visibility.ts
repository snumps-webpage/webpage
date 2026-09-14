import { getTable } from "$lib/server/data/tables";
import type { Activity, Event } from "$lib/server/data/schemas";

/**
 * 취소·미공개 세미나를 회원과 게스트에게서 가리는 **단 하나의 자리**.
 *
 * 왜 한 곳인가: 숨김을 경로마다 뿌리면 다음에 추가되는 경로가 반드시 빠뜨린다.
 * 이 저장소는 그 실패를 이미 겪었다 — 감사 `ZR-8`은 "렌더하지 않는다"가
 * "게시하지 않는다"가 아님을 기록한다. 서버 로드의 반환값은 컴포넌트가 읽든
 * 말든 통째로 SSR HTML에 직렬화되므로, 숨김은 **화면이 아니라 페이로드**에서
 * 일어나야 한다.
 *
 * 관리자 경로는 이 모듈을 쓰지 않는다 — 취소된 세미나는 관리자에게 남는다.
 */

/** 회원·게스트에게서 가려야 할 세미나의 활동 id. */
export async function hiddenActivityIds(): Promise<Set<string>> {
  const seminars = await getTable("seminars");
  const hidden = new Set<string>();
  for (const s of seminars) {
    if (s.publicationStatus === "published") continue;
    if (s.activityId) hidden.add(s.activityId);
  }
  return hidden;
}

/** 취소된 이벤트는 회원 면에서 존재하지 않는다. */
export function isVisibleToMembers(event: Event): boolean {
  return event.status !== "cancelled";
}

/**
 * 회원 화면이 이벤트를 읽는 유일한 통로.
 *
 * 이벤트 자신의 상태만 보면 우회로가 남는다 — 관리자가 `/admin/events/connect`로
 * 취소된 세미나의 활동에 **새 출석 세션**을 붙이면 `status: "active"`인 이벤트가
 * 생겨 회원 면에 되살아난다(실측). 그래서 가려진 활동에 매달린 이벤트도 함께
 * 제외한다.
 */
export async function getMemberVisibleEvents(): Promise<Event[]> {
  const [events, hidden] = await Promise.all([
    getTable("events"),
    hiddenActivityIds(),
  ]);
  return events.filter(
    (e) => isVisibleToMembers(e) && !hidden.has(e.activityId),
  );
}

/** 활동 목록에서 가려진 세미나의 것을 걷어낸다 (공개·회원 공용). */
export async function withoutHiddenActivities(
  activities: Activity[],
): Promise<Activity[]> {
  const hidden = await hiddenActivityIds();
  return activities.filter((a) => !hidden.has(a.id));
}
