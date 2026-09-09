# `src/lib/server/notion/activities.ts`

163줄 · 함수 5개 · 활동 기록(Activities) DB 접근 계층
검토 2026-08-23 · 기준 `cd916f6` · **검증 에이전트 1회 반영 (개정판)**

> 초판은 AC-1을 🔴로 과대평가하면서 정작 **같은 5줄 안의 데이터 유실 버그를 놓쳤다.**
> §개정 이력 참조.

---

## 요약

| # | 지적 | 분류 | 심각도 |
|---|---|---|---|
| AC-9 | `has_more` 신호를 읽지 않아 relation 완전성을 확인할 수단이 없다 | 계약 위반 | 🟠 |
| **AC-10** | **`Promise.all`이 출석 기록을 "승인됐지만 미기록" 상태로 고립시킨다** | 버그 | 🔴 |
| AC-11 | `attendees`가 배열이 아니라 `""`일 수 있는데 방어가 없다 | 버그 | 🟠 |
| AC-1 | 출석 승인 후 캐시 무효화 키가 어긋난다 | 버그 | 🟠 |
| AC-12 | 활동 링크가 비 워크스페이스 회원에게 죽은 링크 | UX | 🟠 |
| AC-3 | 조회+매핑 블록 3개가 거의 동일 (107/163줄) | 중복 | 🟠 |
| AC-2 | `addAttendeeToActivity`가 CAS 없는 read-modify-write | 정합성 | 🟡 |
| AC-6 | `createActivityPage`만 raw 페이지 반환 (호출부 3곳 모두 `.id`만 씀) | 일관성 | 🟡 |
| AC-5 | `getAllActivities`만 `skipCache` 없음 | 일관성 | 🟡 |
| AC-4 · AC-8 | 캐시 키 공간 · TTL 매직 넘버 | 메모 | 🟡 |

---

## AC-9 🟠 `has_more`를 읽지 않는다

> 🔴 **초판 전면 정정.** 초판은 이 항목을 🔴🔴 최우선으로 두고
> "출석자가 지워지고 있다 · 되돌릴 수 없다"고 단정했다. **측정해 보니 사실이 아니다.**

`:154-163`이 `notionRetrieve`로 받은 relation 배열에 한 명을 더해 **속성 전체를 교체**한다.
`getPropertyValue`(`utils.ts:59`)는 `has_more`를 읽지 않는다. **구조는 그대로 사실이다.**

### 그러나 잘림은 일어나지 않고 있다

초판은 `has_more: true`를 **잘림의 증거로 해석했다.** 아니었다.
property-item 엔드포인트로 9건 전부를 페이지네이션해 실제 개수를 셌다:

```
25-2 개강 파티            페이지객체 22   실제 22   동일
수학의 구조들              페이지객체 19   실제 19   동일
수문연 정기모임             페이지객체 18   실제 18   동일
26-1 개강파티             페이지객체 16   실제 16   동일
모든 L-함수에는 이야기가 있다  페이지객체 15   실제 15   동일
26-겨울 KUSP 교류회        페이지객체 14   실제 14   동일
25-1 종강 파티            페이지객체 14   실제 14   동일
BEAF 맛보기               페이지객체 14   실제 14   동일
Introduction to topo…     페이지객체 13   실제 13   동일
                                    → 유실 0명
```

**아홉 건 모두 페이지 객체가 완전한 목록을 담고 있다.**
Notion은 `has_more`를 켜면서도 실제로는 아무것도 빼놓지 않았다.
최대 relation이 22개로 문서상 상한 25 아래다.

> 초판이 이 측정에 실패했던 이유도 기록해 둔다 — 속성 id(`Hh%5D_`)가 **이미 URL 인코딩된
> 문자열**인데 다시 인코딩해서 `Hh%255D_`로 조회했고, Notion이 빈 결과를 돌려줬다.
> 그걸 "측정 실패"로만 적고 넘어간 뒤 **메커니즘을 결과로 승격시켰다.**

### 그래서 무엇이 남는가

측정은 **오늘의 데이터가 상한 아래**라는 사실을 보였을 뿐이다. 코드에 대해서는
아무것도 증명하지 못한다. 남는 것은 이것이다 — **Notion API가 `has_more`로 "이 목록은
불완전할 수 있다"고 명시적으로 말하는데, 코드에는 그 신호를 받는 자리가 없다.**
있어야 할 검사가 없는 것이지, 아직 안 터진 것이 아니다.

읽고 → 더하고 → **전체를 덮어쓰는** 연산에서 읽기의 완전성 검사가 빠진 것은
그 자체로 논리적 결함이다. 22명이라 안 터진다는 것은 사고의 **근접도**이지 결함의
**유무**가 아니다. (초판 🔴🔴 → 2차 🟡 → **🟠**. 2차는 "지금 안 터진다"를
등급의 근거로 썼다.)

방어 비용이 낮으므로 지금 넣어두는 것이 맞다:
- `has_more`가 참이면 property-item으로 전체를 받아온 뒤 추가
- 못 받으면 **쓰기를 포기하고 예외를 던진다** — 조용히 지우는 것보다 낫다

읽기 경로(`:56`)도 같은 한계를 갖는다. 25명 초과 활동에서
`+page.server.ts:188`의 `act.attendees.includes(memberId)`가 오판할 수 있다.

---

## AC-10 🔴 승인은 됐는데 기록은 안 되는 상태로 고립된다

`admin/+page.server.ts:185-188`

```ts
await Promise.all([
  addAttendeeToActivity(event.notionPageId, memberLink.memberId),
  updateAttendanceStatus(recordId, "approved"),
]);
```

두 쓰기가 독립이고 보상 처리가 없다. `addAttendeeToActivity`가 실패해도
(레이트 리밋, 5xx, AC-9의 충돌) `updateAttendanceStatus`는 이미 진행 중이라 **커밋된다.**

그리고 `admin/+page.server.ts:57`이 출석 큐를 `status === "pending"`으로 거른다
→ **그 기록이 관리자 목록에서 사라진다.** 회원은 Activities relation에 추가된 적이 없는데,
관리자에게는 재시도할 행이 남지 않는다.

발각되지 않는 이유는 이 파일에 있다 — `addAttendeeToActivity`는 `void`를 반환하고
`:158`에서 조용히 early-return한다. **호출부는 "추가됨"·"이미 있음"·"실행 안 됨"을 구분할 수 없다.**

> AC-2(관리자 두 명 동시 클릭)보다 **훨씬 흔한 실패 경로**인데 초판은 이걸 놓쳤다.

**제안**: 순차 실행으로 바꿔 출석 추가가 성공한 뒤에만 상태를 갱신한다.
그리고 `addAttendeeToActivity`가 결과(`"added" | "already" | 예외`)를 반환하게 한다.

---

## AC-11 🟠 `attendees`가 배열이 아닐 수 있다

`getPropertyValue`(`utils.ts`)는 속성이 없으면 `""`를 반환한다.
`:56`은 그대로 넘긴다:

```ts
attendees: getPropertyValue(page.properties[NOTION_PROPS.ATTENDANCE]),
```

`+page.server.ts:188`이 `act.attendees.includes(memberId)`를 부르면
**문자열 `""`의 `.includes`가 돌아 조용히 `false`**가 된다. 예외도 안 난다 — 전원 결석 처리다.

> 같은 파일 `:157`은 `|| []`로 정확히 이 위험을 막는다.
> **드문 자리에는 방어가 있고, 흔한 자리에는 없다.** 초판은 `:157`의 방어를 칭찬하면서
> 100줄 위의 같은 위험은 못 봤다.

---

## AC-1 🟠 출석 승인 후 캐시 무효화 키가 어긋난다

```
admin/+page.server.ts:186   addAttendeeToActivity(..., memberLink.memberId)
admin/+page.server.ts:191   invalidate: `user_activities_${userEmail}`
activities.ts:92            캐시 키는 `user_activities_${memberId}`
```

`userEmail` ≠ `memberId`. 두 키는 일치하지 않는다. 같은 액션이 `memberId`를 손에 들고 있다.

그리고 대시보드의 **현재 학기** 출석은 `getActivities` → `activities_${startDate}_${endDate}`에서
오는데, **이 키를 무효화하는 코드가 없다.**

> 🔁 `members.md` M-10과 동일 패턴(`member_${email}` 캐시 / `member_${id}` 무효화).
> 세 번째 변종도 있다 — `+page.server.ts:278`이 Promise를 템플릿 리터럴에 넣어
> `member_[object Promise]`라는 키를 만든다.
> **개별 수정이 아니라 키 생성 헬퍼를 캐시 모듈에 두는 것이 처방이다.**

> **초판 정정 ①**: 초판은 "새로고침해도 반영되지 않는다"고 썼다. **틀렸다.**
> 대시보드에 **새로고침 버튼이 있다**(`+page.svelte:132-142`). `?refresh=<ts>`를 붙여
> `+page.server.ts:117`의 `skipCache`를 켜고 캐시를 통째로 우회한다.
> 브라우저 F5에만 해당하는 이야기였다. 초판은 `getActivities(..., skipCache)`를
> **인용해 놓고 그 인자가 무엇인지 확인하지 않았다.**

> **초판 정정 ②**: 초판이 1순위로 제시한 "무효화 키 수정"은 **치료가 아니다.**
> `REDIS_URL`이 `.env`·`.env.example`·`SETUP.md` 어디에도 없다 → `redis === null` →
> `withCache`는 **람다 인스턴스별 `Map`**이다.
> `invalidateCache`는 관리자 POST를 처리한 인스턴스의 Map만 지운다.
> 회원의 대시보드 GET은 다른 요청이고 대개 다른 인스턴스다.
> **키를 고쳐도 확실한 no-op이 확률적 no-op이 될 뿐이다.**
> 실제 지렛대는 TTL 단축, 기존 `?refresh` 경로, 또는 Redis를 실제로 붙이는 것이다.

피해 상한은 5분이고 앱 내 우회 수단이 있으므로 **🟠**가 맞다.

---

## AC-12 🟠 활동 링크가 회원에게 죽은 링크다

`:57`·`:85`·`:118` `url: (page as any).public_url || page.url`

`public_url`은 페이지를 **웹에 게시했을 때만** 채워진다. 아니면 내부 `notion.so` URL로 떨어지고,
그건 **워크스페이스 구성원만 열 수 있다.** 동아리 회원은 Notion 워크스페이스에 없다.

`+page.svelte:417`이 조건 없이 렌더한다:

```svelte
<a href={activity.url} target="_blank" rel="noopener noreferrer" class="activity-link">
```

`url`은 항상 truthy라 **빈 상태 분기가 없다.** 활동 페이지를 게시하지 않았다면
대시보드의 모든 활동명이 로그인 화면이나 404로 간다.

초판은 이걸 중복·타입 문제로만 다루고 **사용자에게 무슨 일이 일어나는지 묻지 않았다.**

---

## AC-3 🟠 조회+매핑 블록 3개가 거의 동일

`getActivities`(`:15-62`, 48줄) · `getAllActivities`(`:64-88`, 25줄) ·
`getUserActivities`(`:90-123`, 34줄) = **107줄 / 163줄**.

차이는 다섯이다 — 초판은 넷이라고 썼는데 `skipCache` 유무(AC-5)를 빼먹었다:

| | 캐시 키 | TTL | 필터 | `attendees` | `skipCache` |
|---|---|---|---|---|---|
| `getActivities` | 날짜 범위 | 5분 | 날짜 and | ✅ | ✅ |
| `getAllActivities` | 전역 | 1분 | 없음 | ❌ | ❌ |
| `getUserActivities` | 회원별 | 5분 | relation contains | ❌ | ✅ |

**제안**: `queryActivities({ filter, includeAttendees })` + `toActivity(page, opts)`로 접는다.
AC-4·AC-11·AC-12가 함께 한 곳이 된다.

---

## AC-2 🟡 CAS 없는 read-modify-write

`:154-163`. 두 관리자가 동시에 승인하면 한쪽이 사라진다.
Notion API에는 `If-Match`/버전 선행조건이 없어 이 파일 안에서 완전히 고칠 수 없다.

> **초판 정정**: 초판은 완화책으로 "출석 승인을 큐로 직렬화 (이미 `NOTION_DB_ATTENDANCE_QUEUE`가 있다)"를
> 제시했다. **그 큐는 직렬화하지 않는다.** `events.ts:96-124`를 보면 제출 인박스일 뿐이고
> (`createAttendanceRecordInNotion`이 pending 행을 쓰고 `getAttendanceQueueFromNotion`이 읽는다),
> 승인은 관리자가 행 단위로 클릭하는 것이라 워커도 순서 보장도 없다.
> **인프라가 있는 게 아니라 새로 만들어야 하는 일이다.**

동시 승인 빈도가 낮아 🟡. 단 AC-10이 훨씬 흔한 유실 경로이므로 그쪽이 먼저다.
구조적 해소는 S3 조건부 쓰기 이관 시
([`notion-db-to-s3.md`](../../../../migration/notion-db-to-s3.md) §2-2).

---

## AC-6 🟡 `createActivityPage`만 raw 페이지를 반환

`:151` `return await notionCreate(dbId, properties);`

`notion/seminars.ts:157`·`notion/events.ts:76`·`:124`는 전부 `page.id`를 반환한다.

호출부는 **셋이고 전부 즉시 `.id`만 꺼낸다** — `lib/server/events.ts:80`,
`admin/+page.server.ts:130`, `admin/events/new/+page.server.ts:54`.
(초판은 호출부를 하나만 적었다. 셋 다 같은 형태라는 점이 지적을 더 강하게 만든다.)

반환 타입이 `any`라 호출부가 무엇을 받는지 타입으로 알 수 없다.

---

## AC-5 · AC-4 · AC-8 🟡 메모

- **AC-5**: `getAllActivities`(`:64`)만 `skipCache`가 없다. 호출부는
  `admin/events/connect/+page.server.ts:14`이고 1분 TTL이라 피해는 작다. AC-3에 흡수된다
- **AC-4**: `activities_${startDate}_${endDate}`는 키 공간이 무제한이지만
  실제 호출부가 학기 경계만 넘겨 2~3개다. 접두사 무효화(AC-1)의 지렛대로서만 의미가 있다.
  단 `invalidateCache`는 **정확한 키만** 지운다 — 와일드카드가 없다
- **AC-8**: TTL `300000`/`60000`/`300000`. 전역 리팩터링 대상(`members.md` M-3)

---

## 지적하지 않은 것

- **빈 JSDoc**(`:2-3`): 이 디렉터리 8개 중 4개가 같다(activities·applications·events·seminars).
  **템플릿 잔재**이지 이 파일의 특성이 아니다
- **파일 전체 `any` 허용**(`:1`): 실제 사용은 `properties: any` 1곳 + `(page as any)` 3곳뿐.
  Notion 응답이 비정형이라 정당하다
- **`ATTENDANCE`가 `getActivities`의 `filter_properties`에만 있는 것**: 다른 둘이
  `attendees`를 반환하지 않으므로 의도에 맞다. 다만 그 의도가 문서화돼 있지 않다(AC-3)
- **`getPropertyValue(...) || []`**(`:157`): 방어 자체는 정확하다.
  문제는 같은 위험이 `:56`에 무방비라는 것이고 그건 AC-11로 올렸다

---

## 우선순위

1. **AC-10** — 순차 실행 + 반환값. 승인이 유실되는 실제 경로
2. **AC-11** — `:56`에 `|| []`. 한 글자짜리 수정
3. **AC-9** — `getRelationIds`가 `has_more`를 검사하고, 참이면 property-item으로 완결시킨다
4. **AC-12** — 링크 정책 결정(활동 페이지 게시 여부) 후 빈 상태 처리
5. **AC-1** — 키 수정 + **왜 그것만으로 부족한지 함께 기록**. 캐시 키 헬퍼 도입
6. **AC-3** — 통합. AC-4·AC-5·AC-11·AC-12가 한 곳이 된다
7. **AC-2 / AC-6 / AC-8** — 이후

---

## 개정 이력

| 변경 | 내용 |
|---|---|
| **AC-9 강등 🔴🔴→🟡** | 실측 결과 **유실 0명**. 9건 전부 페이지 객체가 완전하다. `has_more`를 잘림의 증거로 오독했고, 측정 실패(속성 id 이중 인코딩)를 확인 없이 결론으로 대체했다 |
| **AC-10 신설 🔴** | `Promise.all`이 "승인됐지만 미기록" 상태를 만들고 큐에서 사라지게 함 |
| **AC-11 신설 🟠** | `:56`의 `attendees`가 `""`일 수 있는데 무방비 |
| **AC-12 신설 🟠** | `public_url` 폴백이 비 워크스페이스 회원에게 죽은 링크 |
| AC-1 강등 🔴→🟠 | 새로고침 버튼 존재(인용해 놓고 인자를 안 봤다) + Redis 미설정이라 제시한 수정이 치료가 아님 |
| AC-2 정정 | "큐로 직렬화" 완화책 철회 — 그 큐는 직렬화하지 않는다 |
| AC-3 정정 | 차이 "4개" → **5개**(`skipCache` 누락). 줄 수 실측 107 |
| AC-6 보강 | 호출부 1곳 → **3곳, 전부 `.id`만 사용** |
| 우선순위 재배치 | 캐시 무효화 1순위 → **데이터 유실 1순위** |

### 3차 — 판정 기준 정정 (2026-08-25)

| 변경 | 내용 |
|---|---|
| **AC-9 승격 🟡→🟠** | 2차가 "오늘 유실 0명"을 **등급의 근거**로 썼다. 그건 데이터의 성질이지 코드의 성질이 아니다. 결함은 `has_more` 신호를 받는 자리가 없다는 것이고, 그건 22명이든 40명이든 동일하다 |
| AC-1 근거 정리 | 등급(🟠)은 유지하되 **"Redis 미설정"을 감면 사유에서 제거**. 미설정은 배포 환경의 상태이지 키가 어긋나 있다는 사실을 바꾸지 않는다. 하나의 신원에 이름이 둘인 것이 결함이다 |
