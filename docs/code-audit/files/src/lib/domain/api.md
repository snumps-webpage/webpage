# `src/lib/domain/api.ts` (71줄)

**접두사 `LC05-`** · 브라우저와 서버가 공유하는 REST 계약: 관리자 큐 경로, 오류 코드 enum과 오류 봉투, 큐 응답 봉투, 업로드 용도와 presign 요청·응답 스키마.

## LC05-1 🟡 업로드 용도 목록이 두 벌이고, 같은 이름의 타입도 두 개다

38-44행 `UPLOAD_PURPOSES`와 `server/services/uploads.ts:41-56` `PURPOSES`의 키는 같은 다섯 값을 따로 적는다.
타입도 각자 만든다 — 여기 46행 `UploadPurpose`와 `uploads.ts:58` `UploadPurpose = keyof typeof PURPOSES`. 둘을 묶는 테스트가 없다
(`UPLOAD_PURPOSES`/`PURPOSES`를 참조하는 테스트 0).

한쪽에만 용도를 더했을 때:

- 서버에만: presign 라우트가 `presignBodySchema`(이 파일)에서 400을 낸다(`api/uploads/presign/+server.ts:43-46`). 원인 표시는 없다
- 도메인에만: 클라이언트 타입과 라우트 스키마는 통과하고 서비스가 `isUploadPurpose`에서 `VALIDATION_FAILED`(`uploads.ts:86`)

둘 다 실패 쪽으로 닫히므로 오염은 없지만, 새 용도를 들이는 일이 항상 두 곳 편집이고 빠뜨림은 런타임 400으로만 드러난다.
처방: 서버가 이 목록에서 파생 — `PURPOSES`에 `satisfies Record<UploadPurpose, …>`를 걸고(도메인 타입 import), 서버 쪽 `UploadPurpose` 선언을 지운다.
구조 변경, 동작 동일.

## LC05-2 🟡 `presignRequestSchema`의 `operationId` 검증은 어느 전송로에서도 돌지 않는다

48-54행은 `operationId: z.uuid()`를 포함한 요청 스키마이고, 61-63행이 곧바로 그것을 빼서 실제 본문 스키마를 만든다
(주석: "the operationId stays client-side … so the body omits it").

- 운영에서 `presignRequestSchema`를 `parse`하는 곳은 없다. 클라이언트는 `Omit<PresignRequest, "operationId">` **타입**만 쓴다(`client/api.ts:108`)
- `operationId`가 uuid인지 확인하는 코드는 `client/api.test.ts:58-66` 하나뿐이다 — 테스트가 운영에 없는 규칙을 고정한다
- 실제 `operationId`는 편집기가 만들어 `uploadAdminFile`에 넘기는 값이고(`client/api.ts:100-104`), 어디서도 검증되지 않는다

즉 이 스키마는 존재하는 이유가 "빼기 위해서"다. 처방: `presignBodySchema`를 기본으로 두고 `PresignRequest` 타입이 필요하면
`presignBodySchema.extend({ operationId })`로 표시한다. 테스트의 uuid 단언은 실제로 검증하는 자리가 생길 때 그쪽으로 옮긴다. 구조 변경.

## 확인했고 지적하지 않은 것

- **`API_ERROR_CODES`(10-20행)와 서버 `ERR`(`core/errors.ts:7-19`)의 이중 목록** — `errors.test.ts:32-37`이 "`ERR`의 모든 코드가 이 enum 안에 있다"를 고정한다. 반대 방향(여기에만 있는 코드)은 고정되지 않지만, 그 경우 결과는 클라이언트가 오지 않을 코드를 허용하는 것뿐이다. 위험한 방향 — 서버가 enum 밖 코드를 보내 `restErrorEnvelopeSchema`가 봉투를 거부하는 것(`hooks.server.ts:199-203`) — 이 막혀 있다. 고정된 미러다
- **`restErrorEnvelopeSchema`의 엄격한 enum**(24행) — 위와 같은 이유로 의도된 계약이다. 크론 엔드포인트의 `{ error: "Maintenance failed" }`(`api/cron/maintenance/+server.ts:31`)는 enum 밖이지만 브라우저 클라이언트가 부르지 않는 기계 간 엔드포인트다
- **`ADMIN_QUEUE_PATHS`(3-7행)의 경로 문자열** — `src/routes/api/admin/` 아래 세 디렉터리와 같다. 타입으로만 쓰여 `fetchAdminQueue`의 인자를 닫힌 집합으로 좁힌다(`client/api.ts:71-74`). 경로 자체가 공개 계약이라 하드코딩이 맞다
- **`queueResponseEnvelopeSchema.items: z.unknown()` + `QueueResponse<T>` 캐스트**(27-36행) — 봉투만 검증하고 항목은 믿는다. 항목 타입은 서버(`admin-queue-views.ts`)와 화면이 같은 도메인 DTO를 import하므로 같은 저장소 안에서 컴파일러가 모양을 묶는다. 전송 경계에서 항목을 다시 검증할 이유가 약하다
- **`generatedAt`의 오프셋 필수**(30행) — 서버가 `nowKstIso()`(`+09:00`)로 채운다. 일치한다
- **presign 크기 상한 없음**(53행 `z.int().positive()`) — 용도별 상한은 서버가 `PURPOSES[purpose].maxBytes`로 확인한다(`uploads.ts:87-97`). 도메인이 상한을 복제하지 않는 것이 옳다(LC05-1의 두 목록을 늘리지 않는다)
- **`presignSuccessSchema`** — 클라이언트가 응답을 파싱한다(`client/api.ts:126`). 응답 계약을 양쪽이 공유하는 올바른 형태다

## 검증 (2026-09-28)

- LC05-1 — 확인 (`uploads.ts:41-56` `PURPOSES`, `:58` 서버 `UploadPurpose`, `:86` `isUploadPurpose`. 라우트는 `presignBodySchema`에서 먼저 400을 낸다(`presign/+server.ts:43-46`). 두 목록을 묶는 테스트 0)
- LC05-2 — 확인 (`presignRequestSchema`의 운영 `parse` 0. `client/api.ts:108`은 `Omit<…, "operationId">` 타입만 쓴다. 덧붙임: 도메인에는 "operationId"의 규칙이 하나 더 있다. `domain/studies.ts:54` `operationIdSchema = z.uuidv7(…)`이다. 이 파일은 `z.uuid()`다. 처방에서 uuid 단언을 옮길 때 어느 쪽을 기준으로 할지 함께 정해야 한다)
- 누락 점검: 71줄을 문서 없이 다시 읽었다. `API_ERROR_CODES` ⊇ `ERR`은 `errors.test.ts:32-37`이 고정한다. `ADMIN_QUEUE_PATHS`는 세 라우트 디렉터리와 일치한다. `presignSuccessSchema`는 클라이언트가 파싱한다. 새 지적은 없다.
