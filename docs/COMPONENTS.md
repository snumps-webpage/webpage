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
- **seminar/** `SeminarRequestForm` · **study/** `StudyRequestForm`, `StudyProposalHistory`, `StudyRosterPanel`, `StudySessionTimeline`,
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

### 스터디 개설 제안

`StudyRequestForm`은 `?/submit`으로 제출하고 `StudyProposalActionState`의 제출 결과만 읽는다. 실패한 native POST의 입력을 복원하며, 철회 결과가 작성 중인 원고를 초기화하지 않는다. `StudyProposalHistory`는 본인 신청을 검토 중 우선으로 표시하고 제출 원문과 상태 설명을 제공한다. 철회는 `details` 안의 확인 문구와 `?/withdraw` 폼으로 실행한다. `canSubmit`은 화면 제어이며 서버 권한 게이트를 대체하지 않는다.

### 세미나 제안 원고

`SeminarRequestForm`은 처리 중에도 원고와 선택 자료 컴포넌트를 유지하며 필드를 비활성화한다. create/update/withdraw 응답을 구분하고 native 실패 입력을 복원한다. `SpeakerSelector`는 네이티브 다중 체크박스, 기존 검색 범위(이름·학과), 선택 유지, 최대20명 안내를 제공한다. 빈 제출 선택은 신청자 기본값으로 덮어쓰지 않으며, 이름을 확인할 수 없는 기존 선택의 ID를 조용히 제거하지 않는다. 포스터 upload/storage 계약은 바꾸지 않는다.

### 회원 가입 원고

`MembershipApplicationForm`은 가입/수정 화면의 연락 정보를 공유하고 처리 중에도 원고를 유지한다. `SignupMetadataFields`는 계정 정보의 읽기 전용 정의 목록이다. `SignupContactFields`와 `SignupConsentField`는 상위 폼 상태에 바인딩되어 실패한 입력과 명시적 동의 선택을 복원한다. 학번의 HTML pattern은 문자열 표현으로 전달한다. 전화번호의 공백/하이픈 허용과 최종 검증은 기존 서버 스키마가 담당한다. `/wait`는 저장된 신청 원문·검토 상태·편집 경로·철회 안내를 제공하며 날짜는 KST로 표시한다.

### 공지·연락처 설정

`AccountSettingsNav`는 공지·연락처와 탈퇴 경로를 구분한다. 설정 화면은 단일 문서 제목과 두 설정 섹션, 공개 전 `details` 확인, 액션별 처리 중 상태와 결과 초점을 제공한다. `account-preferences.ts`의 `PreferenceActionState`·`preferenceFeedback`은 메일/전화 결과를 구분하고 필드 검증·안전한 서버 설명·운영 오류 안내 순서로 읽는다. `validatePhonePreferenceForm`은 `hide`의 명시적 boolean 문자열만 허용한다.

### 발표자 출석부

`presenter-attendance.ts`는 native 실패 선택 복원, 현재 명부에 대한 변경 병합, 요청 상태와 액션 결과 안내를 담당한다. 표시 체크박스는 포커스 가능한 네이티브 입력이다. `createAttendanceSubmissionGate`의 URL 범위와 세대를 확인해 다른 세미나/새 요청의 상태를 오래된 응답이 덮어쓰지 않게 한다. 발표자 페이지의 GET 선택 폼·POST action은 event query를 유지한다. 출석 저장과 취소는 별도 결과로 읽으며 취소의 `mailFailed`는 성공 상태와 함께 표시한다. 명부 밖 출석 병합과 실제 권한 검증은 기존 서비스와 존 가드가 맡는다.

### 회원 탈퇴 확인과 처리 중 화면

`member-withdrawal.ts`는 명시적인 실패 확인 선택의 초기 복원과 작업별 안전한 오류 안내·KST 표시를 제공한다. 탈퇴 페이지는 세 항목을 숨기지 않는 native 폼이며 SSR부터 제출한 checked/unchecked 선택과 원문 이름을 복원한다. `aria-invalid`·오류 대상과 enhanced 결과 초점을 연결한다. 처리 중 화면은 기존 서비스의 익명화 보류/기한 없는 본인 철회를 설명하며 취소와 로그아웃 busy 상태를 서로 잠근다. 실제 철회·접근 가드·메일은 기존 서버/서비스가 담당한다.

### MemberRecordSections 제출 계약

`member`, 대상/동작별 `actionState`, 공유 `busy`, `submit`을 받는다. 최초 SSR에서도 실패 입력을 복구하며 성공한 영역만 새 조회값으로 다시 채운다. 같은 회원의 다른 영역 초안은 유지되고 회원 이동 시 keyed 인스턴스를 새로 만든다. 탈퇴 유예 표시는 `withdrawalGraceEndsAt`의 KST 달력/말일 보정 규칙을 사용한다.

### 관리자 기록 실패 상태

`AdminSeminarRecordEditor`, `AdminStudyRecordEditor`, 활동/갤러리 페이지는 `admin-record-editor`의 scope/id 표시 헬퍼를 사용한다. 원문 값은 제출한 영역에만 적용하고, 빈 텍스트와 빈 발표자 배열은 저장 값으로 대체하지 않는다. 실패한 레코드를 검색 결과에 남기고 펼치며 서비스 오류와 업무 거절을 보이는 결과로 표시한다. 세미나 편집기는 `description`/`note` 입력과 native 반복 `presenterIds` checkbox를 가진다. 기존 이주 발표자도 저장된 선택의 일부로 표시한다.

### 관리 유틸리티 제출/초안 상태

`admin-utility-state`는 native 임원진 action URL과 대상/학기 피드백을 구성한다. viewTerm은 조회 문맥이며 targetTerm은 실제 배정/해제 입력의 학기다. `admin-mail-editor`는 템플릿·변수·규칙·생성·테스트 초안을 대상별로 분리하고 자신의 결과만 적용한다. 데이터 재조회는 새 키/삭제된 키를 맞추되 다른 열린 초안은 보존한다. constructor 같은 정상 변수 이름을 프로토타입 값으로 오인하지 않는다. 메일 편집 페이지의 native details는 JavaScript 없이도 form을 노출하며 pending 상태는 조회 완료까지 유지한다.
