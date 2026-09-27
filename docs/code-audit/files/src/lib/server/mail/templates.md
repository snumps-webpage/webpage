# `src/lib/server/mail/templates.ts` (114줄)

**접두사 `LB14-`** · 발송 지점 어댑터(S10). 서비스·라우트가 부르던 함수 시그니처를 유지하며 내부를 `emitMailEvent` 한 줄로 위임한다.

## LB14-1 🟠 여덟 어댑터 전부가 발송 결과를 버린다 — 실패가 관리자에게 도달할 길이 없다

> **검증 정정**: 인용만. `ARCHITECTURE.md:126`은 에셋 절이다 — 인용한 계약 문장은 작업 트리 `:148-149`(HEAD `:110-111`)에 있다.
> 주장은 모두 확인했다: 여덟 함수 모두 `Promise<void>`, 호출부 여덟 곳(`admin/+page.server.ts:188-189,221,234`,
> `signup:113`, `seminar/apply:70`, `study/apply:49`, `events/[id]/[type]:90`)은 결과를 받을 수 없고, 거절 경로는
> `rejectApplication`이 행을 지운 뒤(`membership.ts:127-131`) 보낸다. 등급 유지.

모든 함수가 `await emitMailEvent(…)`의 boolean을 버리고 `Promise<void>`를 반환한다
(12, 22, 34-40, 52-56, 67-71, 81-84, 94-97, 107-113행). `emitMailEvent`는 실패를 던지지 않고 `false`로만
알리므로(`dispatch.ts:13-14`), 이 파일을 거치는 순간 실패는 **로그 외에 아무 데도 남지 않는다.**

`ARCHITECTURE.md:126`은 "전송 실패는 상태를 되돌리지 않는다 — 액션은 `mailFailed`로 알린다"를 메일 계층의
계약으로 적는다. 같은 계층의 `announcements.ts`는 boolean을 돌려주고 세미나 서비스가 `mailFailed`로 올린다.
이 파일의 호출부는 그럴 수 없다.

가장 무거운 경로는 가입 거절이다. `routes/(admin)/admin/+page.server.ts:233-234`는 신청 행(주소의 유일한
사본)을 **먼저 지우고** 메일을 보낸다. 메일이 실패하면 주소는 이미 없고, 관리자 화면은 성공을 표시한다 —
거절 통지는 **복구 불가능하게, 아무도 모르게** 사라진다. 승인 환영 메일(채팅방 링크를 싣는 유일한 경로,
`template-store.ts:40-54`)도 같다.

처방: 반환형을 `Promise<boolean>`으로 하고 호출부가 `mailFailed`를 돌려준다. **동작 변경**(화면에 경고가 생긴다).

## LB14-2 🟡 가입 거절 통지의 발송 순서가 세 곳에서 거꾸로 적혀 있다

59-62행 "sent **BEFORE** the row (the only copy of the address) is removed". 실제는 그 반대다 —
`services/membership.ts:127-131`이 행을 지우고 주소를 반환하며, 라우트(`admin/+page.server.ts:231-234`)가
그 반환값으로 메일을 보낸다. 라우트 주석 자체가 "mail with the return value or never"라고 **후행**을 적고 있다.

같은 거짓이 `events.ts:50` "(인적사항 삭제 직전)", `template-store.ts:57` "인적사항 삭제 직전 발송"에 있고,
뒤의 둘은 관리자 메일 화면에 표시된다. "직전"을 믿은 사람은 메일 실패 시 주소가 남아 있다고 가정한다 —
`LB14-1`이 그 가정이 틀렸을 때의 결과다.

처방: 세 문구를 "삭제 후, 반환된 주소로"로. **문구만.**

## LB14-3 🟡 같은 역할의 어댑터가 두 파일에 나뉘어 있고 기준이 없다

이 파일(머리 주석 "발송 지점 어댑터 (S10)")과 `announcements.ts`(4-8행 "S10 어댑터")는 같은 일을 한다 —
발생 지점의 인자를 이벤트 변수로 옮겨 `emitMailEvent`를 부른다. 차이는 우연이다.

| 항목        | `templates.ts`          | `announcements.ts`                              |
| ----------- | ----------------------- | ----------------------------------------------- |
| 반환        | `void` (결과 버림)      | `boolean`                                       |
| import 경로 | 배럴 `$lib/server/mail` | 직접 `$lib/server/mail/announcements`           |
| 내용        | 신청·승인·출석 통지     | 전체 공지 **+ 회장단 탈퇴 통지**(공지가 아니다) |

파일 이름 `templates.ts`는 템플릿을 담지 않는다(템플릿은 `template-store.ts`). 새 이벤트의 어댑터를 어느 파일에
둘지, 결과를 돌려줄지를 정할 기준이 코드에 없다.

JSDoc도 이관 전 상태에 머물러 있다 — "to admins"(9, 16, 75, 88행)는 이제 규칙이 정하며 관리자가 바꿀 수 있다.

처방: 한 파일(예: `notify.ts`)로 합치고 반환을 boolean으로 통일. `LB14-1`과 함께 하면 **동작 변경**, 따로 하면 구조만.

## 확인했고 지적하지 않은 것

- **발생 지점이 넘기는 변수와 카탈로그의 일치** — 여덟 함수 모두 `events.ts`가 선언한 변수를 정확히 넘긴다
  (`applicantName` / `name` / `userName·eventName` / `applicantName·title` / `name·title`). 연결이 타입으로
  고정되지 않은 것은 `LB12-3`
- **`party` 이벤트는 모두 `partyEmail`을 넘긴다** — 34-40, 52-56, 67-71, 107-113행. 누락을 막는 장치가 없는 것은 `LB11-5`
- **`status === "approved" ? … : …` 매핑이 세미나·스터디에 두 번(35-37, 53행)** — 두 줄짜리 대칭이고 이벤트 이름이
  다르다. 공통화 이득이 없다

## 검증 (2026-09-28)

- LB14-1 — 정정 (인용 위치. 🟠 유지)
- LB14-2 — 확인. `LB12-6`·`LB13-5`를 이 지적의 중복으로 철회했다 — 세 사이트의 대표 지적은 이것이다
- LB14-3 — 확인
- 누락 점검: 여덟 함수의 이벤트·변수·`partyEmail` 전달을 `events.ts`와 대조했다(일치). `private-info.email`은 `""`를 허용하지만(`schemas/private-info.ts:9`) 세미나·스터디 결과 통지 호출부가 빈 주소를 먼저 거른다(`admin/+page.server.ts:185`) — 그 가드가 빠진 새 호출부의 조용한 성공은 `LB11-5`의 몫이다. 새 지적 없음
