# `src/lib/server/core/strings.ts` (9줄)

**접두사 `LA08-`** · 비가시 문자(U+00AD·U+200B-200D·U+FEFF·U+2060) 제거.

## LA08-1 🟡 주석이 선언한 정책("데이터가 되는 입력은 전부")이 구조로 보장되지 않는다

4-5행: "데이터가 되는 입력은 전부 이걸 거친다." 실제로는 호출부가 하나씩 **옵트인**한다 —
`membership.ts:38-42,70`, `executives-admin.ts:43,144`, `signup/+page.server.ts:76`, `signup/edit/+page.server.ts:50`.
그 밖의 쓰기 경로는 거치지 않는다. 예:

- `members-admin.ts:29-38` `updateMember` — 관리자가 회원의 `name`·`department`를 고치는 경로다.
  2-3행이 말하는 오염원(노션 이주분 57건)에서 **복사해 붙여 넣기 가장 쉬운 곳**인데 제거 없이 저장된다
- 세미나·스터디 신청 제목 등 나머지 서비스(`grep stripInvisibles` 결과에 없음)

결과는 주석이 막으려던 것 그대로다 — soft hyphen이 이름 앞에서 "-"로 보이고 검색·비교가 오염된다.
정책을 선언한 곳과 집행하는 곳이 다르므로, 새 입력 경로는 기본적으로 빠진다.

처방: 입력 스키마 층(`domain/*`의 zod 문자열 필드, 또는 공용 `text()` 프리미티브)에서 `.transform(stripInvisibles)`를
걸어 경로가 아니라 **필드 종류**에 붙인다. **동작 변경**(지금 빠진 경로에서 제거가 시작된다).
그 경우 이 함수는 브라우저 안전 위치(`$lib/domain`)로 옮겨야 한다 — LA08-2와 같은 이사다.

## LA08-2 🟡 마이그레이션 쪽 미러가 필요 없는데 있고, 핀도 없다

> **검증 정정**: 등급과 결론은 그대로다. "복제의 이유가 없다"는 말을 좁힌다. 명시된 이유는 **있다**.
> `scripts/migration/lib.ts:3-4`는 "의도적으로 src/를 import하지 않는다 ($lib alias는 vite 밖에서 깨짐)"를 방침으로 적는다.
> 그러나 그 이유는 이 함수에 적용되지 않는다. `strings.ts`는 import가 하나도 없어 alias 문제가 생길 수 없다.
> 또 같은 파일 24행이 `../../src/lib/domain/term`을 import해 이미 그 방침에서 예외를 두고 있다. 처방은 그대로이고, 옮길 때 방침 문구에도 예외를 적어야 한다.

`scripts/migration/lib.ts:216-218`이 같은 함수를 같은 정규식으로 다시 정의한다(6행 주석 "앱 측 미러").
두 정규식은 지금 같지만(16진 대소문자만 다름) 둘을 대조하는 테스트는 없다. `strings.test.ts`는 이 파일 쪽만 본다.

그리고 복제의 이유가 없다. 같은 스크립트가 이미 `../../src/lib/domain/term`을 import한다(`lib.ts:24`,
`seed-dev.ts:14`). 이 함수는 의존성이 전혀 없으므로 `$lib/domain`으로 옮기면 스크립트도 import할 수 있다.
문자 집합을 넓히면(예: U+200E) 두 곳을 함께 고쳐야 하고, 놓치면 이주 데이터와 런타임 입력이 서로 다른 규칙으로 정리된다.
**구조만 바뀐다.**

## 확인했고 지적하지 않은 것

- **문자 집합의 선택** (8행) — `strings.test.ts:21-27`이 남길 것(NBSP·U+3000·U+200E·U+2061)까지 핀으로 고정했다.
  "무엇을 지우지 않는가"를 테스트가 말하는 것은 좋은 형태다
- **`/g` 플래그** — 모든 출현을 지운다(`strings.test.ts:38-40`)
- **`trim()`을 하지 않는다** — 제거와 공백 정리를 섞지 않는다. 호출부(`executives-admin.ts:43`)가 필요한 곳에서 붙인다

## 검증 (2026-09-28)

- LA08-1 — 확인 (`stripInvisibles`의 호출은 `membership.ts`, `executives-admin.ts`, `signup`, `signup/edit`뿐이다. 관리자의 회원 수정(`admin/members/[id]/+page.server.ts:96-128` → `members-admin.ts:29-38`)은 `name`·`department`를 거르지 않고 저장한다)
- LA08-2 — 정정 (등급 유지. 이주 스크립트의 "src import 금지" 방침(`lib.ts:3-4`)이 명시된 이유이지만, 이 함수에는 적용되지 않고 스크립트도 이미 예외를 둔다)
- 누락 점검: 두 정규식(`strings.ts:8`, `lib.ts:217`)의 문자 집합을 대조했다. 대소문자 말고는 같다. 새 지적은 없다.
