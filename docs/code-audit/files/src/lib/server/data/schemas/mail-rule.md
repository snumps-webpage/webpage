# `src/lib/server/data/schemas/mail-rule.ts` (24줄)

**접두사 `LA18-`** · `mail-rules` 테이블 행 스키마 — "이벤트 → 템플릿 → 수신자" 발송 규칙의 운영 가변부.

## LA18-1 🟡 닫힌 집합이라고 적은 두 필드를 자유 문자열로 받고, 읽는 쪽이 단언(cast)으로 메운다

> **검증 정정**(서술 한 곳, 등급 유지): "그 이벤트의 그 메일은 **조용히** 나가지 않는다"는 과하다. 규칙별 `catch`
> (`dispatch.ts:174-177`)는 로그를 남기고 `ok = false`로 두어 `emitMailEvent`가 `false`를 돌려준다 — 실패는 호출자에게
> 보고된다. 남는 결함은 원인이 "모르는 수신자"라는 사실이 `TypeError: Cannot destructure … undefined`로만 드러난다는 것과,
> 게이트가 두 번째 방어선 역할을 하지 않는다는 것이다. `switch`에 `default`가 없어 `undefined`를 돌려준다는 기전
> (`:93-105`)과 구조 분해가 던진다는 것(`:151-154`)은 맞다.

7-8행 주석: "이벤트·수신자 종류는 코드의 닫힌 집합(mail/events.ts)". 그러나 15행 `event`와 19행 `recipient`는
`z.string().min(1)`이다. 18행 주석은 집합을 **목록으로 하드코딩**한다 — `(party|admins|executives|members-opted-in)`.

읽는 쪽은 저장값을 믿고 단언한다:

- `dispatch.ts:122` `recipient: r.recipient as RecipientKind`
- `mail-admin.ts:298` 같은 단언, `:300`은 `RECIPIENTS[…] ?? r.recipient`로 모르는 값에 대비한다 — 한 파일 안에서도
  "닫혀 있다"와 "열려 있다"를 동시에 가정한다

결과: 쓰기 게이트는 모르는 수신자를 통과시킨다. 그 행이 발송에 이르면 `resolveRecipients`(`dispatch.ts:89-105`)의
`switch`에 `default`가 없어 `undefined`를 돌려주고, `const { emails, bcc } = …`(`:150-153`)가 `TypeError`를 던진다.
규칙별 `catch`(`:174-176`)가 로그만 남기고 넘어간다 — 그 이벤트의 그 메일은 **조용히** 나가지 않는다.
정상 쓰기 경로(`mail-admin.ts:411` `allowedRecipients` 검사)가 막고 있으므로 이 스키마는 두 번째 방어선인데, 그
방어선이 없다. 18행의 목록은 `RECIPIENTS`(`events.ts:13-20`)에 종류가 추가되면 낡는다.

처방 선택지(트레이드오프가 있다):

- (a) `z.enum(Object.keys(RECIPIENTS))` — 게이트가 닫히지만, 코드에서 수신자 종류를 **제거**하면 옛 행 때문에
  `mail-rules` 문서 전체가 디코드 실패한다(`effectiveRules`는 기본 규칙으로 물러서지만(`dispatch.ts:126-131`) 관리 화면은
  500). 제거 시 데이터 이행을 강제하는 것이 오히려 정직하다고 볼 수도 있다
- (b) 문자열을 유지하되 읽는 경계에서 한 번 거르고(모르는 값은 경고 후 규칙 제외) 단언을 없앤다, `switch`에
  `default`를 둔다

어느 쪽이든 18행의 하드코딩 목록은 `RECIPIENTS` 참조로 바꾼다. (a)는 동작 변경, (b)는 구조 변경에 가깝다.

## 확인했고 지적하지 않은 것

- **`templateKey`가 자유 문자열(17행)** — 커스텀 템플릿(`custom-…`, `mail-admin.ts:178`)이 런타임에 생기므로 닫힌
  집합이 될 수 없다. 템플릿이 사라진 규칙은 `renderMailTemplate`이 `null`을 돌려 규칙만 건너뛴다(`dispatch.ts:148-149`).
  옳다
- **행이 없으면 코드 기본 규칙(9-10행)** — `effectiveRules`(`dispatch.ts:108-131`)와 관리 목록(`mail-admin.ts:290-310`)이
  같은 규칙으로 구현한다. 주석과 일치
- **`(event, templateKey, recipient)` 유일성 미표현** — 서비스가 중복을 검사한다(`mail-admin.ts:426-433`). 스키마로
  표현할 수 없는 행 간 불변식이다

## 검증 (2026-09-28)

- LA18-1 — 정정 (규칙 실패는 `ok = false`로 호출자에게 보고된다 — "조용히"가 아니다. 등급 유지)
- 누락 점검: 24행 재독. `event`가 모르는 값인 행은 `effectiveRules`의 `r.event === event` 필터에 걸리지 않을 뿐 해가 없다. 추가 없음
