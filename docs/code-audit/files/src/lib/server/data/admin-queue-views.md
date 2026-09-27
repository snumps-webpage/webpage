# `src/lib/server/data/admin-queue-views.ts` (144줄)

**접두사 `LA29-`** · 관리자 큐 3종(가입 신청·세미나 신청·스터디 신청)의 행→item 투영, 큐 정렬, 표시용 이름 맵. 기록 편집기용 파일 행 헬퍼도 여기 있다.

## LA29-1 🟠 세미나 신청의 `kind`를 저장값 대신 `"irregular"`로 박는다

85-87행:

```ts
// The stored request has no kind — proposals default to 비정기; the
// reviewer picks the final label in the UI (informational only).
kind: "irregular",
```

**주석의 전제가 더 이상 참이 아니다.** 커밋 `a877404`가 `seminar-requests`에 `kind`를 저장하게 했다
(`schemas/seminar-request.ts:28-32` — "The form always asks; rows from before it was stored read as null").
신청 폼은 정기/비정기를 필수로 묻는다(`SeminarRequestForm.svelte:184-223`). 그 커밋은 `views.ts`에는
`kind`를 실었지만 이 투영은 고치지 않았다.

결과: 신청자가 **정기**로 낸 신청이 관리자 화면에서 비정기로 보인다.

- `SeminarReviewCard.svelte:57` — `"I"` 표식
- `AdminReviewInbox.svelte:45` — `seminarKind(request.kind)` 문구
- `SeminarReviewCard.svelte:19` — 검토자의 라디오가 `irregular`로 **미리 선택**된다

승인 폼이 `kind`를 hidden으로 보내지만(`:143`) `approveSeminar` 액션은 읽지 않는다
(`(admin)/admin/+page.server.ts:372-381`). 즉 저장 데이터가 망가지지는 않고, **관리자가 보는 사실이 틀린다.**

같은 개념에 규칙이 셋이다: 저장된 `r.kind`(`views.ts:19`), 이 파일의 상수, 그리고 세미나 행에 대해
`sourceRequestId` 유무로 추측하는 `kindOf`(`(admin)/admin/seminars/+page.server.ts:59-60`).

**고침**: `kind: r.kind ?? "irregular"` + 주석 정정. 화면 표시가 바뀌는 **동작 변경**이다
(`null`인 옛 행은 지금과 같다).

## LA29-2 🟠 `contentFileFromKey`가 모르는 크기를 `0`으로 채우고, 편집기는 그것을 크기로 그린다

142행 `size: 0`. 130행 주석은 "size is not tracked"라고 안다. 그러나 타입
`AdminContentFile.size: number`(`domain/admin-records.ts:7-11`)에는 "모른다"를 담을 자리가 없고,
두 편집기가 그 값을 실제 크기처럼 렌더한다:

- `AdminSeminarRecordEditor.svelte:316` — `{(file.size / 1024).toFixed(1)} KB`
- `AdminStudyRecordEditor.svelte:255` — 같은 식

**모든 파일이 "0.0 KB"로 표시된다.** 센티널 값이 계약 타입을 통과해 사실로 표시되는 형태다.

**고침**: `size: number | null`로 바꾸고 `null`이면 크기 문구를 생략. 타입·화면이 바뀌는 **동작 변경**.
(크기를 실제로 채우려면 Storage 메타데이터 조회가 필요하다 — 별개 결정.)

## LA29-3 🟡 `contentType`·`url`은 아무도 읽지 않고, `contentType`은 계산도 틀린다

138-141행:

```ts
contentType: kind === "pdf" ? "application/pdf" : `image/${name.split(".").pop() ?? "jpeg"}`,
```

- 업로드 키는 원래 확장자를 소문자로 보존한다(`services/uploads.ts:70,102`). `.jpg` 키는 `image/jpg`가 된다 —
  등록된 타입은 `image/jpeg`이고, 업로드 검증도 `image/jpeg`만 안다(`uploads.ts:17,39`)
- 점이 없는 키는 `image/<파일명 전체>`가 된다
- `?? "jpeg"`는 **죽은 분기**다. `String.prototype.split`은 항상 원소가 하나 이상인 배열을 돌려주므로 `pop()`이
  `undefined`일 수 없다

그리고 `contentType`과 `url: null`(137행)을 읽는 소비자가 **없다**(`grep`으로 `file.contentType`·`file.url` 0건 —
편집기는 `name`·`kind`·`size`·`id`만 읽는다). 틀린 값을 아무도 안 보는 것은 무해가 아니라,
다음 소비자가 믿을 값이 틀려 있다는 뜻이다.

**고침**: 두 필드를 계약에서 빼거나(구조), 남긴다면 확장자→MIME 표를 `uploads.ts`의 허용 목록에서 파생.

## LA29-4 🟡 `memberSummaryById`는 호출자가 없다 — 타입을 정의하려고 존재하는 죽은 함수

19-26행의 함수는 저장소 어디에서도 호출되지 않는다. 쓰이는 것은 28행의
`MemberSummaryMap = ReturnType<typeof memberSummaryById>`뿐이다
(`api/admin/seminar-requests/+server.ts:4,24`, `study-requests/+server.ts:4,24`).

게다가 같은 `{id, name, department}` 투영이 35-43행에 다시 쓰였고, `repos.ts:17`에도 있으며,
도메인에는 구조가 같은 타입이 둘 있다(`domain/seminars.ts:59` `MemberPickerItem`,
`domain/admin-seminars.ts:15` `SeminarRequesterSummary`).

**고침**: `type MemberSummaryMap = Map<string, SeminarRequesterSummary>`로 직접 선언하고 함수 삭제. 구조만 바뀐다.

## LA29-5 🟡 "알 수 없음" 대체값이 세 파일에 있다 — 모듈 주석의 "never drift" 약속과 어긋난다

13-17행은 "one mapping per queue so the three consumers can never drift apart"라고 적는다.
그런데 같은 디렉터리 맵으로 이름을 푸는 두 관리자 페이지가 대체값을 따로 쓴다:

- 45행 `UNKNOWN_MEMBER` (이 파일, 96·98-101·118-121행에서 사용)
- `(admin)/admin/seminars/+page.server.ts:57-58` — `{ id, name: "알 수 없음", department: "" }` 인라인
- `(admin)/admin/studies/+page.server.ts:41` — `?.name ?? "알 수 없음"` 인라인

문구를 바꾸거나(예: "탈퇴 회원") 해석 규칙을 바꾸면 세 곳을 고쳐야 한다.
**고침**: `resolveSummary(map, id)`를 내보내 세 곳이 쓰게 한다. 구조만 바뀐다.

## LA29-6 🟡 모듈 경계: 큐 투영이 아닌 것이 섞여 있고, 데이터 계층이 공개 존 모듈을 import한다

- `contentFileFromKey`(130-144)는 큐 투영이 아니라 **기록 편집기** 헬퍼다(호출자:
  `admin/seminars/+page.server.ts:119-120`, `admin/studies/+page.server.ts:65`). 모듈 주석(13-17)의 범위 밖이다
- 10행이 `$lib/server/public/archive`에서 `assetUrl`을 가져온다. `public/archive.ts`는 게스트 존 읽기
  모듈이고(그 자체가 `data/directory`·`data/tables`를 import한다) — `data → public → data` 방향이다.
  `ARCHITECTURE.md`의 디렉터리 표(`data/` 아래 `services/`)가 그리는 계층 순서와 반대다. `repos.ts`의 `data → services`와 같은 형태(`LA34-1`)

구조 제안이다. `assetUrl`은 URL 정책이므로 `core/`나 `data/storage` 쪽이 자연스럽다.

## LA29-7 🟡 `attachmentUrl`이 https라는 보장은 폼에만 있고, 이 투영은 저장값을 그대로 `href`에 넘긴다 (검증 추가)

93행 `attachmentUrl: r.attachment || null`. 소비자는 `SeminarReviewCard.svelte:90-91` —
`<a href={request.attachmentUrl} target="_blank">`. 이름이 `…Url`이고 관리자 화면이 링크로 그린다.

그런데 "https 주소"라는 성질은 **회원 폼 스키마에만** 있다(`domain/seminars.ts:77,119-126` `httpsUrl` refine).
저장 스키마는 `attachment: z.string()`(`schemas/seminar-request.ts:25`)이고, 서비스 입력도 `attachment: string`
(`services/seminar-requests.ts:31`)이다. 폼을 거치지 않는 작성자가 이미 있다 — Notion 이주 스크립트가
`강의 자료` url 속성을 문자열 그대로 옮긴다(`scripts/migration/20-export-tables.ts:400-409`). Notion의 url 속성은
스킴을 강제하지 않으므로 스킴 없는 주소(상대 링크가 된다)나 `javascript:` 같은 값이 `pending` 행으로 들어와도
이 투영과 저장 게이트 어느 쪽도 막지 않는다. Svelte는 `href` 값의 스킴을 거르지 않는다.

판정 기준대로 "지금 이주된 값은 전부 정상이다"·"회원 폼이 막는다"는 감면 근거가 아니다 — 폼은 작성 경로 **하나**의
검사이고, 이 투영은 **모든** 행을 링크로 만든다.

**고침**: 투영에서 `https:`가 아니면 `null`(링크 생략), 또는 저장 스키마에 같은 refine을 두어 쓰기 게이트로 올린다.
전자는 이 파일만, 후자는 이주 데이터 검증이 따라오는 **동작 변경**.

## 확인했고 지적하지 않은 것

- **`byCreatedAtAsc`(72-77)** — 문자열이 아니라 시각을 비교한다. `createdAt`은 `DateTime`(offset 필수,
  `schemas/common.ts:13`)으로 검증되므로 `Date.parse`가 `NaN`을 낼 입력은 쓰기 게이트를 통과하지 못한다.
  `queue-order.test.ts`가 +09:00/+00:00 역전을 고정한다. 8개 호출 지점이 모두 쓴다(`PRIORITY.md:208`)
- **`canApprove`/`canReject: true` 상수** — 세 큐 모두 미처리 행만 투영한다(가입 신청은 저장 관례, 나머지는
  호출자의 `pending` 필터). 상수가 맞다
- **`consentAt: a.createdAt`(59)** — 동의는 제출 시점에 받는다. 파생이 맞다(`QA-2` 철회 기록과 같은 불변식)
- **스터디 item의 `status`·`canWithdraw`(122·124)** — `QD-4`가 이미 지적했다(당시 행번호 `:92-112`).
  현재 행번호만 갱신하고 여기서 재등급하지 않는다
- **`posterUrl`(94)** — `assetUrl`은 공개 모드에서 CDN이 없으면 `""`를 돌려주므로 `posterUrl`이 `null` 대신
  `""`가 될 수 있다. 소비자가 truthiness로 가드하므로 표시는 같다. `W-8`의 결정(진단 문자열 대신 빈 문자열)을
  따르는 것이라 지적하지 않는다
- **`directorySummaryIndex`의 비용** — `QS-4`·`QD-5`가 다뤘다

## 검증 (2026-09-28)

- LA29-1 — 확인. 저장(`seminar-requests.ts:44` `kind: input.kind ?? null`, 신청 폼 `apply/+page.server.ts:54,65`) →
  투영 87행 상수 `"irregular"` → `SeminarReviewCard.svelte:57`(R/I 표식)·`:19`(라디오 초기값)·`AdminReviewInbox.svelte:15,45`
  까지 추적. `approveSeminar`(`(admin)/admin/+page.server.ts:372-381`)는 `kind`를 읽지 않음도 확인
- LA29-2 — 확인. `record.files`는 서버에서만 채워지고(두 페이지의 `contentFileFromKey`뿐), 두 편집기 `:316`·`:255`가
  `(0/1024).toFixed(1)` → "0.0 KB"를 모든 파일에 그린다
- LA29-3 — 확인
- LA29-4 — 확인(`memberSummaryById` 호출 0건, 타입만 두 API가 사용)
- LA29-5 — 확인
- LA29-6 — 확인(`public/archive.ts:2-3`이 `data/directory`·`data/tables`를 import)
- LA29-7 — 추가
- 누락 점검: 세 투영의 필드 출처(스프레드 없음)·`byCreatedAtAsc`·`canApprove` 상수·`posterUrl`·`consentAt` 파생을 코드로
  다시 읽었다. `adminApplicationItem`의 PII는 관리자 큐가 소비자라 정당하다. 추가는 LA29-7 하나.
