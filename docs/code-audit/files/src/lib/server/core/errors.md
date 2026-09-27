# `src/lib/server/core/errors.ts` (61줄)

**접두사 `LA03-`** · 전 계층 공용 오류 코드(`ERR`)·코드별 기본 상태(`DEFAULT_STATUS`)·`AppError`, 그리고 패치 정리 유틸 `definedOnly`.

## LA03-1 🟡 `status` 덮어쓰기 옵션이 "상태는 계약"이라는 규칙을 스스로 연다

44행 `opts?.status`, 48행 `opts?.status ?? DEFAULT_STATUS[code]`. `errors.test.ts:5-17`은
"코드가 싣는 상태는 계약이지 세부가 아니다"를 명시하고 C-21·C-19 결정을 핀으로 박는다.
그런데 생성자가 호출부마다 그 계약을 바꿀 수 있게 열어 둔다 — `new AppError("WRITE_CONFLICT", { status: 503 })`는
타입 검사와 테스트를 모두 통과하고 C-21을 그 호출부에서만 되돌린다.

레포 전체에서 `status`를 넘기는 `new AppError` 호출은 **0건**이다(`grep -A3 "new AppError("`).
쓰이지 않는 탈출구가 계약을 약하게 만든다. 같은 형태가 `http.ts:32` `restError(code, status?)`에도
있다(→ `LA04-3`).

처방: 옵션에서 `status`를 빼고 `this.status = DEFAULT_STATUS[code]`. 새 상태가 필요하면 새 코드를
만든다. **구조만 바뀐다**(호출부 없음).

## LA03-2 🟡 오류 코드 목록이 두 벌이고, 핀은 한 방향뿐이다

7-19행 `ERR`와 `domain/api.ts:10-20` `API_ERROR_CODES`가 같은 아홉 코드를 같은 순서로 나열한다.
`errors.test.ts:32-37`은 `ERR ⊆ API_ERROR_CODES`만 확인한다 — 반대 방향(클라이언트 enum에만 있는
코드)은 통과한다. 코드 하나를 추가하려면 `ERR`, `DEFAULT_STATUS`(타입이 강제), `API_ERROR_CODES`
(테스트가 한 방향만 강제), 그리고 그 코드를 RAISE하는 SQL flow를 함께 고쳐야 한다.

또 `ERR`의 **값은 아무도 읽지 않는다.** 쓰는 곳은 `Object.keys(ERR)` 두 곳뿐이다
(`data/flows.ts:22`, `errors.test.ts:33`). 키=값 맵이 사실상 목록 역할을 한다.

`domain/`은 브라우저 안전 계층이고 서버가 import할 수 있다. `ErrCode = ApiErrorCode`로 두고
`DEFAULT_STATUS: Record<ApiErrorCode, number>`로 쓰면 목록은 한 벌이 되고 상태표의 누락은 타입이 잡는다.
**구조만 바뀐다.**

## LA03-3 🟡 `definedOnly`는 오류가 아니다

53-61행. `undefined` 키를 걷어내는 패치 유틸이 오류 모듈에 산다. 호출부 4개 파일
(`membership.ts:1`, `members-admin.ts:1`, `events.ts:1`, `records-admin.ts:1`)이 모두
`import { AppError, definedOnly }`로 함께 가져오는 것은 우연한 동거일 뿐이다.
"패치 병합 규칙을 찾으려면 errors.ts를 열어야 한다"는 것이 비용이다. 주석이 가리키는 문제(review C1 —
`{...row, ...patch}`가 JSON 직렬화로 필드를 지우는 것)는 데이터 계층의 규칙이다.

처방: `core/objects.ts` 같은 곳으로 옮기거나 `data/`의 패치 헬퍼 옆에 둔다. **구조만 바뀐다.**

## LA03-4 🟡 (검증 추가) 머리 주석이 옛 봉투를 적는다 — 한국어 문구는 이제 서버도 싣는다

1-5행: "Action wrappers convert AppError into fail(status, { error: code }); clients own the Korean message mapping."
실제 변환(`auth-guards.ts:161-162` `runAction`)은 `fail(e.status, { error: e.code, message: e.userMessage })`다.
한국어 문구도 서버가 만든다 — `requireCapability`(`auth-guards.ts:179-181`), `callFlow`의 DETAIL→`userMessage` 매핑(`data/flows.ts:24-41`).
같은 파일 41행 주석은 그 사실("Optional human-facing Korean detail")을 이미 적고 있어, 파일 안에서 두 주석이 어긋난다.
REST 봉투(`http.ts:31-34`)는 여전히 `{ error }`뿐이다. 따라서 "액션은 `{error, message?}`, REST는 `{error}`"로 둘을 나눠 적어야 한다.
**문서만 고친다.**

## 확인했고 지적하지 않은 것

- **`DEFAULT_STATUS: Record<ErrCode, number>`** — 코드를 추가하고 상태를 빠뜨리면 타입 오류가 난다. 좋은 구조다
- **`super(code)`로 message가 코드** — 로그·`handleError`에서 코드가 그대로 보이고, 한국어 문구는
  `userMessage`(42행)로 분리했다. `API-SPEC §1-2`의 "코드가 계약"과 맞다
- **`definedOnly`의 동작** — `Object.entries` + `undefined` 필터로 `null`(명시적 지움)은 남긴다.
  주석이 말한 목적과 정확히 일치한다
- **C-21 주석**(29-31행) — 결정 근거를 값 옆에 적었고 테스트가 같은 문장을 핀으로 가진다

## 검증 (2026-09-28)

- LA03-1 — 확인 (`status`를 넘기는 `new AppError`는 0건. 여러 줄 호출과 변수 인자 호출(`data/flows.ts:41`)까지 확인했다)
- LA03-2 — 확인 (`ERR`의 값을 읽는 곳은 없다. `Object.keys(ERR)` 두 곳뿐이다. 테스트는 한 방향만 검사한다)
- LA03-3 — 확인 (호출부 4개 파일이 모두 `AppError`와 함께 import한다)
- LA03-4 — 추가 🟡 (머리 주석의 봉투·문구 소유권이 `runAction`·41행과 다르다)
- 누락 점검: `AppError` 생성 경로(`flows.ts` 매핑, `requireCapability`)와 두 소비처(`runAction`, `toHttpError`)가 status·userMessage를 어떻게 다루는지 대조했다.
