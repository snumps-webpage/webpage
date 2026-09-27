# `src/lib/domain/form-data.ts` (40줄)

**접두사 `LC09-`** · 폼 필드 읽기(`formText`)와 zod 실패 → 필드별 메시지 변환(`fieldIssues`). 액션 스무 곳 남짓이 쓰는 공용 헬퍼.
짝 테스트 `form-data.test.ts`(47줄)를 규칙의 일부로 읽었다.

## LC09-1 🟡 `fieldIssues`의 문서 주석이 타입 별칭에 붙어 있다

11-16행 JSDoc 바로 아래가 `type IssueSource`(17-19행)다. JSDoc은 **바로 다음 선언**에 붙으므로 이 설명은
`IssueSource`의 것이 되고, 정작 `fieldIssues`의 오버로드(21-29행)에는 문서가 없다 — 편집기에서 `fieldIssues`를
가리키면 아무 설명도 뜨지 않는다. 이 헬퍼에서 가장 중요한 계약("`_form`으로 모아 메시지를 잃지 않는다")이
호출부에서 보이지 않는다. 처방: 타입을 주석 위로 올린다. **구조만 바뀐다.**
(`archive.ts`의 `LB16-9` 둘째 항목과 같은 부류.)

## LC09-2 🟡 "메시지를 잃지 않는다"는 보장이 선택 사항이다

13-15행이 약속하는 것 — "폼이 그리지 않는 필드의 메시지는 `_form`으로" — 은 **`fields`를 넘길 때만** 성립한다.
넘기지 않는 오버로드(21행)는 모든 최상위 키를 그대로 돌려주고 반환형이 `Record<string, string>`이라
페이지가 그 키를 그리는지 컴파일러도 확인하지 못한다.

실제 호출: `fields`를 넘기는 곳은 도메인 래퍼 다섯(`dashboard.ts:100`, `seminars.ts:189`, `account.ts:113`,
`admin-seminars.ts:189`, `studies.ts:199`), 넘기지 않는 곳은 라우트 열아홉(`admin/+page.server.ts:209,287,348`,
`admin/members/[id]/+page.server.ts:120,121,139,151,179,196`, `signup/+page.server.ts:84` 등).
확인한 `signup`은 네 필드를 모두 그린다(`SignupContactFields.svelte:27-68`, `signup/+page.svelte:86`) —
지금 잃는 메시지를 찾은 것은 아니다. 결함은 **안전한 형태가 기본값이 아니라는 것**이다: 새 필드를 스키마에 더하고
페이지에 그리는 것을 잊으면 메시지가 조용히 사라지고, 그것을 막으려고 만든 장치는 호출자가 기억할 때만 돈다.

처방 후보: `fields`를 필수로 하거나(스키마의 `shape` 키에서 기본값을 얻을 수도 있다), 최소한 무인자 형태의
반환형을 스키마 키로 좁힌다. 앞의 것은 호출부 열아홉을 건드린다. **구조만 바뀐다**(메시지 배치가 바뀌는 곳이 생기면 동작 변경).

## LC09-3 🟠 "모든 액션이 이것을 쓴다"는 주석이 사실이 아니고, 어긴 곳이 이 함수가 막으려던 방식으로 깨진다

> **검증 정정**: 🟡 → 🟠, 행 번호 교정, 그리고 **본체의 집계를 이 ID로 옮긴다.**
>
> **실측.** 저장소 밖에 둘 수 없는 임시 vitest(`$lib` 해석 때문에 `src/routes/` 아래, 확인 뒤 삭제)로 `actions.updateProfile`에
> `phone` 파트가 `filename=`을 단 multipart 본문을 넣었다(node 환경 — jsdom의 `File`은 undici가 받지 않아 원시 본문으로 만들었다).
> 결과: 액션이 `TypeError: phone.replace is not a function`으로 **reject**된다. 같은 요청을 **익명**(`locals.member = null`,
> `auth()` → `null`)으로 보내도 똑같이 던진다. 대조군 — 익명 + 문자열 `phone`은 `handleUserAction`이 401을 낸다.
> 즉 이 예외는 **인증보다 먼저** 난다: 폼 읽기와 스키마 입력 조립(571-575행)이 래퍼(577행) 바깥이고, `/`는 공개 존이라
> 가드의 POST 능력 검사도 없다(`+page.server.ts:533` 주석). 액션에서 던진 비-`HttpError`는 Kit이 500으로 낸다.
>
> **등급.** 초판은 "주석이 불변식을 있다고 적은 것"만 이 파일의 몫으로 🟡를 매기고 크래시는 "그 파일 리뷰에서 다룰 것"으로 넘겼다.
> 그러나 `(public)/+page.server.ts`의 리뷰 문서는 이 감사에 **없다**(`files/src/routes/(public)/`가 비어 있다) — 넘긴 곳이 없으니
> 실측된 500이 어디에도 집계되지 않는다. 그리고 크래시는 빌려온 증상이 아니라 **이 항목 자신의 인과 주장**("어긴 곳이 이 함수가
> 막으려던 방식으로 깨진다")이다. 클라이언트 입력이 인증 전에 5xx를 내는 것은 `STATUS-CODES.md`의 `HS-4`(미포획 예외 → 🟠)와
> 같은 부류다. 브라우저 UI가 그 필드에 파일을 싣지 않는다는 것은 도달성이라 감면 근거가 아니다(판정 기준).
> 그래서 🟠로 올리고 **라우트 리뷰가 생기면 이 ID를 참조하고 새로 세지 않는다.**
>
> **행 번호.** `571-574` → 폼 읽기 571행, 스키마 입력 572-575행(문제의 `phone` 캐스트는 **573행**), 래퍼 **577행**(초판 576).
>
> **"유일한 위반자"가 아니다.** 원시 `data.get(…) as string` 캐스트는 도메인 스키마로 검증하는 다른 액션에도 있다 —
> 예: `admin/seminars/+page.server.ts:169,267,291`(`parseIds(data.get("presenterIds") as string)`). 그 결과는 각 라우트 리뷰의 몫이고
> 여기서는 세지 않는다. 다만 4행 주석이 거짓이라는 이 항목의 전제는 한 곳보다 넓다.

4행 "Shared by every action that validates with a domain schema." — `(public)/+page.server.ts:571-574`의 `updateProfile`은
`dashboardProfileInputSchema`로 검증하면서 `formText`를 쓰지 않는다:

```ts
phone: normalizePhoneNumber((data.get("phone") as string | null) ?? ""),
```

`phone` 필드에 **파일**을 실어 보내면 `data.get`이 `File`을 돌려주고 캐스트가 그것을 숨긴다 →
`normalizePhoneNumber`의 `phone.replace`(`utils.ts:34`)가 `TypeError`를 던진다. 이 호출은 `handleUserAction` **바깥**
(571행, 래퍼는 576행)이라 AppError 변환도 받지 못하고 500이 된다. 2-4행이 "instead of actions crashing on `null`"로
막겠다고 한 바로 그 실패의 변형이다(`File` 쪽 — `form-data.test.ts:40`이 `formText`에서 고정한 경우).

결함의 본체는 라우트에 있다(그 파일 리뷰에서 다룰 것). 이 파일의 몫은 **주석이 없는 불변식을 있다고 적은 것** —
읽는 사람이 "스키마 검증 액션은 다 안전하다"고 믿게 만든다. 주석을 "should"로 고치거나, 헬퍼 쪽에서 강제할 방법
(예: 스키마와 키 목록을 받아 읽기·검증을 한 번에 하는 함수)을 둔다. **주석은 구조, 라우트 수정은 동작 변경.**

## 확인했고 지적하지 않은 것

- **`formText`가 누락과 파일을 모두 `""`로 읽는다** — 스키마가 "필수" 메시지를 내게 하려는 의도대로다. 파일 필드를
  문자열로 읽으려는 호출부는 없다(업로드는 별도 경로)
- **`fieldIssues`가 필드마다 첫 메시지만 남긴다(37행 `??=`)** — 문서화된 계약이고 테스트가 고정한다(`form-data.test.ts:13-20`).
  `_form`도 한 칸이라 여러 필드 밖 메시지 중 첫째만 남지만, 한 줄 알림 칸에 맞는 선택이다
- **숫자 경로(배열 스키마 최상위)가 `_form`으로 간다(34행 `typeof head === "string"`)** — 의도된 동작이고,
  줄 번호가 필요한 곳은 `memberRolesIssues`(`members.ts:304-313`)가 따로 한다
- **`IssueSource`를 zod 타입 대신 구조 타입으로 받는다** — zod v3(`schemas/*`)와 v4(`domain/*`) 오류를 모두 받으려는 것으로 보이며,
  필요한 최소 모양만 요구하는 것이 맞다
- **오버로드 구현 시그니처의 `Record<string, string>`** — 외부에 노출되지 않는다

## 검증 (2026-09-28)

- LC09-1 — 확인 (JSDoc 11-16행 바로 다음 선언이 `type IssueSource` 17-19행, 오버로드 21-29행에는 문서가 없다)
- LC09-2 — 확인 (라우트 호출 19곳·도메인 래퍼 5곳을 grep으로 다시 셌다 — 수가 맞다)
- LC09-3 — 정정 (🟡 → 🟠, 실측: 파일 파트 `phone` → 인증 전 `TypeError` → 500, 행 번호 교정)
- 누락 점검: 40줄 전부를 다시 읽었다. `formText`의 `typeof` 판정, `fieldIssues`의 `??=` 첫 메시지 규칙, 숫자 경로의 `_form` 행은
  "지적하지 않은 것"의 판단과 같다. 새로 추가할 지적 없음
