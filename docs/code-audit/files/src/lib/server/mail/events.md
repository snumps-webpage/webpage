# `src/lib/server/mail/events.ts` (156줄)

**접두사 `LB12-`** · 자동 메일 이벤트 카탈로그(S10) — 이벤트별 제공 변수·허용 수신자·기본 규칙, 수신자 종류 라벨.

## LB12-1 🟠 `Record<string, …>` 선언이 키 유니언을 지워 `MailEventKey`가 `string`이 된다

33행 `export const MAIL_EVENTS: Record<string, MailEventDef> = { … }` → 156행
`MailEventKey = keyof typeof MAIL_EVENTS`는 `string`이다. 이 파일이 "닫힌 집합"(2행)이라고 선언한 성질이
타입에는 남지 않는다.

결과:

- `emitMailEvent("seminar.publishd", …)`가 컴파일된다. 런타임에는 `effectiveRules`가 `MAIL_EVENTS[event]`의
  `undefined`에서 `defaultRules`를 읽다 던지고(`dispatch.ts:114,132`), 바깥 `catch`가 로그 + `false`로 바꾼다 —
  오타 하나가 "메일 실패"로 위장한다
- `services/mail-admin.ts:333` `return event as MailEventKey`, `:298,300` `as RecipientKind` 같은 캐스트가
  아무것도 보증하지 않는다
- 좁은 타입의 값어치는 **아직 없는** 오타 호출부를 막는 데 있다(README 판정 기준). 지금 모든 발생 지점이
  올바른 이름을 쓴다는 것은 감면 근거가 아니다

처방: `as const satisfies Record<string, MailEventDef>`. 키 유니언이 살아나 발생 지점 오타가 컴파일 오류가 된다.
**구조만**(동작 변화 없음).

## LB12-2 🟡 카탈로그의 내부 정합성이 타입으로도 테스트로도 고정돼 있지 않다

> **검증 정정**: 인용 위치만. `template-store.test.ts`는 108줄이다 — 본보기로 든 테스트는 `:98-106`
> ("every default template's declared variables appear in its text")이다(초판 `:626-635`). 세 불변식의 결과는
> 모두 재확인했다(첫째: `renderMailTemplate` 303행 `null` → `dispatch.ts:150` `continue` → `true`).

`MailEventDef`(22-31행)의 세 필드는 서로를 참조하지만 연결이 없다.

| 불변식                                                  | 깨지면                                                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `defaultRules[].templateKey` ∈ `MAIL_TEMPLATE_DEFAULTS` | `renderMailTemplate`가 `null` → `dispatch.ts:150` `continue` → **발송 없이 `true`** |
| `defaultRules[].recipient` ∈ `allowedRecipients`        | 기본 규칙이 관리자 화면에서 고를 수 없는 수신자로 발송된다                          |
| `variables` ⊇ 기본 템플릿이 쓰는 이벤트 변수            | 빈 문자열로 치환돼 발송(`template-store.ts:273`) — 오류 없음                        |

`templateKey: string`(30행)이라 첫째는 컴파일러도 모른다. `grep`상 `MAIL_EVENTS`/`defaultRules`를 검사하는
테스트가 없다. 템플릿 키 오타는 **그 메일이 영원히 안 나가는데 성공으로 기록되는** 결함이 된다.

처방: 세 불변식을 도는 테스트 하나(`template-store.test.ts:626-635`와 같은 형태). **구조만.**

## LB12-3 🟡 이벤트 변수 목록이 세 곳에 쓰인다

`seminar.published`의 변수 6개(111-118행)가 `template-store.ts:158-165`(`seminar-announcement.variables`)와
같고, 발생 지점 `announcements.ts:81-87`의 객체 리터럴이 셋째 사본이다. 다른 이벤트도 같다
(127행 ↔ `template-store.ts:186` ↔ `announcements.ts:95-100`, 139행 ↔ `:205`, 148행 ↔ `:223`).

`emitMailEvent`의 `vars`가 `Record<string, string>`(`dispatch.ts:140`)이라 세 목록 사이에 컴파일 연결이 없다.
변수 하나를 추가하려면 세 곳을 고쳐야 하고, 하나를 빠뜨려도 결과는 빈 칸이 박힌 메일이다(`LB12-2` 표 셋째 줄).

처방: `LB12-1` 이후 `vars`를 `Record<(typeof MAIL_EVENTS)[E]["variables"][number], string>`로 좁힌다. **구조만.**

## LB12-4 🟡 머리 주석의 확장 절차가 틀렸다

9-10행:

- "새 수신자 종류 추가 = RECIPIENTS에 해석기 등록" — `RECIPIENTS`(13-18행)는 **라벨**만 담는다. 해석기는
  `dispatch.ts:89-106`의 `switch`에 있다
- "새 이벤트 추가 = 여기 선언 + 발생 지점에 emitMailEvent() 한 줄" — 기본 규칙이 가리킬 **코드 기본 템플릿**을
  `template-store.ts`에 추가해야 하고, 빠뜨리면 조용히 안 나간다(`LB12-2`). 관례상 `templates.ts`/`announcements.ts`의
  어댑터 함수도 하나 는다

주석을 따른 사람이 반쪽짜리 변경을 하게 된다.

## LB12-5 🟡 `admins` 라벨 "관리자 전원"이 실제 해석과 다르다

> **검증 정정**: 인용만. `AUTH_VARS.md:15`의 "관리자 권한과 무관"은 HEAD 문구이고, 이 브랜치의 작업 트리(`:21`)는
> "운영 알림 수신 주소(회장단이 없을 때의 폴백 포함), 그리고 회원 행이 생기기 전의 관리자 부트스트랩"으로 바뀌었다.
> 주장은 그대로 선다 — `ARCHITECTURE.md:80-81`(결정 D4)이 관리자 권한의 유일한 원천을 `members.isAdmin`으로,
> `ADMINS_EMAILS`를 부트스트랩·운영 알림 전용으로 적는다.

15행 `admins: "관리자 전원 (ADMINS_EMAILS)"`. 해석은 env 명단이다(`dispatch.ts:31-36`). 그런데 관리자 권한의
원천은 `members.isAdmin`이고(결정 D4, `ARCHITECTURE.md:80`), `AUTH_VARS.md:15`는 이 env를 "운영 알림 수신 주소.
**관리자 권한과 무관**"이라 정의한다. 관리자 화면에서 부여한 관리자는 이 "관리자 전원"에 들지 않는다.

이 라벨은 관리자 메일 화면에 그대로 뜬다(`services/mail-admin.ts:300,308,318`, 테스트 발송 본문 `:698,703`).
규칙을 고르는 관리자는 "관리자 전원"을 문자 그대로 읽는다. 16행 "(없으면 관리자)"도 같다.

처방: 라벨을 "운영 알림 수신자 (ADMINS_EMAILS)"로. 수신자를 `isAdmin` 회원으로 바꿀지는 결정 사항. 라벨만은 **문구 변경.**

## ~~LB12-6 🟡 `application.rejected` 설명의 "인적사항 삭제 직전"이 거짓이다~~

> **검증 정정**: 철회 — **`LB14-2`의 중복.** `LB14-2`가 같은 거짓 문구의 세 사이트(`templates.ts:59-62`,
> 이 파일 50행, `template-store.ts:57`)를 하나의 지적으로 이미 센다. 사실 자체(삭제 후 발송,
> `routes/(admin)/admin/+page.server.ts:233-234`, `services/membership.ts:127-131`)는 확인했다. 사이트 기록으로만 남긴다.

50행. 실제 순서는 삭제 후 발송이다 — 경위는 `LB14-2`. 이 설명도 관리자 메일 화면에 표시된다(`mail-admin.ts:314`).

## 확인했고 지적하지 않은 것

- **이벤트 목록이 코드에 고정된 닫힌 집합** — 2-10행과 `schemas/mail-rule.ts:7-10`이 설계 결정으로 밝힌다.
  이벤트는 발생 지점 코드가 있어야 의미가 있으므로 옳다
- **`allowedRecipients` 배정** — 신청 접수류는 `party`를 허용하지 않고(신청자에게 "접수됨"을 보내는 규칙이 없다),
  승인·반려류와 공지류만 허용한다. 공지류에 `party`가 없는 것은 공지에 당사자 개념이 없어서다. 일관된다
- **`seminar.cancelled`에 사유 변수가 없다(139행)** — `announcements.ts:103-106`이 결정으로 밝히고
  `announcements.test.ts:256-269`가 고정한다
- **`withdrawal.requested`의 수신자에 `party`·`members-opted-in`이 없다** — 탈퇴 사실이 본인 외 회원에게 퍼지지
  않게 하는 올바른 제한이다

## 검증 (2026-09-28)

- LB12-1 — 확인 (오타 이벤트는 114행 `undefined` → 132행이 try **밖**에서 `defaultRules`를 읽다 던지고 바깥 catch가 `false`로 바꿈. 소비자가 있는 타입이라 소비자 없는 `LB13-6` 🟡보다 높은 등급이 정합)
- LB12-2 — 정정 (인용 위치)
- LB12-3 — 확인
- LB12-4 — 확인
- LB12-5 — 정정 (인용 — 작업 트리의 문서 변경 반영)
- LB12-6 — 철회 (`LB14-2` 중복)
- 누락 점검: 14개 이벤트의 `defaultRules`·`allowedRecipients`·`variables`와 `template-store.ts`의 기본 템플릿 키·변수 목록을 일일이 대조했다 — 현재 불일치 없음. 새 지적 없음
