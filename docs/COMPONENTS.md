# Component & Utility Guide

> 모든 컴포넌트는 Svelte 5 runes(`$props`, `$state`, `$derived`)로 쓴다. `export let`·`$:`·`<slot>`·`on:`은 쓰지 않는다.
> 서버 액션을 부르는 폼은 `use:enhance`로 감싸고, 결과는 **액션이 돌려주는 값**(`operation`, `issues` 등)으로만 화면을 바꾼다 —
> 각 화면의 결과 타입은 `src/lib/domain/*`에 있다 (예: `DashboardOperationResult`).

## 1. 공용 (`src/lib/components/`)

| 컴포넌트            | 역할                                                                     |
| ------------------- | ------------------------------------------------------------------------ |
| `ManuscriptHeader`  | 논문형 페이지 머리 (제목·부제·`Figure X-n`, 캡션은 `MANUSCRIPT.FIGURES`) |
| `SymbolBackground`  | 저대비 수학 기호 배경 (장식, `aria-hidden`)                              |
| `ExecutiveContacts` | 현 회장단 연락처 — 표지(cover)·푸터(footer) 두 변형                      |
| `StatusBadge`       | 상태 배지                                                                |
| `SuccessScreen`     | 제출 완료 화면                                                           |
| `Skeleton`          | 로딩 자리표시                                                            |
| `CopyButton`        | 클립보드 복사 (출석 링크 등)                                             |
| `Toasts`            | 전역 토스트 — `$lib/toasts`의 store를 구독, 루트 레이아웃에 포함         |

사용처가 없는 컴포넌트: `ActionButton`, `ApplicationDetails`, `Pagination`, `SectionHeader`.
새로 쓰기 전에 되살릴지 지울지 먼저 정한다.

## 2. 영역별

- **dashboard/** — `GuestLanding`(비로그인 `/`), `DashboardWorkSummary`(내 신청·스터디·인계 제안),
  `DashboardProfilePanel`(내 정보 수정), `DashboardActivityLedger`(학기·종류 필터, 참가 신청·취소).
- **admin/** — 큐: `AdminApplicationQueue`, `AdminAttendanceQueue`, `AdminEventLedger`, `AdminReviewInbox`.
  기록 편집: `AdminSeminarRecordEditor`, `AdminStudyRecordEditor`, `MemberRecordSections`, `AdminDirectUploadForm`.
  세미나 수명주기: `SeminarReviewCard`, `SeminarScheduleDialog`, `SeminarPublicationCard`. 탐색: `AdminSectionNav`.
- **poster/** — `SeminarPoster`(포스터 렌더), `SeminarPosterSection`, `SeminarPosterDownloadPanel`(`html-to-image`로 PNG, 지연 로드),
  `PosterUploadField`(presign 업로드), `SpeakerSelector`(`$bindable` 발표자 선택).
- **seminar/** `SeminarRequestForm` · **study/** `StudyRequestForm`, `StudyRosterPanel`, `StudySessionTimeline`,
  `StudySessionCorrectionDialog`, `StudyTransferPanel` · **signup/** 연락처·메타데이터·동의 필드 ·
  **public/** `PublicDirectoryGrid`, `PublicDirectoryNav`, `PublicIndexList`, `SourcePendingNotice` ·
  **account/** `AccountSettingsNav`.

## 3. 공용 유틸

### `src/lib/utils.ts`

- `parseGoogleName(raw)` — SNU 계정 표시 이름 `"이름 / 신분 / 학과"` 분해.
- `normalizePhoneNumber(raw)` — 10·11자리 숫자를 하이픈 형식으로. 형식 검증은 domain 스키마(`010-XXXX-XXXX`)가 한다.
- `formatPhoneForDisplay(phone)` — Notion 보관본에 남은 `010XXXXXXXX` 한 형태만 하이픈을 넣어 보여 준다
  (저장값은 그대로, `tel:` 링크는 숫자만).

### `src/lib/domain/term.ts` — 학기 규칙 (브라우저 안전)

학기 판정의 단일 정의다 — 페이지·서버·스크립트가 모두 이것을 쓰고(`server/core/semester.ts`는 `termOf`를
재수출), SQL 흐름의 `app_term_of`는 `flow-rules.test.ts`가 경계값에서 대조한다. 경계는 전부 KST다.

- `termOf(date)` — 3–8월 = `YY-1`, 9–2월 = `YY-2` (1–2월은 전년도 2학기).
- `termOfDateString(value)` — 저장된 날짜 문자열의 학기. ISO 시각은 KST 날짜로, `YYYY-MM-DD`는 그 KST 날로 읽고,
  날짜가 아니면 `"Unknown"`.
- `termLabel("26-1")` → `"2026년 1학기"`.

현재 학기·기간은 서버의 `currentTerm`, `termRange`(`server/core/semester.ts`)가 준다.

### `src/lib/domain/form-data.ts` — 폼 액션 검증

입력을 받는 폼 액션은 도메인 zod 스키마로 검증하고, 실패하면 쓰기 없이
`fail(400, { error: "VALIDATION_FAILED", issues, values })`로 **틀린 필드를 한 번에** 돌려준다. 규칙의 원천은
도메인 스키마 하나이고, 폼 컴포넌트는 `issues[field]`를 필드 옆에 보여 준다.

- `formText(formData, key)` — 스키마로 검증하는 액션의 필드 읽기 방법. 없는 필드와 `File`은 `""`로 읽어, 액션이 `null`로
  죽는 대신 스키마가 "필수"라고 답하게 한다.
- `fieldIssues(error, fields?)` — zod 실패 → 최상위 필드별 첫 메시지. 경로가 없거나 `fields` 밖의 문제는
  `_form`으로 모아 화면에 없는 필드 때문에 메시지가 사라지지 않게 한다.

```ts
// 도메인 (예: domain/studies.ts)
export function validateStudyRequestForm(formData: FormData) {
  const values = studyRequestValuesFromFormData(formData); // formText로 읽음
  const result = studyRequestInputSchema.safeParse(values);
  if (result.success) return result;
  return {
    ...result,
    failure: {
      error: "VALIDATION_FAILED" as const,
      issues: fieldIssues(result.error, [
        "title",
        "textbook",
        "description",
        "semester",
      ]),
      values,
    },
  };
}

// 액션
const parsed = validateStudyRequestForm(await request.formData());
if (!parsed.success) return fail(400, parsed.failure);
```

### 기타

- `src/lib/image.ts` — `thumbUrl`, `thumbSrcset`: Vercel 이미지 최적화 URL (dev에서는 원본). 폭은 `svelte.config.js`의 `images.sizes` 중 하나여야 한다.
- `src/lib/theme.ts` — 라이트/다크/시스템 테마.
- `src/lib/domain/navigation.ts` — `safeInternalRedirect`: 외부·`//`·`/\` 경로와, URL 해석 뒤에야 `//host`가 되는
  점 세그먼트 형태(`/.//evil.example`)를 `/`로.
- `src/lib/domain/admin-dashboard.ts` — `adminActionErrorMessage`: 거부된 관리자 액션의 알림 문구
  (서버가 보낸 메시지 → 알려진 코드별 한국어 문구 → 호출자의 기본 문구 순). 오류 코드를 그대로 보이지 않는다.
- `src/lib/domain/dashboard.ts` — `dashboardActivityErrorMessage`: 참가 신청·취소 거부 사유(이미 시작, 사라짐,
  참여 권한 없음, 기타).
- `src/lib/client/api.ts` — `requestJson`(에러 봉투 검증), `fetchAdminQueue`, `uploadAdminFile`(presign → PUT, 5xx 재시도).
- `src/lib/client/admin-queue-poller.ts` — 탭이 보이고 온라인일 때만 도는 폴러.
