import { getTable } from "$lib/server/data/tables";
import type { Activity, Event } from "$lib/server/data/schemas";
import { hiddenActivityIdsOf } from "$lib/domain/activity-visibility";

/**
 * 취소·미공개 세미나를 **회원 면에서** 가리는 자리.
 *
 * 게스트 면의 공개 아카이브 레이아웃은 표를 직접 읽어 스냅샷을 만들지만, 가릴
 * 활동은 같은 `hiddenActivityIdsOf`로 정한다 — 규칙은 한 곳이다. 양쪽 모두
 * 페이로드 단위 테스트로 묶여 있다(cancelled-visibility.test.ts).
 *
 * 왜 한 곳인가: 숨김을 경로마다 뿌리면 다음에 추가되는 경로가 반드시 빠뜨린다.
 * 이 저장소는 그 실패를 이미 겪었다 — 감사 `ZR-8`은 "렌더하지 않는다"가
 * "게시하지 않는다"가 아님을 기록한다. 서버 로드의 반환값은 컴포넌트가 읽든
 * 말든 통째로 SSR HTML에 직렬화되므로, 숨김은 **화면이 아니라 페이로드**에서
 * 일어나야 한다.
 *
 * 관리자 경로는 이 모듈을 쓰지 않는다 — 취소된 세미나는 관리자에게 남는다.
 */

/**
 * 회원·게스트에게서 가려야 할 활동 id — 규칙의 정의는 순수 모듈
 * `$lib/domain/activity-visibility.ts`에 있다(ops 스크립트도 같은 정의를 쓰도록).
 * 서버 쪽 호출자는 여기서 가져온다.
 */
export { hiddenActivityIdsOf };

export async function hiddenActivityIds(): Promise<Set<string>> {
  const [seminars, events] = await Promise.all([
    getTable("seminars"),
    getTable("events"),
  ]);
  return hiddenActivityIdsOf(seminars, events);
}

/**
 * 취소된 이벤트는 회원 면에서 존재하지 않는다. 규칙의 절반일 뿐이라(가려진
 * 활동에 매달린 이벤트는 아래에서 거른다) 모듈 밖에 내놓지 않는다 — 공개된
 * 이름이면 `events.filter(isNotCancelled)`가 온전한 규칙처럼 읽힌다 (감사 LB21-2).
 */
function isNotCancelled(event: Event): boolean {
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
  return events.filter((e) => isNotCancelled(e) && !hidden.has(e.activityId));
}

/** 활동 목록에서 가려진 세미나의 것을 걷어낸다 (공개·회원 공용). */
export async function withoutHiddenActivities(
  activities: Activity[],
): Promise<Activity[]> {
  const hidden = await hiddenActivityIds();
  return activities.filter((a) => !hidden.has(a.id));
}
