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

사용처가 없는 컴포넌트: `ActionButton`, `ApplicationDetails`, `Pagination`, `SectionHeader`
(그리고 `src/lib/state.svelte.ts`). 새로 쓰기 전에 되살릴지 지울지 먼저 정한다.

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

- `getSemesterInfo(date?)` — 현재 학기 이름·키·기간 (3–8월 = 1학기, 9–2월 = 2학기, 1–2월은 전년도 2학기).
  서버의 학기 판정은 `server/core/semester.ts`(`currentTerm`, `termRange`)가 원천이다.
- `getSemesterKeyFromDate(iso)` — 날짜 → `YY-1`/`YY-2`.
- `getKSTDate(date?, onlyDate?)` — 서버 위치와 무관한 KST 문자열.
- `parseGoogleName(raw)` — SNU 계정 표시 이름 `"이름 / 신분 / 학과"` 분해.
- `normalizePhoneNumber(raw)` — 10·11자리 숫자를 하이픈 형식으로. 형식 검증은 domain 스키마(`010-XXXX-XXXX`)가 한다.

### 기타

- `src/lib/image.ts` — `thumbUrl`, `thumbSrcset`: Vercel 이미지 최적화 URL (dev에서는 원본). 폭은 `svelte.config.js`의 `images.sizes` 중 하나여야 한다.
- `src/lib/theme.ts` — 라이트/다크/시스템 테마.
- `src/lib/domain/navigation.ts` — `safeInternalRedirect`: 외부·`//`·`/\` 경로를 `/`로.
- `src/lib/client/api.ts` — `requestJson`(에러 봉투 검증), `fetchAdminQueue`, `uploadAdminFile`(presign → PUT, 5xx 재시도).
- `src/lib/client/admin-queue-poller.ts` — 탭이 보이고 온라인일 때만 도는 폴러.
