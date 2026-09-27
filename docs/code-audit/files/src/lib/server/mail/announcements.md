# `src/lib/server/mail/announcements.ts` (128줄)

**접두사 `LB09-`** · 전체 공지(세미나 공개·일정 변경·취소)와 회장단 탈퇴 통지의 발송 어댑터 + 공지용 KST 일정 표기.

## LB09-1 🟡 `chunk` 사본 — 테스트가 운영이 쓰지 않는 쪽을 고정한다

17-22행 `chunk`는 `dispatch.ts:24-29`와 바이트 단위로 같다. 이 파일 안에서 쓰이지 않고, 저장소에서 부르는 곳은
`announcements.test.ts:155-157` 하나다. 실제 배치 분할은 `dispatch.ts`의 private 사본이 한다.

그래서 "chunk splits exactly" 테스트는 **운영 경로와 무관한 코드**를 검증한다. `dispatch.ts`의 `chunk`가 망가져도
그 테스트는 통과한다(실제 경로는 `announcements.test.ts:146-153`의 80+80+10 테스트가 따로 잡는다).
16행 주석 "dispatch의 배치 크기와 동일 규칙"도 의미가 없다 — 크기는 인자다.

처방: 이 사본과 그 테스트를 지운다. **구조만.**

## LB09-2 🟡 링크 조립이 세 번 반복되고, 경로 문자열이 라우트 트리의 사본이다

`siteUrl`·`optOutUrl` 한 쌍이 85-86, 98-99, 112-113행에 똑같이 조립된다. `"/settings/notifications"`(86, 99, 113행)와
`"/admin/members"`(126행)는 라우트 디렉터리 이름의 문자열 사본이다 — 라우트를 옮기면 컴파일도 테스트도
실패하지 않고 **메일 속 링크만 404가 된다**(`announcements.test.ts:112-124`는 `/settings/notifications`를 문자열로
확인할 뿐 라우트 존재를 확인하지 않는다).

처방: `const links = () => ({ siteUrl, optOutUrl })` 하나. 경로는 공용 상수로. **구조만.**

## LB09-3 🟡 `AnnouncedSchedule`이 `SeminarSchedule` 스키마의 느슨한 사본이다

24-30행의 인터페이스는 `schemas/seminar.ts:37-62`의 일정 필드(`startsAt`·`startTime`·`endsAt`·`location`)를 다시 쓴다.
호출부 `services/seminars.ts:146-150,191-194`는 스키마 값을 그대로 넘긴다.

다른 점은 27행 `startTime?:` — 스키마에는 없는 **셋째 상태 `undefined`** 가 생겼고, 40-41행은 그것을 "시각 모름"으로
처리한다. 그런데 26행 주석은 "`null`이면 시각을 모른다"고만 적는다. 일정 필드가 늘면(예: 종료 시각 미정)
두 정의를 함께 고쳐야 하고, 이 사본만 고치지 않으면 새 필드는 메일에 조용히 빠진다.

처방: `Pick<SeminarSchedule, "startsAt" | "startTime" | "endsAt" | "location">`. **구조만**(호출부가 이미 스키마 값을 넘긴다).

## LB09-4 🟡 종료가 다른 날이면 종료 날짜가 사라진다

54-58행은 종료를 **시:분만** 찍는다. 스키마는 `endsAt > startsAt`만 요구하고 같은 날일 것을 요구하지 않는다
(`schemas/seminar.ts:55-58`). 이틀짜리 행사는 "10월 15일 (수) 오후 07:00 – 오후 05:00"으로 나가 종료가 시작보다
이른 것처럼 읽힌다. 이 함수의 목적(33-35행 "캘린더를 열지 않고도 읽을 수 있어야")에 정면으로 어긋나는 경우다.

처방: KST 날짜가 다르면 종료에도 날짜를 붙인다. **동작 변경**(다일 행사의 메일 문구만).

## 확인했고 지적하지 않은 것

- **시각 미정이면 날짜만(37-52행)** — `announcements.test.ts:187-235`가 고정한다. 시각을 아는 경우 `startsAt`의
  instant를 찍는 것도 옳다 — `schemas/seminar.ts:59-62`가 `startTime === kstClock(startsAt)`을 강제하므로 두 원천이 어긋날 수 없다
- **`SITE_ORIGIN` 폴백(12-14행)** — 운영 주소로의 폴백은 `announcements.test.ts:117-125`가 의도로 고정한다.
  `PUBLIC_` 접두사를 쓰지 않는 이유도 10-11행이 정확히 적었다
- **취소 공지에 사유 변수가 없다(103-115행)** — 결정으로 밝혀져 있고 테스트가 고정한다
- **일정 없는 행의 "추후 공지"(62-70행)** — 이주로 일정을 잃은 레거시 행에 대한 의도된 처리다
- **회장단 탈퇴 통지가 "공지" 파일에 있는 것** — 어댑터 파일 분할 전체의 문제로 `LB14-3`에 적었다
- **boolean 반환** — 이 파일은 계약을 지킨다. 반환값을 호출부가 오해하는 문제는 `LB11-1`

## 검증 (2026-09-28)

- LB09-1 — 확인 (`export` 한 단어 외 동일. 실제 배치 경로는 `announcements.test.ts:146-154`가 잡는다)
- LB09-2 — 확인
- LB09-3 — 확인 (스키마 출력형은 `.default(null)`로 `string | null`이라 `undefined`는 이 사본에만 있는 상태다)
- LB09-4 — 확인 (`schemas/seminar.ts:55-58`은 `endsAt > startsAt`만 요구)
- 누락 점검: 일시 표기의 세 분기(시각 미정·종료 없음·종료 있음), 일정 없는 행의 변수, 네 어댑터의 이벤트·변수를 `events.ts`와 대조했고, 호출부가 boolean을 쓰는 방식(`seminars.ts:146-151,191-194,237`, `settings/withdraw/+page.server.ts:39-40`)을 확인했다. 74행 JSDoc "returns false on ANY batch failure"가 정확히 `LB11-1`이 문제 삼는 계약이다. 새 지적 없음
