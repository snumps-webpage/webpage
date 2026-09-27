# `src/lib/domain/members.ts` (313줄)

**접두사 `LC11-`** · 회원 관리의 브라우저 안전 타입(관리자 목록·상세, 공개 회장단)과 `/admin/members/[id]` 액션의 입력 규칙 전부
— 기록·지위·관리자 권한·동문 박탈·개인정보·직책·공개 연락처, 그리고 `publicContact` 결합/분해.
짝 테스트 `members.test.ts`(115줄)를 규칙의 일부로 읽었다. 액션 쪽 테스트 `admin/members/[id]/member-actions.test.ts`도 함께 봤다.

## LC11-1 🟠 `"phone · email"` 형식에 해석기가 셋이고 서로 다르게 읽는다

> **검증 정정**: 주장을 좁힌다. 등급은 유지한다.
>
> 1. **저장값 `members.publicContact`를 읽는 해석기는 둘이다** — 로드(`:49-51`)와 `splitPublicContact`. 표의 셋째 행
>    `executive-roster.ts:32-37`은 같은 _형식_ 을 가정하지만 이 필드를 받지 않는다 — 그 함수의 입력은 `private-info.phone`으로 만든
>    전화번호 하나다(`archive.ts:95-100`). 이 문서의 `LC11-9`와 `LC08-2`·`LB16-3`이 바로 그 사실을 적는다. "읽는 곳마다 따로
>    쪼갠다"의 셋째는 죽은 파서이지 이 저장값의 독자가 아니다. 아래 1-4의 충돌 경로는 앞의 둘만으로 성립하므로 결론은 그대로다.
> 2. **실측.** 임시 vitest로 실제 `load` → 기록 폼이 싣는 숨은 값 → `?/updateMember`를 돌렸다.
>    `publicContact: "github.com/dev-regular"`(시드 값) → 로드가 `phone = "github.com/dev-regular"`, `email = ""` → 숨은 값
>    `"github.com/dev-regular · "` → 400 `{phone, email}`, 이름은 저장되지 않았다.
>    **더 날카로운 경우도 확인했다**: `"010-1111-2222·a@b.co"`(공백 없는 가운뎃점) — `splitPublicContact` **혼자서는 받는** 값인데,
>    로드가 `" · "`로 못 쪼개 전부를 `phone`에 넣고 숨은 값이 `"010-1111-2222·a@b.co · "`가 되어 400 `{email}`로 막힌다.
>    두 해석기의 불일치 자체가 원인이라는 것을 이 경우가 보여 준다.
> 3. 4번의 "오류는 연락처 칸에 뜬다"는 정확히는 **기록 폼 안의 "공개 연락처: …" 한 줄**이다(`MemberRecordSections.svelte:222-224`).

저장값 `members.publicContact`는 제약 없는 `z.string().nullable()`이다(`schemas/member.ts:35`). 그 문자열의 형식은
어느 한 함수가 소유하지 않고, 읽는 곳마다 따로 쪼갠다:

| 해석기                                                   | 구분자                       | 전화/이메일 판정 |
| -------------------------------------------------------- | ---------------------------- | ---------------- |
| 여기 `splitPublicContact` 263-269행                      | **첫** `·` (공백 무관)       | 위치 (앞=전화)   |
| `admin/members/[id]/+page.server.ts:49-51` (관리자 로드) | `" · "` (**양옆 공백 필수**) | 위치             |
| `executive-roster.ts:32-37`                              | **모든** `·`                 | `@` 포함 여부    |

결합기도 셋이다 — 여기 `joinPublicContact` 272-278행, `admin/members/[id]/+page.svelte:337`, `MemberRecordSections.svelte:155`.

어긋남이 실제로 부딪히는 경로: `?/updateMember`는 **기록(이름·학과·가입일·프로젝트)과 공개 연락처를 한 액션에서 함께 검증**한다
(`+page.server.ts:108-123`). 기록 폼은 연락처를 건드리지 않아도 로드가 쪼갠 값을 다시 붙여 보낸다(`MemberRecordSections.svelte:149-157`
주석 "rides along unchanged"). 그래서 저장값이 `" · "` 형식이 아니면:

1. 로드(`:49-51`)가 `" · "`로 못 쪼갬 → 문자열 전체가 `phone`, `email = ""`
2. 기록 폼이 `"<전체> · "`를 보냄
3. `splitPublicContact`가 첫 `·`에서 쪼갬 → 전화/이메일 검증 실패
4. **관리자가 이름 하나를 고치려 해도 저장되지 않는다** — 오류는 연락처 칸에 뜬다

개발 시드가 바로 그런 값을 넣는다 — `scripts/seed-dev.ts:97` `publicContact: "github.com/dev-regular"`.
저장 스키마가 형식을 강제하지 않으니 이관·수동 수정·과거 코드가 남긴 값이 이 경로를 탄다.

처방: 형식의 소유자를 이 파일 하나로 — 로드도 `splitPublicContact`를 쓰고, 결합은 `joinPublicContact`만(두 `.svelte`는
분해된 값을 보내고 서버가 결합). 기록과 연락처를 다른 액션으로 나누면 4번의 결합 자체가 사라진다.
앞의 것은 **구조만**, 뒤의 것은 **동작 변경**. `LB16-3`(이 필드를 아무 공개 면도 읽지 않는다)의 결정에 따라 필드째 걷어낸다면 이 항목도 함께 사라진다.

## LC11-2 🟠 도메인 타입이 저장소가 표현할 수 없는 "철회" 상태를 약속하고, 로드가 그 값을 지어낸다

32-46행 `PublicContactState`는 `granted`/`revoked` 두 상태에 각각 `changedAt`·`changedBy`를 요구하고,
59행은 목록 항목에 `"granted" | "revoked" | "unset"`을 요구한다. 저장소는 **nullable 문자열 하나**다(`member.ts:35`).
철회 시각·철회자는 저장되지 않고, "철회"와 "미설정"은 둘 다 `null`이다.

그 간극을 호출부가 메운다:

- `admin/members/[id]/+page.server.ts:56-63` — `changedAt: member.statusChangedAt`(**회원 지위** 변경 시각이다), `changedBy: ""`.
  아무도 읽지 않는 값을 타입을 맞추려고 지어낸다
- 같은 파일 `:65-66`과 `admin/members/+page.server.ts:25-26` — `(… ? "granted" : "unset") as "granted" | "revoked" | "unset"`.
  같은 캐스트가 두 라우트에 있고 `"revoked"`는 **만들어지지 않는다**. 목록의 "철회" 라벨(`admin/members/+page.svelte:29`)은 죽어 있다
- 264행 `splitPublicContact("")`는 `revoked`를 내고 `joinPublicContact`(275-277행)는 그것을 `null`로 저장한다 →
  다시 읽으면 **"미설정"**이다. 관리자가 철회한 연락처가 목록에서 "연락처 미설정"으로 보인다

타입이 저장소보다 많은 것을 약속하면 호출부가 거짓 값을 채운다. 처방은 둘 중 하나 — 타입을 저장소에 맞춰
`granted | null`로 줄이거나(**구조만**), 철회를 정말 구분해야 한다면 저장소에 기록한다(**동작 변경**, 스키마 변경).
LC11-1과 같은 이유로, `LB16-3`의 정리 방향이 정해지면 그쪽이 먼저다.

## LC11-3 🟠 가입일이 없는 회원은 기록을 저장할 수 없다

> **검증 정정**: 결론(가입일 `null`인 회원은 UI로 기록도 공개 연락처도 저장할 수 없다)은 유지하고 **등급도 유지**한다.
> 근거 두 가지가 틀렸고, 고치면 결과는 초판보다 오히려 막혀 있다.
>
> 1. **첫 불릿의 메커니즘이 틀렸다.** 가입일이 `null`이면 기록 폼은 **그려지지 않는다** — `MemberRecordSections.svelte:143`
>    `{#if member.joinedAt}`, 대신 232-233행 "가입 정보 레코드가 없어 수정할 수 없습니다." 이름·학과·프로젝트를 고치려다
>    "가입일을 확인해 주세요."로 거부되는 일은 UI에서 일어나지 않는다(직접 POST에서만). 그리고 가입일을 입력할 칸이
>    **어디에도 없다** — 기록 폼이 숨고, 연락처 폼은 `joinedAt`을 숨은 필드 `""`로만 싣는다(`+page.svelte:320`).
>    초판의 "관리자가 알지 못하는 가입일을 지어내야 한다"는 그 탈출구조차 UI에 없다는 뜻이 된다 — 막다른 길이다.
> 2. **"이관은 … `null`을 쓴다"는 운영 `members`에 대한 근거가 아니다.** `20-export-tables.ts:270`의 행은 S9 이후
>    `legacy-members`로 간다(같은 파일 596-604행 `S9_TARGET`). 운영 행은 승인 흐름이 만들며
>    `coalesce(legacy joinedAt, today)`로 채운다(`atomic_flows.sql:736`). 그러나 판정 기준상 "지금 데이터에 없다"는 감면 근거가
>    아니다 — 저장 스키마가 `DateOnly.nullable()`로 `null`을 정상 상태로 선언하고(`member.ts:25`), UI(143·232행)가 그 상태를
>    분기로 다루며, 스펙의 익명화 계약이 `joinedAt`을 `null`로 만든다(`API-SPEC.md:528`, 현재 보류). 저장소·UI·스펙이 모두
>    `null`을 인정하는데 단 하나의 쓰기 입구만 거부한다는 모순은 그대로다.
> 3. **실측.** 임시 vitest: `joinedAt: null`인 회원에게 연락처 폼과 같은 필드(`joinedAt: ""`, 유효한 연락처)로 `?/updateMember` →
>    400 `{joinedAt: "가입일을 확인해 주세요."}`. 페이지는 이것을 연락처 폼의 `_form`으로 옮긴다(`+page.svelte:82-95`).
>
> **보류된 사용자 질문과의 관계**: 2026-09-27 장기 작업의 결정 대기 목록 #3(저장소 밖 작업 메모, 최종 질의로 이월됨 — "가입일 없는
> 회원은 공개 연락처를 저장할 수 없다 … 승인이 항상 채우므로 그런 회원은 없을 것 … 빈 가입일을 허용할까?")이 바로 이 항목이다.
> 그 질문의 근거 "없을 것"은 데이터 상태라 이 항목의 감면 근거가 되지 않는다.
> 결정이 "빈 가입일 허용"으로 나면 처방은 초판대로(빈 값 → `null` 유지) + 기록 폼의 143행 분기 재검토다.

115-121행 `joinedAt`은 `YYYY-MM-DD` 필수다. 저장소는 `DateOnly.nullable()`(`member.ts:25`)이고, 이관은 가입 기록이 없는 회원에게
`null`을 쓴다(`scripts/migration/20-export-tables.ts:270`). `?/updateMember`는 매번 `joinedAt`을 보낸다 —
기록 폼은 `joinedAt ?? ""`로 초기화하고(`MemberRecordSections.svelte:37,184-185`), 연락처 폼도 숨은 필드로 보낸다
(`admin/members/[id]/+page.svelte:320`). 그래서 가입일이 `null`인 회원은:

- 이름·학과·프로젝트를 고칠 때 "가입일을 확인해 주세요."로 거부된다
- **공개 연락처만 바꿀 때도** 같은 이유로 거부된다

관리자가 저장하려면 **알지 못하는 가입일을 지어내야** 한다. 액션 테스트가 이 거부를 고정한다
(`member-actions.test.ts:163` `["joinedAt", { joinedAt: "" }]`) — 테스트는 "빈 값 거부"를 규칙으로 적었지만
저장소와 이관이 `null`을 정상 상태로 만든다는 사실과는 맞춰 보지 않았다.

같은 파일이 이 문제를 알고 있다: 196-205행 `privateInfoUpdateSchema`는 "Legacy rows may hold no email or phone"이라며
`blankAsMissing`으로 빈 값을 "저장값 유지"로 읽는다. `joinedAt`만 그 처리를 받지 못했다.
처방: 빈 `joinedAt` → `null`(또는 유지). **동작 변경**(지금 거부하는 입력을 받는다) + 테스트 163행 수정.

## LC11-4 🟠 전화번호·배경지식 규칙이 세 모듈에 따로 있다

> **검증 정정**: 호출부 목록만 고친다. 등급·주장은 그대로다. 대시보드 정규화 행은 `(public)/+page.server.ts:572` → **`:573`**.
> 정규화 호출부는 넷이 아니라 **다섯**이다 — 관리자 쪽에 `admin/members/[id]/+page.server.ts:114`(공개 연락처의 전화 반쪽,
> `grantedPublicContactSchema`가 같은 `phoneSchema`를 쓴다, 241행)가 하나 더 있다. 이 항목이 `LC07-5`·`LC10-1`의 집계를 받는다.

같은 두 저장 필드 `private-info.phone`/`background`를 세 입구가 쓴다. 가입 신청서는 승인 시 그대로 복사된다
(`atomic_flows.sql:715,717,759,761`).

| 입구          | 규칙                                                       | 호출부 정규화                                                 |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| 관리자 (여기) | `phoneSchema` 89-94행 · `background` 181-184행             | `admin/members/[id]/+page.server.ts:191`                      |
| 회원 본인     | `dashboard.ts:61-68` — 정규식·문구를 **글자까지 복사**     | `(public)/+page.server.ts:572`                                |
| 가입 신청     | `membership-applications.ts:5-15` — `trim` 없음, 다른 문구 | `signup/+page.server.ts:75`, `signup/edit/+page.server.ts:49` |

- 정규식 `/^010-\d{4}-\d{4}$/` 세 번, 상한 `2000`과 문구 "배경지식은 2,000자 이하로…" 세 번
- `phoneSchema`라는 이름이 여기 이미 있는데 `dashboard.ts`가 다시 썼다
- "010-XXXX-XXXX로 정규화한 뒤 검증"이라는 규칙의 절반(`normalizePhoneNumber`)은 스키마 밖, 호출부 넷에 있다

`011`·`070` 허용, 상한 변경, 문구 수정 — 어느 것이든 세 파일 + 정규화 호출부 넷을 함께 고쳐야 하고, 하나를 놓치면
**가입 때 받은 번호를 회원이 대시보드에서 저장하지 못하는**(또는 반대) 상태가 된다.
처방: 브라우저 안전한 `phoneInput`(정규화 `preprocess` 포함)과 `backgroundInput`을 한 곳(예: 이 파일 또는 공용 `domain` 모듈)에 두고
세 스키마가 가져다 쓴다. **구조만 바뀐다**(문구 통일은 동작 변경).

## LC11-5 🟡 가입일 검사가 존재하지 않는 날짜를 통과시킨다

118-121행의 `refine`은 불가능한 날짜를 거르려는 것이지만 `Date.parse`는 **일(日)이 31 이하이기만 하면 넘겨 버린다**(V8):

```
Date.parse("2026-02-31T00:00:00Z") → 1772496000000  (3월 3일)
Date.parse("2026-04-31T00:00:00Z") → 1777593600000  (5월 1일)
Date.parse("2026-13-01T00:00:00Z") → NaN
```

`"2026-02-31"`은 검사를 통과해 문자열 그대로 저장되고(`DateOnly`도 정규식뿐, `schemas/common.ts:10`),
상세 화면은 `new Date(member.joinedAt)`으로 **3월 3일**을 그린다(`admin/members/[id]/+page.svelte:181-182`).
검사가 잡는 것은 월 13·00과 일 32 이상뿐이다. 액션 테스트도 `"2024-13-45"`(`member-actions.test.ts:164`)만 본다.
처방: 파싱 결과를 다시 `YYYY-MM-DD`로 만들어 입력과 같은지 비교. **동작 변경**(지금 받는 입력을 거부).

## LC11-6 🟡 회원 지위 집합이 다섯 번 적혀 있다

> **검증 정정**: 독립 사본은 **넷**이다. 18행 `Exclude<MemberStatus, "withdrawn">`은 3행에서 **파생**되므로 지위를 더하면
> 저절로 따라온다 — 고칠 곳이 아니다. 고칠 곳은 3행·154행·`member.ts:4`·`member.ts:16`. 등급·처방은 그대로다.

| 위치                                 | 값                                                         |
| ------------------------------------ | ---------------------------------------------------------- |
| 여기 3행 `MEMBER_STATUSES`           | associate · regular · withdrawn                            |
| 여기 18행 `Exclude<…, "withdrawn">`  | 탈퇴 전 지위                                               |
| 여기 154행 `memberStatusInputSchema` | `["associate", "regular"]` — 3행에서 파생하지 않고 다시 씀 |
| `schemas/member.ts:4`                | associate · regular · withdrawn                            |
| `schemas/member.ts:16`               | `["associate", "regular"]`                                 |

지위를 하나 더하면(예: 명예회원) 다섯 곳을 고쳐야 한다. `MEMBER_STATUSES`는 export되지만 **이 파일 밖에서 아무도 쓰지 않는다**(grep) —
원천 노릇을 하지 못하는 원천이다. 반대 방향의 선례가 이미 있다: `schemas/seminar-request.ts:12-13`은 선택지의 단일 소스를
`domain`에 두고 서버 스키마가 재수출한다. 같은 방식으로 `member.ts`가 이 상수를 가져다 쓰고, 154행이 3행에서 파생하면 된다.
**구조만 바뀐다.**

## LC11-7 🟡 쓰이지 않는 export를 테스트가 고정하고, 쓰이는 쪽은 고정하지 않는다

> **검증 정정**: 둘째 불릿을 좁힌다. `privateInfoInputSchema`는 죽은 코드가 아니다 — `privateInfoUpdateSchema`가 그 `shape`에서
> 세 필드를 **그대로 가져온다**(202-204행). 따라서 `members.test.ts:90-103`의 "SNU 이메일만" 검사는 실제 경로가 쓰는
> **같은 `email` refine**을 고정한다. 남는 사실은 (a) 객체째 export가 테스트 밖에서 쓰이지 않는다는 것과 (b) 실제 경로의
> `blankAsMissing` 래핑이 이 파일의 테스트에 없다는 것뿐이다. `parseRolesJson` 불릿은 그대로다(호출부 테스트뿐, grep 확인). 등급 유지.

- `parseRolesJson`(280-286행) — 호출부는 테스트뿐이다(`members.test.ts:50-52`). 라우트는 `parseRoleLines`(289-301행)를 쓴다.
  `b39ec62`(프런트엔드 재구축)에서 들어왔고(`git log -S`), 지금 폼의 형식은 줄 단위다(288행 주석, `+page.server.ts:163`)
- `privateInfoInputSchema`(174-185행) — 라우트는 쓰지 않고 `privateInfoUpdateSchema`(201-205행)만 쓴다. 그런데
  `members.test.ts:90-103`의 "SNU 이메일만" 검사는 **안 쓰이는 쪽**에 걸려 있다. 실제 경로의 `blankAsMissing` 래핑
  (빈 값 → 유지, 입력값 → 전체 규칙)은 이 파일의 테스트가 확인하지 않는다
- `MEMBER_STATUSES`(3행) — LC11-6

테스트가 죽은 코드를 살아 있는 것처럼 보이게 하고, 살아 있는 코드의 규칙은 비워 둔다.
`parseRolesJson` 삭제 + 테스트를 `privateInfoUpdateSchema`로 옮김. **구조만 바뀐다.**

## LC11-8 🟡 직책 학기 정규식이 `TERM_PATTERN`의 사본이다

208-213행 — 주석 스스로 "Mirrors TERM_PATTERN"이라고 적는다. 핀은 `members.test.ts:20-24`의 `26-W` 한 값뿐이고
`TERM_PATTERN`과 직접 대조하지 않는다. **`LA06-1`**(`core/semester.md`)이 이 행을 포함한 여섯 사본을 이미 지적했다 —
처방(정규식을 `domain/term.ts`로)도 그쪽을 따른다. 이 문서에서는 새로 세지 않는다.

같은 `member.roles`에 대한 이 파일의 규칙(중복·30개 상한·길이 40)과 `/admin/executives` 쪽 규칙의 불일치는 **`LB22-3`**이 다룬다.

## LC11-9 🟡 주석이 코드와 어긋난다

- 83-87행 "The /admin/members/[id] actions validate with these and answer {…, issues: fieldIssues(…), values}" —
  `?/setRoles`는 `memberRolesIssues`(303-313행)로 답한다(`+page.server.ts:167`). 나머지는 맞다
- 258-260행 "joined as "phone · email" (**executive-roster.ts**)" — 결합 규칙의 거처로 가리킨 파일은 이 문자열을 받지 않는다.
  그 파일이 받는 것은 `private-info`의 전화번호다(`LC08-2`, `LB16-3`). 형식의 실제 소유자는 이 파일의 272-278행이다

## 확인했고 지적하지 않은 것

- **`projectUrl`의 `http(s)`만 허용(126-135행)** — 공개 링크로 그려지므로 `javascript:` 차단이 맞다. `URL.canParse`는 서버에서만 불린다
- **프로젝트 제목 없이 URL만 준 경우 거부(137-145행)** — 저장 모양(`project: {title, url?} | null`, `member.ts:36-38`)과 맞는다.
  `transform`이 입력 두 필드를 저장 모양으로 바꾸는 위치도 적절하다
- **`memberAdminInputSchema`가 `"true"`/`"false"` 외를 거부(159-164행)** — 잘못된 값을 권한 해제로 읽지 않는 fail-closed다
- **`memberStatusInputSchema`가 `withdrawn`을 받지 않는다** — 탈퇴는 별도 흐름(`flow_request_withdrawal`)이다. 값 목록의 중복은 LC11-6
- **`alumniRevocationInputSchema`의 4자 하한** — 감사 사유를 강제하는 운영 규칙이고 테스트가 고정한다(`members.test.ts:106-114`)
- **`privateInfoInputSchema`의 SNU 도메인 검사에 `toLowerCase`(177행)** — 로그인 키의 대소문자 무시와 맞다
- **`emailSchema`가 `trim` → `max` → `z.email` 순** — 붙여넣은 공백을 형식 오류로 만들지 않는다(96행 주석대로)
- **`publicContactInputSchema`의 이메일에 SNU 제한이 없다** — 공개 연락처는 로그인 키가 아니다
- **`parseRoleLines`의 첫 공백 분할(295-298행)** — 직책명에 공백이 있어도 된다. `\r\n` 입력은 `trim`이 `\r`를 지운다
- **`memberRolesIssues`가 첫 오류만 낸다(305행)** — 한 칸짜리 폼에 한 줄. 줄 번호를 붙이는 것이 이 함수의 존재 이유이고 맞게 한다
- **관리자 목록·상세 타입(48-67행)이 페이지 계약으로 남아 있다** — `487a8fb`가 지운 부류와 달리 `MemberRecordSections.svelte:20`의
  prop 타입으로 쓰여 `svelte-check`가 로드 반환과 대조한다. 강제되는 계약이다(단 LC11-2의 필드는 거짓 값으로 채워진다)
- **`"회장" | "부회장"`(72행)** — `LB22-4`가 이미 지적했다

## 검증 (2026-09-28)

- LC11-1 — 정정 (저장값의 해석기는 둘, 셋째는 죽은 파서. 실측으로 이름 저장 차단 재현 — 공백 없는 `·` 값에서도. 등급 유지)
- LC11-2 — 확인 (`changedAt`·`changedBy`를 읽는 `.svelte`가 없음을 grep으로 확인, `"revoked"`를 만드는 코드 없음)
- LC11-3 — 정정 (기록 폼은 거부가 아니라 **미표시**, 이관 근거는 `legacy-members`. 실측으로 연락처 저장 거부 재현. 등급 유지 — 결정 대기 #3과 같은 항목)
- LC11-4 — 정정 (정규화 호출부 넷 → 다섯, 행 번호. `LC07-5`·`LC10-1`의 집계를 받음)
- LC11-5 — 확인. 실측: `?/updateMember`에 `joinedAt: "2026-02-31"` → `{success: true}`, 저장값 `"2026-02-31"` 그대로.
  Node(V8)에서 `Date.parse("2026-02-31T00:00:00Z")`는 3월 3일, `"2026-06-31…"`도 통과. 참고로 같은 도메인 계층의
  `term.ts:36` `termOfDateString`이 이미 "파싱 결과를 다시 `YYYY-MM-DD`로 만들어 비교"하는 처방 그대로를 구현해 두었다
  (일 `00`·월 `00`도 `Date.parse`가 `NaN`을 내므로 초판의 "월 13·00과 일 32 이상뿐"에 일 `00`을 더해야 정확하다 — 결론 불변)
- LC11-6 — 정정 (독립 사본 다섯 → 넷, 18행은 파생)
- LC11-7 — 정정 (`privateInfoInputSchema`는 `privateInfoUpdateSchema`의 shape 원천이라 죽지 않았다 — 둘째 불릿 축소, 등급 유지)
- LC11-8 — 확인 (`LA06-1`로 집계, 이 문서에서 세지 않음 — 초판 처리 그대로)
- LC11-9 — 확인
- 누락 점검: 313줄 전부를 틀 없이 다시 읽고 두 관리자 라우트·`MemberRecordSections`·`+page.svelte`의 폼과 대조했다.
  `joinPublicContact` ↔ `splitPublicContact` 왕복(정규화된 전화·`z.email`을 통과한 이메일에는 `·`가 들어갈 수 없다),
  `parseRoleLines`·`memberRolesIssues`의 배열 수준 오류 경로, `blankAsMissing`의 비문자열 통과를 확인했다. 새로 추가할 지적 없음
