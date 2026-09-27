# `src/lib/server/data/repos.ts` (56줄)

**접두사 `LA34-`** · 표 계층 위의 읽기 헬퍼(BE-30) — 회원 피커 목록, id로 회원·개인정보 찾기, 기간·회원별 활동 목록.

## LA34-1 🟡 데이터 계층 모듈이 서비스 계층의 가시성 규칙을 import한다

2행 `import { withoutHiddenActivities } from "$lib/server/services/visibility"`. 그리고 `services/visibility.ts:1`은
다시 `data/tables`를 import한다 — `data → services → data`. `ARCHITECTURE.md`의 디렉터리 표는 `data/` 위에
`services/`를 둔다.

방향만의 문제가 아니다. 6-8행 주석은 이 모듈을 "Read helpers over the table layer … Plain array scans"라 부르는데,
`getActivitiesBetween`(33-45)과 `getActivitiesOf`(47-56)는 **취소·미공개 세미나 숨김**이라는 업무 규칙을 적용한다(37-40, 52-54).
`visibility.ts:5-18`은 그 규칙이 "회원 면에서" 적용되는 자리라고 스스로를 규정하므로, 이 두 함수는 회원 면 서비스 읽기다.
실제 호출자도 회원 대시보드 하나다(`(public)/+page.server.ts:301-302`).

데이터 계층에 있으면 "표를 그대로 읽는 헬퍼"로 보이고, 관리자 경로가 이 함수를 가져다 쓰면 관리자에게 남아야 할
취소 세미나(`visibility.ts:18`)가 **조용히 사라진다.** 이름이 규칙을 말하지 않는다.

**고침**: 두 함수를 `services/`(예: `visibility.ts` 옆)로 옮기고 이름에 가시성을 드러낸다(`getMemberVisibleActivities…`).
구조만 바뀐다.

## LA34-2 🟡 `getMemberById`는 호출자가 하나이고, 같은 조회가 아홉 곳에 인라인돼 있다

> **검증 정정**: 사실 두 곳을 바로잡는다(등급·결론 불변).
> (1) 인라인 목록에 하나가 빠졌다 — `(member)/settings/notifications/+page.server.ts:18`
> `members.find((m) => m.id === memberId)`. 인라인은 **열 곳**이다.
> (2) "`getPrivateInfoOf`도 같다"는 "호출자 하나"까지 같다는 뜻으로 읽히는데, 그 헬퍼의 호출자는 셋이다
> (`(admin)/admin/+page.server.ts:184`, `admin/members/[id]/+page.server.ts:39`, `(public)/+page.server.ts:304`).
> 같은 것은 "헬퍼가 있는데 인라인 사본도 있다"(`settings/notifications/+page.server.ts:17`)는 절반뿐이다.
> 특히 `admin/members/[id]/+page.server.ts`는 36행에서 회원을 인라인으로 찾고 39행에서 개인정보는 헬퍼로 찾는다 —
> 한 함수 안에서 두 규약이 섞여 있어 지적의 요지를 오히려 강화한다.

20-22행의 호출자는 `(admin)/admin/+page.server.ts:182` 하나다. 같은 식
`(await getTable("members")).find((m) => m.id === …)`이 다음에 직접 쓰였다:

`(admin)/admin/members/[id]/+page.server.ts:36` · `(public)/+page.server.ts:288` · `auth-guards.ts:255` ·
`services/withdrawal.ts:49` · `services/records-admin.ts:262` · `services/executives-admin.ts:151,173` ·
`services/studies.ts:253` · `guards/resolve-member.ts:45`

헬퍼가 "읽기의 한 자리"도 아니고 없어도 되는 것도 아닌 중간 상태다. 조회 방식을 바꿀 일이 생기면(색인 도입 —
12행 주석이 임계값을 언급한다) 한 곳이 아니라 열 곳이다. `getPrivateInfoOf`(24-31)도 같다 —
`settings/notifications/+page.server.ts:17`이 인라인한다.

**고침**: 한쪽으로 정한다 — 헬퍼를 쓰게 하거나, 한 줄짜리 `find`는 인라인이 규약이라면 헬퍼를 지운다. 구조만 바뀐다.

## LA34-3 🟡 피커 항목 모양을 인라인으로 다시 선언한다

11-13행 반환 타입 `{ id: string; name: string; department: string }[]`과 17행 투영은 도메인의
`MemberPickerItem`(`domain/seminars.ts:59-63`)과 같다. 같은 모양이 `admin-queue-views.ts:23,40`에서도 투영되고
도메인에는 `SeminarRequesterSummary`(`domain/admin-seminars.ts:15-19`)도 있다(`LA29-4`).
필드를 하나 더하려면(예: 입학년도로 동명이인 구분) 네 곳이다.

**고침**: 반환 타입을 `MemberPickerItem[]`로, 투영을 공용 `toMemberSummary(m)` 하나로. 구조만 바뀐다.

## 확인했고 지적하지 않은 것

- **`memberPickers`가 `withdrawn`만 거른다(16)** — 이번 학기 미등록 회원도 발표자·조직자 후보에 남는다. 권한 규칙상
  미등록 회원의 참여 가능 여부는 액션 쪽 판정이고, 피커는 후보 목록이다. 이 파일의 결함으로 보지 않는다
- **`getActivitiesBetween`의 반열린 구간(43)** — `d >= start && d < end`. `termRange`와 짝이 맞다
- **`getActivitiesOf`의 null 허용 가변 인자(48, 51)** — 재가입 회원의 legacy id를 그대로 넘기게 한 의도(S9 주석 50행)
- **두 활동 함수가 한 `Promise.all`에서 각자 `hiddenActivityIds()`를 부른다** — `seminars` 표를 두 번 읽지만
  `getTable` 캐시가 흡수한다. 비용은 `LA34-1`로 옮기면 함께 정리된다
- **스캔 방식(선형 `find`/`filter`)** — 6-8행이 "수백 행, 색인 층을 키우지 말 것"으로 결정했다

## 검증 (2026-09-28)

- LA34-1 — 확인(`services/visibility.ts:1`이 `data/tables` import, `:18` "관리자 경로는 이 모듈을 쓰지 않는다", 두 활동 함수의
  호출자는 `(public)/+page.server.ts:301-302`뿐)
- LA34-2 — 정정(인라인 사본 9→10곳, `getPrivateInfoOf` 호출자 수 서술 교정; 등급 불변)
- LA34-3 — 확인(LA29-4와 뿌리가 같으나 각자 자기 파일의 사본을 지적하므로 중복으로 보지 않는다)
- 누락 점검: `memberPickers`의 소비자(회원 면 5곳·관리자 3곳)와 투영 필드, 활동 필터의 반열린 구간, 가변 인자 null 처리를
  확인. 추가 없음.
