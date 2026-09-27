# `src/lib/server/services/mail-admin.ts` (713줄)

**접두사 `LB23-`** · `/admin/mail` 서비스 (S10) — 템플릿·공용 변수의 오버라이드 계층(코드 기본값 + 테이블 행, 1단계 되돌리기), 이벤트별 발송 규칙(미실체화 = 코드 기본 규칙), 테스트 발송.

## LB23-1 🔴 이벤트의 마지막 규칙을 제거하면 기본 규칙이 되살아난다 — "제거"가 성공을 알리고 아무것도 바꾸지 않는다

이 모듈의 규칙 모델은 "이벤트의 행이 하나라도 있으면 테이블이 전체 진실, **없으면 기본 규칙**"이다(24-26행 주석,
`mail/dispatch.ts:109-133` `effectiveRules`, 이 파일 290-310행). **"행이 없다"와 "관리자가 전부 지웠다"를 구별할 수단이 없다.**

`removeMailRule`(452-474)을 기본 규칙 하나뿐인 이벤트에 부르면:

1. 459행 스냅숏 — 행이 없으니 기본 규칙을 기록
2. 460행 실체화 — 기본 규칙 1행 생성
3. 471행 `splice` — 그 행 삭제 → 이벤트의 행 0개
4. 다음 발송: `effectiveRules`가 행 0개를 보고 **기본 규칙으로 발송**한다

모든 이벤트의 기본 규칙이 정확히 하나이므로(`events.ts:33-154`) **기본 상태의 규칙 제거는 전부 이 경로다.**
관리자는 "규칙을 제거했습니다" 토스트를 보고, 새로고침된 화면에는 같은 규칙이 "기본값" 배지로 다시 있으며,
메일은 계속 나간다 — `seminar.published`라면 수신 동의 회원 전원에게. 기본 규칙 외에 추가한 규칙을 모두 지워도 같다.

화면은 반대를 약속한다: `admin/mail/+page.svelte`의 빈 목록 분기 "발송 규칙 없음 — 이 이벤트에서는 메일이 나가지 않습니다."는
`listMailEvents`가 행 0개일 때 기본 규칙을 채워 넣으므로(303-310) **도달할 수 없는 문구**다.

`setMailRuleEnabled(false)`로 끄는 우회로는 있다. 그러나 "제거"는 성공을 보고하면서 효과가 없다 — 우회로의 존재는 결함을 없애지 않는다.

처방: "실체화됨"을 행의 개수가 아니라 명시적 사실로 저장한다(예: 이벤트별 표식 행, 또는 `mail-rule-history`처럼 이벤트당 1행의
규칙 세트 문서). 그 판정이 네 곳에 있으므로(LB23-8) 네 곳을 함께 고쳐야 한다. **동작 변경.**

## LB23-2 🟠 규칙 편집이 검증보다 먼저 되돌리기 이력을 덮어쓰고, 세 번의 독립 쓰기로 이뤄진다

`addMailRule`·`removeMailRule`·`setMailRuleEnabled`는 모두 ① `snapshotEventRules`(`mail-rule-history` 쓰기, 337-355)
② `materializeEvent`(`mail-rules` 쓰기, 386-401) ③ 실제 변경(`mail-rules` 쓰기)을 **순서대로 따로** 한다
(424-448, 459-473, 485-503). 실패하는 검사는 ③ 안에 있다:

- 중복 규칙 추가 → 427-438행 `CONFLICT`. 그 전에 ①이 이력을 **현재와 같은 세트**로 덮었다 —
  `canRevert`는 참이지만 되돌리기는 아무것도 바꾸지 않고, **진짜 직전 세트는 사라졌다.**
  미실체화 이벤트였다면 ②가 이미 행을 만들어 이벤트가 "수정됨"이 된다. 실패한 조작이 두 가지 흔적을 남긴다
- 없는 규칙 제거·토글 → 470·496행 `NOT_FOUND`. 같다
- 같은 값으로 토글(더블 클릭, 두 탭) → 성공하지만 ①이 이력을 현재와 같은 세트로 덮는다

그리고 ①은 `getTable("mail-rules")`(338행)로 **캐시된** 규칙을 읽는다 — 다른 인스턴스에서는 최대 15초 전 세트다(`cache.ts:51`).
그 세트는 "직전 상태"였던 적이 없을 수 있다. `revertMailEvent`(358-383)도 같다: 360행이 캐시된 이력을 읽고, 368행이 이력을 먼저
덮은 뒤 369행 쓰기가 `WRITE_CONFLICT`로 실패하면 **이력만 바뀌고 규칙은 그대로**다.

`mail-rule-history`와 `mail-rules`를 함께 바꾸는 다문서 흐름인데 `ATOMIC-FLOWS.md` §7의 흐름 목록에도, "옮기지 않은 것"에도,
"알려진 한계"에도 없다.

처방(흐름 함수까지 갈 필요는 없다): 규칙 변경을 **한 번의 `mutate("mail-rules")`** 로 합쳐 그 안에서 최신 행으로 실체화·검증·변경하고,
변경 전 세트를 반환받아 **성공한 뒤에만** 이력을 쓴다. 변경이 없으면 이력을 건드리지 않는다. **동작 변경**(실패·무변경 시 이력이 보존된다).

## LB23-3 🟠 `ruleId` 경로가 규칙의 이벤트를 확인하지 않는다

463행·489행 `rows.findIndex((r) => r.id === input.ruleId)` — `event` 조건이 없다. `event=A`, `ruleId=`(B의 규칙)으로 부르면:

- B의 규칙이 제거·토글된다
- 스냅숏과 실체화는 A에 대해 일어난다(459-460, 485-486) — **B의 되돌리기 이력은 기록되지 않고**, A는 까닭 없이 실체화된다

입력의 두 필드가 같은 규칙을 가리키는지 아무도 확인하지 않는다. 처방: `r.id === ruleId && r.event === event`. **동작 변경**(불일치 입력이 `NOT_FOUND`).

## LB23-4 🟠 키 소속 판정이 `in` 연산자라 `Object.prototype`의 이름을 기본 키로 받아들인다

`MAIL_EVENTS`·`MAIL_TEMPLATE_DEFAULTS`·`MAIL_VARIABLE_DEFAULTS`는 일반 객체 리터럴이고, 이 파일은 소속을 `key in X`로 판정한다
(70, 105, 197, 328, 417, 537, 616행). `"constructor" in X`·`"toString" in X`는 참이다. 실측(`node`): `"constructor" in {welcome:…}` → `true`.

| 입력                                                                | 결과                                                                                                                                                                                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addRule` `templateKey=constructor`                                 | 417행 통과 → **규칙 행이 저장된다.** 화면에는 템플릿 이름 `Object`(286행 `MAIL_TEMPLATE_DEFAULTS[key]?.name` = `Function.name`), 발송은 조용히 스킵(`template-store.ts:303`)                                                  |
| `addRule`·`removeRule`·`toggleRule`·`testEvent` `event=constructor` | `requireEvent`(327-334) 통과 → 411행 `def.allowedRecipients.includes` / 347행 `.defaultRules.map` / 690행 `.variables`(→ 631행 `undefined.map`) 에서 `TypeError` → **500**, 원문 메시지가 응답에 실린다(`auth-guards.ts:165`) |
| `save`·`toggle` `key=constructor`                                   | 105·222행 통과 → `subject: undefined` 행 → 쓰기 게이트에서 문구 없는 `VALIDATION_FAILED`. 의도한 "존재하지 않는 템플릿입니다"(106-108)가 아니다                                                                               |
| `saveVariable` `key=valueOf`(557행 정규식 통과)                     | 566행 `def`가 함수 → `previous: {value: undefined}` → 게이트에서 문구 없는 `VALIDATION_FAILED`. 그 이름의 변수를 만들 수 없고 이유도 안 나온다                                                                                |
| `deleteTemplate` `key=toString`                                     | "기본 템플릿은 삭제할 수 없습니다" — 틀린 설명                                                                                                                                                                                |

타입도 막지 못한다: `MAIL_EVENTS: Record<string, MailEventDef>`(`events.ts:33`)이라 `MailEventKey`(`events.ts:156`)는 `string`이다.
`requireEvent`의 반환 타입 `MailEventKey`와 333행 캐스트는 **아무것도 좁히지 않는다.** `template-store.ts:286-287`이
`as MailTemplateDefault | undefined`로 캐스트하는 이유도 같은 `Record<string, …>`다.

처방: `Object.hasOwn`(또는 `Map`)으로 판정, `events.ts`는 `as const satisfies Record<string, MailEventDef>`로 키를 유니온으로. 동작은 **거부 코드가 바뀌는 쪽만** 변경.

## LB23-5 🟠 템플릿 테스트 발송이 공용 변수를 예시 문자열로 덮는다 — 630행 주석과 반대

630행 주석: "공용 변수는 render가 실제 값을 채우므로, 여기선 나머지 토큰만 예시로 채운다."
코드: 660행 `sampleVars(extractVariableTokens(...))`는 제목·본문의 **모든** 토큰을 채운다 — `{{noticeChatLink}}`도.
`renderMailTemplate`은 `{ ...공용 변수, ...vars }`로 합치므로(`template-store.ts:305`) **예시 값이 이긴다.**

결과: `welcome` 테스트 메일에 카톡 링크 대신 `[예시 noticeChatLink]`가 찍힌다. 공용 변수를 고친 관리자가 확인하려고 보내는
바로 그 메일에서 확인할 값이 가려진다. `sendTestEvent`(690행)는 이벤트 변수만 채우므로 공용 변수가 실제 값으로 나온다 — 두 테스트가 다르게 동작한다.

처방: `getGlobalMailVariables()`의 키를 빼고 채운다. **동작 변경.**

## LB23-6 🟠 테스트 받는 주소 검사가 주소 하나를 보장하지 않는다 — 헤더 주입

> **정리 교차 참조**: 같은 주입의 아래층이 `mail/client.md` LB10-1(🟠, 헤더를 이스케이프 없이 조립)이다.
> 입력 검사(여기)와 조립(LB10-1)을 둘 다 고쳐야 닫힌다 — 한 건으로 센다.

648·684행 `/.+@.+\..+/`는 앵커가 없다. 라우트는 양끝만 다듬는다(`admin/mail/+page.server.ts:39-40`).

- `"me@x.com\r\nBcc: a@…, b@…"` → 첫 줄이 정규식에 맞는다(실측 `true`). `dispatchEmail`은 `To: ${recipients.join(", ")}`를
  원문 헤더로 이어 붙인다(`mail/client.ts:64-73`) → **Bcc 헤더가 주입되어 동아리 계정으로 임의 다수에게 발송**된다. 다른 헤더도 같다
- `"a@x.com, b@y.com"` → 여러 수신자

화면의 `type="email"`(`+page.svelte:550, 576`)은 브라우저 편의일 뿐 서버 계약이 아니다. 행위자가 관리자라는 사실은 우선순위를 정할 뿐,
"받는 주소를 확인해 주세요"라는 검사가 검사하지 못한다는 사실을 바꾸지 않는다.

같은 정규식이 두 번 복제돼 있고(648, 684), 도메인에는 이미 `z.email()` 기반 검사가 있다(`domain/members.ts:97-101`, 비공개 상수).
처방: 공용 이메일 스키마를 export해 두 곳에서 쓴다. **동작 변경.**

## LB23-7 🟠 템플릿 삭제의 참조 검사가 이력을 보지 않고, 캐시된 읽기로 CAS 밖에서 한다

`deleteMailTemplate` 202-204행은 `getTable("mail-rules")`로 참조를 확인한 뒤 211행에서 별도 문서를 쓴다.

- **이력 누락**: `mail-rule-history`의 세트가 그 템플릿을 가리켜도 삭제된다. 이후 `revertMailEvent`가 그 규칙을 되살리고(371-380, 존재 확인 없음 — LB23-11),
  발송은 조용히 스킵되며(`dispatch.ts:150`) 화면엔 원시 키 `custom-01…`이 이름으로 나온다(287-288)
- **낡은 읽기**: 다른 인스턴스에서 15초 안에 추가된 규칙은 보이지 않는다. 동시에 도는 `addMailRule`(416-418 존재 확인 → 426 쓰기)과도 틈이 있다.
  어느 쪽이든 결과는 **존재하지 않는 템플릿을 가리키는 규칙**이다

처방: 이력까지 참조 검사에 넣고, 되살리는 쪽(`revertMailEvent`)이 존재를 재확인한다. 두 문서 사이의 틈은 흐름 함수가 아니면 못 닫지만,
되살리는 쪽의 재확인으로 결과(끊긴 참조)를 막을 수 있다. **동작 변경.**

## LB23-8 🟡 "행이 있으면 전체 진실, 없으면 기본 규칙"이 네 곳에 따로 구현돼 있다

- `listMailEvents` 290-310
- `snapshotEventRules` 345-347
- `materializeEvent` 386-401
- `mail/dispatch.ts:109-133` `effectiveRules`

`sendTestEvent`는 `effectiveRules`를 재사용하지만(691행) 목록·스냅숏·실체화는 각자 다시 쓴다. LB23-1을 고치려면 네 곳을 모두 바꿔야 한다 —
그리고 하나라도 빠지면 화면과 발송이 다른 규칙 세트를 말한다. 처방: `effectiveRules`가 id를 포함한 행과 `materialized`를 함께 돌려주고
나머지가 그것을 쓴다. `effectiveRules`의 오류 삼킴(발송 경로용)은 관리 화면에 옮기지 말 것. **구조.**

## LB23-9 🟡 변화 없는 저장이 되돌리기 칸을 소모한다

`saveMailTemplate`(122-135)·`saveMailVariable`(578-586)·`setMailTemplateEnabled`(240-251)는 값이 같아도 `previous`를 현재 값으로 덮는다.
`mutate`의 무변경 감지(`tables.ts:124`)는 `updatedAt`·`previous`가 바뀌므로 걸리지 않는다. 결과: "저장"을 한 번 더 누르면
`canRevert`는 참인데 되돌리기가 아무것도 바꾸지 않고, **실제 직전 문구는 사라진다.** 이력이 1단계뿐인 설계에서 그 한 칸을 무변경이 먹는다.
처방: 내용이 같으면 쓰지 않는다. **동작 변경.**

## LB23-10 🟡 기본 템플릿을 코드 원문으로 되돌리는 경로가 없다 — 스키마 주석이 약속하는 경로를 이 파일이 막는다

`schemas/mail-template.ts:9`: "행 삭제 = 기본 문구로 복원". 그러나 행을 지우는 유일한 함수 `deleteMailTemplate`은 기본 키를 거부한다(197-201).
첫 수정만 `previous`에 원문을 담으므로(119행) **두 번 고치면 원문은 UI에서 복구할 수 없다** — 수정된 기본 템플릿은 원문을 보여주지도 않는다(59-60행).
변수도 같다(573-575, 616-620). 처방: 기본 키의 "기본값으로 초기화"(오버라이드 행 삭제). **동작 추가.**

## LB23-11 🟡 닫힌 집합과 존재 검사가 `addMailRule`에서만 돈다 — 되돌리기는 우회한다

`addMailRule`은 수신자가 이벤트의 `allowedRecipients`에 있는지(411-415), 템플릿이 실존하는지(416-423) 확인한다.
`revertMailEvent`(371-380)는 이력의 `recipient`·`templateKey`를 **검사 없이** 되살린다. 저장 스키마는 둘 다 자유 문자열이다
(`schemas/mail-rule.ts:19`, `mail-rule-history.ts:13-14`). 그래서 298·300행이 `as RecipientKind` 캐스트와 `?? r.recipient` 폴백을 달고 있다.

결과: `events.ts`에서 어떤 이벤트의 `allowedRecipients`를 줄여도 이력 되돌리기가 금지된 수신자 규칙을 되살린다. LB23-7의 끊긴 템플릿 참조도 이 경로로 들어온다.
처방: 규칙 행을 만드는 모든 경로(추가·되돌리기·실체화)가 한 검증 함수를 거친다. **동작 변경**(되돌리기가 무효 행을 거른다).

## LB23-12 🟡 같은 모양이 쌍으로 복제돼 있다

| 모양                                  | 위치                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 기본값 + 오버라이드 목록 병합         | `listMailTemplates` 48-86 · `listMailVariables` 521-548                                                                    |
| 오버라이드 upsert + `previous` 스냅숏 | `saveMailTemplate` 102-138 · `setMailTemplateEnabled` 223-254(첫 수정 분기 111-121 ≒ 230-239) · `saveMailVariable` 563-589 |
| 현재 ↔ `previous` 스왑                | `revertMailTemplate` 142-162 · `revertMailVariable` 593-612                                                                |
| 규칙 찾기(`ruleId` 또는 키 조합)      | `removeMailRule` 462-469 · `setMailRuleEnabled` 488-495 (LB23-3의 결함도 두 벌)                                            |
| 스냅숏 → 실체화 전주                  | 424-425 · 459-460 · 485-486                                                                                                |
| 현행 템플릿 문구 조회                 | `currentTemplateText` 634-641 · `template-store.ts:286-296` (`enabled` 처리만 다르다)                                      |
| 변수 이름 규칙                        | 557행 정규식 · `schemas/mail-variable.ts:13` 같은 정규식                                                                   |
| 받는 주소 검사                        | 648 · 684 (LB23-6)                                                                                                         |

"기본 템플릿의 첫 오버라이드는 `previous`에 원문, `enabled: true`"라는 규칙이 119·237행에 두 번 있고, "기본 규칙은 `enabled: true`"가
303-310·347·395행과 `dispatch.ts:132`에 있다. LB23-9·LB23-10을 고치면 이 쌍들을 모두 손대야 한다. **구조.**

그리고 `sendTestEvent`는 켜진 규칙이 하나라도 있는지 알기 전에 토큰부터 받는다(693행) — 자격 증명이 없는 환경에서는
"켜져 있는 발송 규칙이 없습니다"(707-711) 대신 500이 난다. 검사 순서만의 문제다.

## LB23-13 🟡 (검증 추가) 공용 변수 삭제가 참조를 확인하지 않는다 — 템플릿 삭제와 비대칭

`deleteMailTemplate`은 규칙이 참조하면 거부한다(202-210). `deleteMailVariable`(615-625)은 **어떤 템플릿이 `{{key}}`를 쓰는지 보지 않는다.**
삭제된 변수는 `interpolate`에서 빈 문자열이 된다(`template-store.ts:273` `vars[k] ?? ""`) — 그 변수를 쓰는 **실제 발송 메일**에서
링크·문구가 조용히 빈칸으로 나간다. 행이 사라지므로 `revertMailVariable`로도 되돌릴 수 없다.

같은 모듈이 "참조되는 것은 지우지 않는다"를 템플릿에는 적용하고 변수에는 적용하지 않는다. 처방: 현행 템플릿 문구
(기본값 + 오버라이드 + 커스텀)에서 `extractVariableTokens`로 참조를 모아 거부하거나 사용처를 알린다. **동작 변경.**

## 확인했고 지적하지 않은 것

- **메일 관리 조작에 감사 로그가 없다** — `API-SPEC.md` §1-5의 대상 목록은 개인정보 열람과 지위·권한·탈퇴 수명주기다. 메일 설정은 대상이 아니다. 스펙 결정이다
- **테스트 발송이 실패 시 재시도하지 않고, 여러 규칙 중 중간에 실패하면 앞의 것은 이미 나갔다** — 테스트 발송이고 결과가 오류로 보고된다. `emitMailEvent`의 "재시도 없음" 원칙(`dispatch.ts:171`)과도 일치
- **`sendTestEvent`가 커스텀 템플릿의 이벤트 밖 토큰을 빈 문자열로 렌더한다** — 실제 발송(`emitMailEvent`)이 이벤트 변수만 넘기므로 **실제와 같다.** 테스트로서 맞는 동작이다(LB23-5와 대조)
- **커스텀 템플릿의 `variables: []`**(75행) — 커스텀 템플릿은 어느 이벤트에 붙느냐에 따라 변수가 달라지므로 고정 목록이 없는 것이 맞다. 규칙 화면이 이벤트 변수를 보여준다
- **`createMailTemplate`의 키 형식 `custom-…`**(178행) — 커스텀 여부는 접두사가 아니라 `MAIL_TEMPLATE_DEFAULTS` 소속으로 판정한다(70행). 접두사는 표시·디버깅용일 뿐이라 이중 원천이 아니다(LB23-4의 `in` 문제는 별개)
- **템플릿 편집이 단일 문서 `mutate` 안에서 존재·스냅숏을 처리한다**(102-138, 142-161) — 템플릿·변수 쪽은 원자적이다. LB23-2는 규칙 쪽(두 문서)만의 문제다
- **변수 이름 규칙이 `interpolate`의 `\w+`(`template-store.ts:273`)보다 좁다** — 만들 수 있는 이름은 모두 치환된다. 좁은 쪽이 저장 스키마와 같으므로 결함이 아니다
- **`effectiveRules`의 오류 삼킴** — 발송 경로가 본 동작을 막지 않게 하는 설계(`dispatch.ts:9-14` 주석, §5-7). 이 파일의 `sendTestEvent`가 그것을 물려받는 것은 테스트 목적상 무해

## 커버리지

이 파일에 대한 테스트가 없다(`mail-admin` 참조 테스트 0건). `template-store.test.ts`·`dispatch.test.ts`는 발송 경로만 다룬다.
LB23-1(마지막 규칙 제거)과 LB23-5(공용 변수 가림)는 한 줄짜리 단위 테스트로 재현된다.

## 검증 (2026-09-28)

임시 vitest(저장소 밖 scratch, 메모리 저장소 + `client` 모의)로 LB23-1·4·5·6을 실행해 확인했다. 저장소에는 남기지 않았다.

- LB23-1 — 확인(실행). `removeMailRule(ruleId=null)` 뒤 `application.approved` 행 0개 → `effectiveRules`가 기본 규칙 반환 → `emitMailEvent`가 1통 발송, `listMailEvents`는 `materialized:false`로 같은 규칙을 다시 보인다. **보강**: 본문이 우회로로 든 "끄기"가 오히려 함정이다 — 기본 규칙을 `setMailRuleEnabled(false)`로 끈 뒤(발송 0통) 그 꺼진 규칙을 "제거"하면 행 0개가 되어 **꺼 두었던 메일이 켜진 기본 규칙으로 다시 나간다**(실행 확인). 🔴 유지
- LB23-2 — 확인. 스냅숏(337-355)·실체화(386-401)·변경이 세 번의 독립 쓰기이고 검사는 셋째 안에만 있다. `revertMailEvent` 368→369 순서도 일치
- LB23-3 — 확인. 463·489행에 `event` 조건 없음
- LB23-4 — 확인(실행). `addMailRule(templateKey="constructor")` → 규칙 행 저장, 화면 이름 `Object`. `event="constructor"`로 `addMailRule`·`removeMailRule`·`setMailRuleEnabled`·`sendTestEvent` 넷 다 `TypeError`(→ `handleAdminAction`의 500 + 원문 메시지). `save key=constructor`·`saveVariable key=valueOf`는 문구 없는 `VALIDATION_FAILED`. 보강: 639행 `currentTemplateText`도 같은 부류라 `testTemplate templateKey=constructor`는 "이 템플릿은 발송이 꺼져 있습니다"(663-665)라는 틀린 이유로 거부된다. `__proto__`도 `in`을 통과한다
- LB23-5 — 확인(실행). `welcome` 테스트 본문에 `[예시 noticeChatLink]`
- LB23-6 — 확인(실행), 🟠 유지. CRLF가 든 주소가 정규식을 통과해 `dispatchEmail`의 `recipients`에 원문 그대로 들어가고, `client.ts:64-73`은 이를 이스케이프 없이 헤더로 잇는다. Gmail API `messages.send`는 raw 메시지의 To/Cc/Bcc 헤더로 수신자를 정하므로 주입된 `Bcc:`는 실제로 발송된다. 🔴로 올리지 않는 근거는 도달성이 아니라 **결함이 더하는 능력의 크기**다: 이 경로는 이미 관리자가 쓴 문구를 관리자가 고른 주소로 보내고, 쉼표 입력만으로도 수신자는 여럿이 된다 — CRLF가 더하는 것은 숨은 수신자와 임의 헤더다
- LB23-7 — 확인. 참조 검사(202-204)가 `mail-rule-history`를 보지 않고 캐시 읽기다
- LB23-8 — 확인. 네 곳 일치
- LB23-9 — 확인. `updatedAt`·`previous`가 바뀌어 `tables.ts:124`의 무변경 감지를 비껴간다
- LB23-10 — 확인. `schemas/mail-template.ts:9` "(행 삭제 = 기본 문구로 복원)"과 197-201행의 거부가 충돌
- LB23-11 — 확인. `revertMailEvent` 371-380은 수신자·템플릿을 검사하지 않고, 스키마는 자유 문자열
- LB23-12 — 확인. 693행 토큰 선취득도 일치(자격 증명 없으면 `getAdminAccessToken`이 던져 500)
- LB23-13 — 추가. 공용 변수 삭제가 템플릿 참조를 확인하지 않아 실제 메일에 빈칸이 나간다
- 누락 점검: 파일 전체와 라우트 16개 액션을 문서 없이 다시 읽었다(템플릿·변수 쪽 `mutate`의 원자성, 제목의 base64 인코딩(헤더 주입 없음), `save` 폼의 `enabled` 체크박스 존재, 규칙 추가의 중복 검사가 `mutate` 안에 있는 것). LB23-13 외 새 지적 없음
