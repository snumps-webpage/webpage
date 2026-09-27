# `src/lib/domain/seminars.ts` (214줄)

**접두사 `LC15-`** · 세미나 신청의 브라우저 안전 규칙 — 종류·공개 상태 목록(저장 스키마의 원천), 선호 시점 선택지, 신청 입력 스키마, 폼 읽기·검증.

## LC15-1 🟠 선호 시점 선택지가 "현재 학기"에 묶여 방학 넉 달 동안 지난 달만 내놓고, 학기를 넘긴 수정은 저장된 값을 지운다

21-33행 `seminarTimingOptions(term)`은 `term`이 `-1`로 끝나면 3·4·5·6월, 아니면 9·10·11·12월을 낸다. 두 호출자는
`currentTerm()`을 넘긴다(`seminar/apply/+page.server.ts:40`, `seminar/edit/[id]/+page.server.ts:55`). 그런데 학기 파생 규칙은
방학을 **끝난 학기**에 붙인다(`term.ts:21-22`: 7·8월 → `YY-1`, 1·2월 → 전년도 `-2`).

**(a) 방학 중 신청.** 8월에 여는 신청 폼은 `26-1`의 3~~6월을, 2월에 여는 폼은 전년도 9~~12월을 선택지로 준다 —
**전부 지난 달**이다. 세미나를 다음 학기에 하려는 사람은 "협의 후 결정"밖에 고를 수 없다. 1년 중 넉 달이다.
9-14행 주석은 "폼은 현재 학기의 월만 노출"을 의도로 적었지만, 그 "현재 학기"가 방학에는 이미 끝난 학기다.

**(b) 학기를 넘긴 수정.** 8월에 `"6월 말"`로 낸 대기 중 신청을 9월에 수정하면, 편집 폼의 `<select>`(`SeminarRequestForm.svelte:343-351`)에는
9~12월만 있다. Svelte 5의 `bind:value`는 일치하는 `<option>`이 없으면 `selectedIndex = -1`로 둔다
(`node_modules/svelte/src/internal/client/dom/elements/bindings/select.js:45`). 선택된 옵션이 없는 `<select>`는 폼 제출에
아무것도 싣지 않고 → `formText`가 `""`(`form-data.ts:8`) → 스키마가 `""`를 받아(113-114행) → `updateSeminarRequest`가 저장한다.
사용자는 제목을 한 글자 고쳤을 뿐인데 **선호 시점이 조용히 지워진다.** 서버 검증을 학기 무관 닫힌 집합으로 둔 13-14행의
"학기 경계에서도 안전"은 검증 쪽에만 참이다.

같은 뿌리가 한 번 더 있다: 스터디 신청 폼의 기본 학기도 `currentTerm()`이라(`study/apply/+page.server.ts:19`) 8월에는 끝난 `26-1`이 채워진다.
"새 신청이 겨냥하는 학기"라는 개념이 `term.ts`에 없어서 두 곳이 "현재 학기"로 대신한다.

처방: (a) 선택지는 "다가오는 활동 학기"로 — 7·8월이면 가을, 1·2월이면 봄 — 정하는 함수를 `term.ts`에 두고 두 신청 폼이 쓴다.
(b) 편집 폼은 저장된 값이 선택지에 없으면 그것을 옵션으로 덧붙인다. 둘 다 **동작 변경**. 22행의 `endsWith("-1") ? … : 가을`이
`-S`·`-W`·형식 밖 입력까지 가을로 보내는 것도 이 수정에서 인자를 "봄|가을"로 좁히면 함께 사라진다.

## LC15-2 🟡 `preferredTiming`의 오류는 필드가 아니라 폼 전체 오류로 간다 — 필드 목록을 손으로 두 번 적은 결과

스키마(110-116행)는 `preferredTiming`을 검증하고 "선택지에 없는 시점입니다."를 낸다. 그런데

- `SeminarRequestField`(65-73행)에 `preferredTiming`이 없고,
- `seminarFormIssues`(189-197행)가 `fieldIssues`에 넘기는 목록에도 없다.

`fieldIssues`는 목록 밖 필드의 메시지를 `_form`으로 보낸다(`form-data.ts:33-36`). 그래서 이 오류는 폼 상단 알림
(`SeminarRequestForm.svelte:107` `formError`)에 뜨고, 선택 상자에는 `aria-invalid`도 오류 문구도 붙지 않으며, `clearIssue`로 지울 수도 없다.

필드 목록이 **스키마 키와 별개로 두 번**(타입 65-73, 배열 189-197) 손으로 적혀 있어서 생긴 일이다. `studies.ts:49`는
`keyof StudyRequestFormValues | "_form"`으로 값 타입에서 필드 타입을 얻는다 — 같은 디렉터리 안에 이미 더 나은 형태가 있다.

처방: 필드 타입을 `keyof SeminarRequestFormValues`에서 얻고, 배열은 스키마의 `shape` 키로 만든다. 폼이 그 필드에 오류를 그리게 하는 것은
오류 위치가 바뀌는 **동작 변경**, 목록 통합은 **구조 변경**.

## LC15-3 🟡 `kind`를 캐스트로 좁혀 실패 응답의 타입이 거짓말을 한다

175행 `kind: formText(formData, "kind") as SeminarRequestFormValues["kind"]`. 요청 본문의 아무 문자열이 `SeminarKind | ""` 타입이 된다.
검증 실패 시 이 값은 `failure.values`로 그대로 클라이언트에 돌아가(`validateSeminarRequestForm` 206-212행 → `fail(400, parsed.failure)`)
폼의 `$state<SeminarKind | "">`(`SeminarRequestForm.svelte:59`)에 들어간다. 지금은 어느 라디오와도 일치하지 않아 아무것도 선택되지 않을 뿐이지만,
`kind`로 분기하는 코드(예: 종류별 안내 문구 표)가 생기면 타입이 보장한다고 믿은 두 값 밖의 값을 받는다.

판정 기준의 "좁은 타입의 값어치가 바로 아직 없는 호출부를 막는 것"에 해당한다 — 캐스트가 그 값어치를 없앤다.

처방: `SEMINAR_KINDS.includes(v) ? v : ""`로 좁힌다. 스키마는 어차피 거부하므로 **동작 변화 없음**(실패 응답에 되돌아가는 값만 `""`).

## LC15-4 🟡 "값 읽기 → `safeParse` → `{ error, issues, values }`" 조립이 도메인·라우트 여러 곳에 복제돼 있다

200-214행 `validateSeminarRequestForm`과 `studies.ts:207-220` `validateStudyRequestForm`은 이름 외에 같은 열 줄이다. 같은 조립이
`account.ts:59,121`, `admin-seminars.ts:204`, 라우트 지역 헬퍼 `study/[id]/manage/+page.server.ts:111-125` `parse`,
`(admin)/admin/+page.server.ts:204-207`에도 있고, 반환 모양이 조금씩 다르다(`{...result, failure}` vs `{ failure }` vs `fail(...)` 직접 — `LC01-2`).

결과: 실패 응답의 모양(예: 필드 목록을 스키마에서 얻기, LC15-2)을 바꾸려면 여섯 곳을 고쳐야 하고, 하나만 고치면 폼마다 다르게 동작한다.
`form-data.ts`가 "the one way to turn a schema failure into per-field form messages"를 표방하는 파일인데, 그 한 단계 위(읽기+검증+조립)는 공용이 없다.

처방: `form-data.ts`에 `validateForm(schema, values, fields)` 하나를 두고 래퍼들이 그것을 부른다. **구조 변경**.

## 확인했고 지적하지 않은 것

- **`SEMINAR_PUBLICATION_STATUSES`·`SEMINAR_KINDS`가 저장 스키마의 원천이다** (4·49-54행) — `schemas/seminar.ts:2,7`,
  `schemas/seminar-request.ts:14,32`가 이 배열로 `z.enum`을 만든다. `schemas/seminar.test.ts:93-104`가 "도메인과 같은 목록"을 고정한다.
  이 디렉터리에서 모범 형태다. SQL 흐름의 상태 리터럴(`'published'` 등)이 핀 없는 미러라는 것은 `LA43-4`의 몫
- **`SEMINAR_TIMING_OPTIONS`가 학기 무관 닫힌 집합(36-41행)** — 검증 쪽으로는 옳다(학기 경계에서 제출이 거부되지 않는다).
  도메인 거부 / 서비스 정규화 / 저장 무검증의 세 층 불일치는 `LB29-3`·`LA25-3`이 이미 셌다. 재등급하지 않는다
- **`attachmentUrl`의 refine(117-126행)** — 주석대로 union은 길이 오류를 "Invalid input"으로 삼킨다. `https` 한정은 `seminars.test.ts:23-39`,
  잘못된 URL이 던지지 않는 것은 `:41-60`이 고정한다. 저장값을 `href`로 쓰는 쪽의 검사 누락은 `LA29-7`
- **`parsePresenterIds`의 중복 제거(156-165행)** — 폼이 쉼표 목록으로 보내는 계약과 맞고 `seminars.test.ts:88-104`가 고정한다.
  스키마 자체는 중복을 거르지 않지만 운영 코드에서 스키마를 쓰는 입구는 `validateSeminarRequestForm` 하나뿐이다
- **`SEMINAR_MAX_PRESENTERS`·필드별 길이 상한** — 이름 붙은 상수이거나 문구와 같은 자리에 있다. 하드코딩 지적 대상이 아니다.
  예외 하나: 128행 발표자 id 원소의 `max(64)`는 다른 id 스키마들의 `200`(`LC07-6`)과 다른 값이다 — `LC07-6`의 공용 id 스키마가 함께 푼다(`LC16` 참조)
- **`MemberPickerItem`(59-63행)** — 같은 모양이 여러 이름으로 있다는 것은 `LA29-4`·`LA34-3`이 셌다. 이 타입이 통합의 기준으로 지목된 쪽이다
- **봄·가을 활동월(16-17행)이 학기 경계(`term.ts:21-22`)의 부분집합** — 3~~6월 ⊂ 3~~8월, 9~~12월 ⊂ 9~~2월. 두 규칙이 모순되지 않는다.
  문제는 어느 학기를 고르느냐(LC15-1)이지 월 목록이 아니다

## 검증 (2026-09-28)

- LC15-1 — 확인 ((a) 7·8월 → `YY-1`의 3~~6월, 1·2월 → 전년도 9~~12월, 넉 달. (b) 편집 폼 시드 `edit/[id]/+page.svelte:33` → `bind:value` 불일치 시 `select.js:44-45` `selectedIndex = -1` → 제출에서 빠짐 → `formText` `""` → 스키마 통과 → `normalizeTiming("")`(`services/seminar-requests.ts:18-22,75`)이 `""` 저장. 첫 옵션이 `value=""`인 "선택 안 함"이라 SSR만으로 제출돼도 결과가 같다. 🟠 유지)
- LC15-2 — 확인 (`form-data.ts:31-37`이 목록 밖 필드를 `_form`으로, 폼 `:107`이 `issues._form`을 상단 알림으로)
- LC15-3 — 확인
- LC15-4 — 확인 (인용 여섯 자리 모두 존재, 반환 모양 셋)
- 누락 점검: 214줄을 원문만으로 다시 읽었다(시점 선택지·스키마·폼 읽기·조립). `monthsForTerm`의 `-S`/`-W` 처리는 LC15-1 처방이 이미 포함한다. 추가 없음
