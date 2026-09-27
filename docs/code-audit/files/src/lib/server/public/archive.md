# `src/lib/server/public/archive.ts` (261줄)

**접두사 `LB16-`** · 게스트 면 읽기 접근자 모음(PUB-09~15)과 자산 URL 빌더 `assetUrl`. 살아 있는 호출부는
`assetUrl`·`getPublicMembers`·`getPublicExecutives`·`getPublicSeminar` 넷뿐이다.

## LB16-1 🔴 현 회장단의 전화 공개 거부가 legacy 전화번호로 우회된다

> **검증 재현 (2026-09-28)**: 확인. 메모리 저장소 일회용 vitest(실행 후 삭제)로 재현했다 —
> `legacy-members`에 L1, `legacy-private-info`에 `{memberId: L1, phone: "01099998888"}`(`__putRawDoc`),
> `members`에 `{id: C1, legacyMemberId: L1, roles: [{term: currentTerm(), title: "회장"}]}`,
> `private-info`에 `{memberId: C1, phone: "01011112222", hidePublicPhone: true}`.
> `getPublicExecutives()`의 현 학기 회장 `contact`는 **`"010-9999-8888"`(legacy 번호)** 였다.
> 대조군(같은 설정에서 legacy 행만 없음)은 `null`. 91행 `delete(C1)`은 없는 키를 지우고 98행이 L1로 떨어진다.
> 재가입 행이 `legacyMemberId`를 갖는 경로는 `flow_approve_application`의 신규 분기(`atomic_flows.sql:723-746`)로 확인했다.

86-100행의 맵은 **서로 다른 id 공간**을 한 맵에 섞는다.

```
87-88  legacy-private-info → key = legacy 회원 id (L)
89-92  private-info        → key = 현 회원 id (C);  hidePublicPhone이면 delete(C)
96-98  contactFor(m)       → get(C) ?? get(m.legacyMemberId = L)
```

재가입 회원은 `flow_approve_application`이 `legacyMemberId`를 잇는다(`atomic_flows.sql:746`).
그 회원이 이번 학기 회장/부회장이고 마이페이지에서 **공개 거부**를 켜면
(`(member)/settings/notifications/+page.server.ts:72-75` — `private-info`의 자기 행만 쓴다):

1. 91행 `delete(C)` — C에는 legacy 값이 들어간 적이 없으므로 **아무것도 지우지 않는다**
2. 97행 `get(C)` → `undefined`
3. 98행 `get(L)` → **legacy 전화번호** → 116행에서 게스트에게 공개

91행 주석 "운영 행이 legacy를 덮는다"는 거짓이다 — 덮으려면 C→L 대응을 알아야 하는데 그 대응은
96-98행에만 있다. 그리고 `legacy-private-info`는 앱에서 쓰지 않는 동결 표다(`data/tables.ts:31-44`).
**회원이 legacy 쪽 공개를 끌 방법은 존재하지 않는다.** 거부가 가장 필요한 경로에서만 거부가 무시된다.

이 값은 루트 레이아웃이 **모든 페이지**에 싣는다(`routes/+layout.server.ts:41`).
`archive.test.ts:236-244`의 거부 테스트는 `legacyMemberId: null`인 회원(`:78`)만 본다.

**처방(동작 변경)**: 전화 조회를 회원 단위로 한다 — 현 행이 있으면 그 행의 `hidePublicPhone`이 legacy 폴백까지 막는다.
재가입 + 거부 픽스처 테스트를 먼저 추가할 것.

## LB16-2 🟠 탈퇴를 신청한 현 회장단의 전화번호가 계속 공개된다

> **검증 재현 (2026-09-28)**: 확인. 같은 일회용 테스트에서 `status: "withdrawn"`(유예 중 `withdrawal` 객체 포함)인
> 현 학기 부회장의 `contact`가 `"010-3333-4444"`로 나왔다. `flow_request_withdrawal`이 즉시 `withdrawn`으로
> 바꾸는 것(`atomic_flows.sql:1044-1051`)과 `roles`를 건드리지 않는 것도 확인했다.

`flow_request_withdrawal`은 요청 즉시 `status: "withdrawn"`으로 바꾼다(`atomic_flows.sql:1045`).
`getPublicMembers`(56행)와 프로젝트(`archive/+layout.server.ts:199`)는 그 상태를 거르지만
`getPublicExecutives`는 106-120행 어디서도 `m.status`를 보지 않는다. 116행 조건은 `r.term === term`뿐이다.

C-16 결정("탈퇴자의 과거 이력은 사료")은 **이름**에 관한 것이다. 전화번호는 사료가 아니다 —
동아리를 떠나겠다고 한 사람의 번호가 "현 회장단 연락처"로 유예 기간 내내 모든 페이지 푸터에 나간다.
**처방(동작 변경)**: `contact`에 `m.status !== "withdrawn"` 조건을 더한다. 이름 노출은 그대로 둔다.

## LB16-3 🟠 임원 공개 연락처의 출처가 둘이고, 스펙이 가리키는 쪽은 아무 데도 공개되지 않는다

> **검증 정정**: 인용 행 번호만 고친다. 등급·주장은 그대로다. `API-SPEC.md:371-378`은 HEAD 기준이고, 작업 트리의
> 미커밋 문서 수정으로 해당 줄이 **`API-SPEC.md:416-423`** 으로 밀렸다(§3 "유일한 예외: `members.publicContact`"와
> PUB-01/PUB-05 행). 같은 모델은 `API-SPEC.md:205,868`, `BACKEND-TASKS.md:107`, `IMPLEMENTATION-SPEC.md:431`에도 있다.
> `publicContact`를 읽는 비관리자 코드가 없음(관리자 화면과 `members-admin.ts`뿐)은 전수 검색으로 확인했다.

스펙은 공개 연락처를 **동의 기반 `members.publicContact`** 하나로 정했고, 개인정보 테이블은 공개 응답에
쓰지 않는다고 적는다 — `API-SPEC.md:371-378`, `FUNCTIONAL-SPEC.md:88`, `docs/schema.md:46`,
`SPEC-REVIEW.md:55`(그 필드를 만든 이유가 바로 이 모순의 해소였다).

코드는 70-73행 주석의 운영자 결정(2026-09-01)에 따라 `private-info.phone`을 **옵트아웃**으로 공개한다.
결정 자체는 닫힌 것으로 본다. 결함은 결정이 한쪽에만 착지했다는 것이다:

- `publicContact`는 관리자 화면에서 여전히 편집·표시된다(`admin/members/[id]/+page.server.ts:47-56,106`,
  `admin/members/+page.svelte:28,72` "연락처 granted/unset"). **어떤 공개 면도 그것을 읽지 않는다** —
  관리자가 동의를 받아 입력한 값이 아무 데도 나가지 않는다
- 스펙 다섯 곳과 `domain/executive-roster.ts:19-20`("publicContact is the one sanctioned public field")이
  옛 모델을 설명한다. 파일 머리 주석(9-12행 "no private-info fields")도 같은 옛 문장이다
- `executive-roster.ts`는 `"phone · email"` 결합 문자열을 파싱하는데, 이 함수가 내는 값은 전화 하나뿐이다

구조 문제다. **정리 방향은 결정된 쪽(전화)으로** — `publicContact`의 관리자 UI·스펙·파서를 걷어내거나,
남길 이유가 있으면 그것을 공개 면에 다시 연결한다. 어느 쪽이든 두 출처가 공존하는 지금 상태는 틀렸다.

## LB16-4 🟠 `getPublicSeminar`가 재가입 회원의 발표자 이름을 `"Unknown"`으로 낸다

47-50행 `memberNameMap()`은 `getMemberDirectory()`로 만든다. 그 함수는 **새 행이 가리는 legacy 행을 뺀다**
(`data/directory.ts:23-26`). 그런데 이주분 세미나의 `presenterIds`는 legacy id다(`directory.ts:9-11`
"과거 기록의 memberId는 legacy id를 가리키므로 이름 해석은 반드시 이 병합본으로").
재가입한 발표자의 L은 목록에서 빠졌으므로 169행 `names.get(L)` → `"Unknown"`.

같은 세미나가 **목록에서는 이름으로, 상세에서는 Unknown으로** 나온다 — 아카이브 레이아웃은
`getDirectoryIndex()`로 해석한다(`archive/+layout.server.ts:56-57,92`). `getDirectoryIndex`는 L을
새 행으로 해석하도록 만들어진 함수다(`directory.ts:39`).

`archive/+layout.server.md`의 ZR-9가 "`memberNameMap()`과 일관된다"고 적었는데 **일관되지 않다** —
탈퇴 필터에 대해서는 맞지만 legacy 해석에 대해서는 다르다.
**처방(동작 변경)**: `memberNameMap`을 `getDirectoryIndex` 기반으로. `archive.test.ts`에 legacy 발표자 픽스처가 없다.

## LB16-5 🟠 호출부 없는 접근자 다섯이 살아 있는 경로와 이미 갈라졌다

`getPublicSeminars`(132)·`getPublicStudies`(178)·`getPublicActivities`(200)·`getPublicGallery`(214)·
`getPublicProjects`(252)는 **테스트만** 부른다(`archive.test.ts:196-203`, `cancelled-visibility.test.ts:104-117,196`,
`publish-cancel-race.test.ts:106,127`). 게스트에게 나가는 것은 `archive/+layout.server.ts`의 스냅숏이다.
ZR-8 수정이 "`public/archive.ts` 파일 리뷰에서 한 번에 처리한다"고 이 파일로 넘긴 항목이다
(`archive/+layout.server.md:63-65`).

사본은 이미 드리프트했다 — 죽은 코드가 틀린 규칙을 보존하고 있다:

| 규칙            | 살아 있는 경로 (레이아웃)                | 여기                                               |
| --------------- | ---------------------------------------- | -------------------------------------------------- |
| 학기 정렬 (W-7) | `compareSemesters` (`:113,141`)          | `localeCompare` (140·184행) — `26-S`를 `26-2` 위로 |
| 이름 해석 (S9)  | `getDirectoryIndex`                      | `getMemberDirectory` (LB16-4)                      |
| 갤러리 모양     | `thumbnailUrl`·`displayUrl`·`date`·`alt` | `{kind,title,url}`                                 |
| 세미나 설명     | `description \|\| note` (`:122`)         | `note`만(145행), 설명 없음                         |

그리고 **테스트 신뢰가 엉뚱한 곳에 쌓인다.** `cancelled-visibility.test.ts:100-142`는 접근자 셋과 레이아웃을
**둘 다** 단언한다. 접근자 단언은 게스트가 받는 것을 증명하지 않는데 초록색으로 보인다 —
ZR-8이 막으려던 "감시하는 코드와 내보내는 코드가 다르다"의 잔여분이다.

REGISTER B-2의 조건("폐기하려면 계약을 레이아웃이 이어받아야 한다")은 거의 충족됐다 —
`snapshot.test.ts:213-233`이 금지 키·불투명 id·탈퇴 필터를, `cancelled-visibility.test.ts:124-142`가
취소·미공개 필터를 이미 **렌더 경로에서** 본다. 남은 단언(활동에 참석자 없음 `archive.test.ts:261-268`)을
옮기고 다섯을 지운다. **동작 변화 없음.**

## LB16-6 🟡 세미나 상세의 공개 투영이 세 곳에 나뉘어 있고, 목록과 상세가 다른 설명을 보인다

153-175행이 투영의 일부만 돌려주므로 호출 페이지(`archive/seminars/[id]/+page.server.ts:16-29`)가
**같은 행을 찾으려고** `seminars`를 다시 읽고 `seminar-requests`·`activities`까지 읽는다.
그 결과 "세미나 설명"의 우선순위가 세 가지다:

```
여기 168행                     description
상세 페이지 :36                 description || request.description || note
아카이브 레이아웃 :122          description || note
```

설명이 비고 신청 설명이 있는 세미나는 **목록과 상세에서 다른 문장**을 보인다.
통합하면 동작이 바뀐다(어느 규칙이 맞는지는 한 줄 결정). 투영의 소유자를 하나로 두면 재읽기도 사라진다.

## LB16-7 🟡 `getPublicExecutives`가 두 소비자의 서로 다른 필요를 한 페이로드로 낸다

- "현재"의 정의가 둘이다: 연락처는 `currentTerm()`(78·116행)으로, 푸터는 정렬된 목록의 `[0]`
  (`domain/executive-roster.ts:26`)으로 현 회장단을 고른다. 다음 학기 직책을 미리 넣으면 푸터는
  **연락처 없는 다음 학기**를 현 회장단으로 보이고, 이번 학기 직책이 아직 없으면 **지난 학기**를 보인다
- 루트 레이아웃은 `[0]`만 쓰는데 역대 전체를 **모든 페이지** 페이로드에 싣는다(`+layout.server.ts:41`)

구조 제안: 현 학기 조회와 역대 목록을 나눈다. 앞의 것은 동작 변경이다.

## LB16-8 🟡 `assetUrl`이 "public" 모듈에 산다

30-45행은 모든 자산 키의 URL 빌더다. 관리자 뷰가 이것을 쓰려고 공개 모듈을 import한다
(`data/admin-queue-views.ts:10,94` — 심사 중인 신청의 포스터, 즉 `admin` 판정 자산).
`/media` 경로·`ASSETS_ACCESS` 탈출구는 `asset-access.ts`·`media/[...key]/+server.ts`와 한 짝인데
짝이 다른 디렉터리에 있다. 구조만.

## LB16-9 🟡 주석이 코드와 어긋난다

> **검증 정정**: 인용 행 번호만. `API-SPEC.md:385`(HEAD)는 작업 트리에서 **`:430`** (PUB-15 "name·department·joinedAt·roles")이다.

- 67-68행 "부장 등은 관리자 화면에만" — `getPublicMembers`(61행)가 모든 직책을 게스트에게 낸다
  (`(public)/members/+page.svelte:82-83`이 칩으로 그린다). 스펙은 명단의 직책 공개를 허용하므로
  (`API-SPEC.md:385`) 틀린 것은 주석이다
- 66-74행 JSDoc이 함수가 아니라 상수 `PUBLIC_EXECUTIVE_ORDER`에 붙어 있다
- 122행 `title as "회장"` — `indexOf`의 타입을 맞추려는 단언이고 실제 값은 `"부회장"`일 수 있다.
  `(PUBLIC_EXECUTIVE_ORDER as readonly string[]).indexOf(title)`(108행과 같은 형태)이면 거짓말이 없다

## LB16-10 🟡 (검증 추가) `assetUrl`이 키를 인코딩하지 않아 `/media` 라우트와 왕복하지 않는다

32행 `` `/media/${s3Key}` ``(와 44행 CDN 모드)는 키를 **그대로** 이어 붙인다. 받는 쪽 `media/[...key]/+server.ts:45`의
`params.key`는 SvelteKit이 `decodeURIComponent`로 푼 값이다(`@sveltejs/kit/src/utils/url.js` `decode_params`).
그러므로 "키 → URL → `params.key`"가 항등이 아니다:

- 키에 `%xx`가 있으면 풀린 문자열로 도착해 `resolveAssetAccess`의 정확 일치에서 `none` → 404
- `#`·`?`가 있으면 그 뒤가 경로에서 잘려 나가 다른(없는) 키로 판정된다

실패 방향은 닫힘(404)이라 누출은 없다. 그러나 URL 빌더의 계약은 "이 URL로 요청하면 이 키가 도착한다"이고,
그 계약은 키의 알파벳에 기대어서만 성립한다. 지금의 생산자 둘(`services/uploads.ts:64-78` `slugifyFilename`,
`scripts/migration/lib.ts:309-318` `slugify`)이 `[a-z0-9가-힣-]`만 남기기 때문에 드러나지 않을 뿐이고,
스키마는 `z.string()`이라 그것을 요구하지 않는다(README 판정 기준 — 데이터의 성질이지 코드의 성질이 아니다).
**처방(동작 변경 없음 — 현재 키에 대해)**: 세그먼트별 `encodeURIComponent` 후 `/`로 잇는다.

## 확인했고 지적하지 않은 것

- **`assetUrl`의 기본 모드** — `ASSETS_ACCESS`가 `"public"`이 아니면 무엇이든(오타 포함) 앱 경로다.
  실패 방향이 닫힘 쪽이다. CDN 미설정 시 빈 문자열(W-8)과 1회 경고도 의도대로다(`asset-url.test.ts`)
- **임원 목록의 학기 정렬(124행)** — 직책의 `term`은 `Term`(`YY-1|2`만, `schemas/common.ts:15`)이라
  `localeCompare`가 맞다. LB16-5의 `Semester` 정렬과는 다르다
- **탈퇴 회원의 이름이 임원 이력에 남는 것** — C-16 결정(사료). LB16-2는 전화번호만 다룬다
- **재가입 회원의 과거 직책** — 승인 흐름이 legacy `roles`를 새 행으로 복사한다(`atomic_flows.sql:742`).
  `getMemberDirectory`가 L 행을 가려도 이력은 사라지지 않는다
- **`getPublicSeminar`의 공개 필터(160행)** — 목록과 같은 규칙이고 미공개·취소분은 id를 알아도 `null`.
  이 판정식의 사본 문제는 `visibility.ts` 문서 LB21-1에서 다룬다
- **`private-info`를 공개 함수가 읽는 것** — 운영자 결정의 직접 귀결이고 출력은 전화 한 필드로 제한된다.
  문제는 그 제한이 새는 두 경로(LB16-1·LB16-2)다
- **`getPublicProjects`의 `project!`** — 255행 필터 직후라 단언이 참이다(죽은 코드이기도 하다, LB16-5)

## 검증 (2026-09-28)

- LB16-1 — 확인 (일회용 테스트로 재현: 거부한 재가입 회장의 legacy 번호가 공개됨, 대조군 `null`)
- LB16-2 — 확인 (같은 테스트로 재현)
- LB16-3 — 정정 (인용 행 번호만: `API-SPEC.md:371-378` → 작업 트리 `:416-423`. 등급 유지)
- LB16-4 — 확인 (`getMemberDirectory`가 가려진 L 행을 빼고, 상세 페이지 `[id]/+page.server.ts:10`이 그 이름을 그대로 쓴다)
- LB16-5 — 확인 (다섯 접근자의 비테스트 호출부 없음, `"26-S".localeCompare("26-2") === 1`로 W-7 역전 확인)
- LB16-6 — 확인
- LB16-7 — 확인
- LB16-8 — 확인
- LB16-9 — 정정 (인용 행 번호만: `API-SPEC.md:385` → `:430`)
- LB16-10 — 추가 (🟡 `assetUrl`의 비인코딩 ↔ 라우트의 디코딩)
- 누락 점검: 파일 전체를 문서 없이 다시 읽었다. 전화 조회의 다른 변형(현 행 `phone`이 빈 문자열이고 거부하지 않은 재가입 회원 → legacy 번호로 폴백)은 "운영 우선, 없으면 legacy"의 명시된 의도라 결함으로 보지 않았다. 탈퇴 후 익명화가 `legacy-private-info`를 남겨 LB16-1 경로가 계속 열리는지도 보았으나 자동 익명화는 보류 상태다(`withdrawal.ts:9`). `assetUrl`을 `/media` 라우트와 맞대어 읽다가 LB16-10을 추가했다.
