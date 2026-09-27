# `src/lib/server/services/executives-admin.ts` (184줄)

**접두사 `LB22-`** · `/admin/executives` 서비스 — 학기별 임원 배정(저장은 `member.roles`, 쓰기는 `setRoles`에 위임)과 직위 옵션(코드 기본값 + `role-titles` 테이블).

## LB22-1 🟠 배정·해제가 캐시된 읽기로 계산한 배열로 회원의 직책 전체를 덮어쓴다

151-153행과 173-175행이 회원을 `getTable("members")`로 읽는다. 이 읽기는 캐시를 탄다(`tables.ts:168-177`) —
쓴 인스턴스는 무효화되지만 다른 웜 인스턴스는 최대 15초 전 행을 본다(`cache.ts:51`, `tables.ts:31-35` 주석).
그 행으로 **새 배열 전체**를 만들어(163행 `[...member.roles, { term, title }]`, 177-179행 `filter`)
`setRoles`에 넘기고, `setRoles`는 받은 배열로 통째로 바꾼다(`members-admin.ts:91` `({ ...m, roles })`).

`mutate`의 CAS는 문서 버전을 지키지만 **이 함수의 결정은 CAS 밖에서 이미 내려졌다.** 결과:

- 두 관리자가 같은 회원에게 동시에 배정하면 둘째 배열에 첫째의 추가가 없다 — 첫 배정이 조용히 사라지고,
  감사 로그(`member.set-roles`)에는 둘 다 성공으로 남는다.
- 동시성이 없어도 된다. 인스턴스 A에서 `/admin/members/[id]` `?/setRoles`로 직책을 고친 뒤 15초 안에
  인스턴스 B에서 배정하면 B는 고치기 전 배열에 한 줄을 더해 A의 수정을 되돌린다.
- 158행의 중복 검사와 180행의 "배정이 없다" 검사도 같은 낡은 행 위에서 돈다.
  145행 `listRoleTitles()`도 같다 — 다른 인스턴스에서 방금 추가한 직위가 15초간 "목록에 없는 직위"로 거부된다(경미).

`ATOMIC-FLOWS.md` §7은 "회원 관리 설정자"를 "단일 문서 CAS라 이미 원자적"으로 분류하는데, 그것은
**받은 값을 쓰는 `setRoles` 자신**에게 맞는 말이다. 읽고-결정하고-배열 전체를 넘기는 이 파일에는 옮길 수 없다.

처방: 추가·제거와 두 검사를 `patchMember`의 `fn` 안(최신 행 위)으로 옮긴다 — `members-admin`이 함수형 갱신
(예: `updateRoles(id, (roles) => roles', actorId)`)을 내줘야 한다. **동작 변경**(경합 시 결과만 달라진다).

## LB22-2 🟠 "탈퇴 회원은 배정 대상이 아니다"가 화면의 후보 목록에만 있다

125행이 후보에서 `status === "withdrawn"`을 뺀다. `assignRole`(137-164)은 `member.status`를 보지 않는다 —
탈퇴 회원 id를 담은 POST는 그대로 배정된다. 규칙이 뷰에만 있고 쓰기 경로에 없다.

배정된 직책이 회장·부회장이면 파생 경로들이 status를 거르지 않는다:

- `mail/dispatch.ts:39-56` `executiveEmails` — 탈퇴 유예 중 남아 있는 개인정보 이메일로 회장단 메일(탈퇴 통지 등)이 간다
- `public/archive.ts:77-129` `getPublicExecutives`(`getMemberDirectory`, `directory.ts:18-27`도 무필터) —
  공개 회장단에 오르고, 현 학기면 **전화번호가 자동 공개**된다(`archive.ts:69-73`)

처방: `assignRole`에서 탈퇴 회원을 거부. **동작 변경**(지금 받아들이는 입력을 거부).
배정 뒤에 탈퇴한 경우의 처리는 이 파일의 범위가 아니다.

## LB22-3 🟠 같은 `member.roles`에 입구가 둘이고 규칙이 서로 다르다

같은 데이터를 쓰는 두 경로:

| 규칙              | 이 파일 (`/admin/executives`)                                             | `/admin/members/[id]` `?/setRoles` (`+page.server.ts:162-171` → `parseRoleLines` `members.ts:289-301` → `memberRolesSchema` `:207-237`) |
| ----------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 직위 값           | 옵션 목록만 (146-150)                                                     | 자유 입력                                                                                                                               |
| 길이              | 커스텀 직위 ≤20 (44). `RoleTitleSchema`는 `min(1)`뿐                      | ≤40                                                                                                                                     |
| 기본 제안 목록    | `DEFAULT_ROLE_TITLES` 19-24: 회장·부회장·기획부장·자료관리부장 (+ 커스텀) | `+page.svelte:248-254` datalist: 회장·부회장·**학술부장·총무·홍보부장** — `role-titles` 테이블은 모른다                                 |
| (학기, 직위) 중복 | 158-162에서 직접 검사                                                     | `superRefine` (`members.ts:224-236`)                                                                                                    |
| 직책 수 상한      | **없음**                                                                  | 30 (`members.ts:223`)                                                                                                                   |
| 학기 형식·문구    | `requireTerm` 76-84                                                       | `members.ts:210-213` — 같은 정규식, 같은 취지의 문구                                                                                    |

결과:

- "배정할 수 있는 직위"가 입구마다 다르고, 두 곳의 "기본 직위"가 서로 다른 목록이다.
- `assignRole`은 `memberRolesSchema`를 거치지 않으므로 31번째 배정이 성공한다. 그 뒤로는
  **회원 상세에서 그 회원의 직책을 아예 저장할 수 없다** — 폼이 목록 전체를 보내고 스키마가 30개 초과로 전부 거부한다.
- 중복·학기 규칙을 바꾸려면 두 곳을 고쳐야 한다.

처방: `assignRole`·`unassignRole`이 완성된 배열을 `memberRolesSchema`로 검증하고(중복 검사 158행·`requireTerm` 흡수),
회원 상세 datalist는 `listRoleTitles()`에서 받는다. 상한·datalist는 **동작 변경**, 나머지는 구조.

## LB22-4 🟡 특권 직위(회장·부회장)가 이 파일의 상수와 무관하게 다섯 곳에 다시 쓰였다

`DEFAULT_ROLE_TITLES`(19-24)는 export되지만 **가져다 쓰는 곳이 없다**(grep). 반면 동작이 걸린 두 직위는
문자열로 따로 산다:

- `mail/dispatch.ts:48` — 회장단 메일 수신자
- `public/archive.ts:75` — 공개 회장단과 전화 자동 공개
- `domain/executive-roster.ts:49-50`, `domain/members.ts:72` (`title: "회장" | "부회장"`)
- `routes/(member)/settings/notifications/+page.server.ts:21` — 전화 공개 토글 노출 조건

이 파일의 기본 직위를 바꾸거나 특권 직위를 하나 늘려도 권한·공개 경로는 따라오지 않는다.
"기본 직위 목록"과 "특권을 갖는 직위"라는 두 개념 중 뒤의 것이 이름을 가진 적이 없다. **구조.**

## LB22-5 🟡 배정 현황이 서열이 아니라 직위 문자열의 가나다순이다

123행 `a.title.localeCompare(b.title, "ko")` → 기획부장 · 부회장 · 자료관리부장 · 회장 순으로 나온다.
`DEFAULT_ROLE_TITLES`의 선언 순서가 서열인데 쓰이지 않고, 공개 쪽은 서열로 정렬한다(`archive.ts:121-129`).
처방: 기본 직위는 선언 순서, 커스텀은 그 뒤. **동작 변경**(표시 순서).

## LB22-6 🟡 작은 비대칭들

- `(DEFAULT_ROLE_TITLES as readonly string[]).includes(...)`가 36·49·65행에 세 번 — 캐스트까지 복제된다. `isDefaultTitle()` 하나면 된다
- `NOT_FOUND`에 사용자 문구가 있는 곳(155-157, 181)과 없는 곳(71, 176)이 섞여 있다. 없는 쪽은 코드만 간다(`auth-guards.ts:162`) —
  `81a23f6`("say what went wrong instead of showing the error code")이 다른 곳에서 고친 부류다

## 확인했고 지적하지 않은 것

- **`removeRoleTitle`·`unassignRole`이 입력을 정규화하지 않는다** (`addRoleTitle` 43행·`assignRole` 144행은 한다) —
  제거는 **저장된 문자열과의 정확 일치**가 맞다. 정규화하면 보이지 않는 문자가 섞인 레거시 직책을 지울 수 없게 된다
- **직위 옵션 제거가 과거 배정을 건드리지 않는다**(63행) — 이력 보존으로 의도된 동작이고 `role-title.ts:4-9`가 같은 계약을 적는다
- **옵션 추가·제거에 감사 로그가 없다** — `API-SPEC.md` §1-5 대상은 `?/setRoles` 등 지위·권한 변경이고, 옵션 목록은 권한이 아니다.
  배정·해제는 `setRoles`가 감사를 남긴다
- **`getTermBoard`의 배정 현황에 탈퇴 회원의 직책이 나온다** — 학기 이력 표시로 맞다(후보와 다르다. LB22-2는 쓰기 경로 문제)
- **`listRoleTitles`가 기본 직위와 같은 커스텀 행을 거른다**(34-38) — `addRoleTitle`이 막으므로 새로 생기진 않지만 기존 데이터 방어로 타당
- **`role-titles` 쓰기** — 단일 문서 `mutate` 안에서 존재·중복을 검사한다(54-60, 70-73). 원자적이다
- **`requireTerm`이 로드에서도 돈다**(104행) — 잘못된 `?term=`이 400이 되는 것은 맞다

## 커버리지

이 파일을 직접 부르는 테스트가 없다. LB22-1의 경합, LB22-2의 탈퇴 회원 배정, LB22-3의 30개 상한 모두 미검증이다.

## 검증 (2026-09-28)

- LB22-1 — 확인. `setRoles`가 받은 배열로 통째로 교체(`members-admin.ts:91`), 결정은 `getTable`(로컬 계층 15초 상한, `cache.ts:51`) 위에서 CAS 밖. 인용 행 모두 일치
- LB22-2 — 확인. `assignRole`(137-164)과 라우트(`admin/executives/+page.server.ts:27-44`) 어디에도 status 검사가 없다. 보강: `executiveEmails`는 찾은 주소가 하나라도 있으면 관리자 폴백을 끄므로(`dispatch.ts:55`), 현 학기 회장단이 탈퇴 회원뿐이면 `withdrawal.requested` 기본 규칙(`events.ts:145-153`)의 통지가 **관리자에게는 가지 않고 탈퇴 회원에게만** 간다
- LB22-3 — 확인. 저장 스키마 `MemberRole`(`schemas/member.ts:7-10`)에는 상한이 없어 31번째 배정이 쓰기 게이트도 통과한다. 인용 행(`members.ts:207-237·223·289-301`, `+page.svelte:248-254`, `+page.server.ts:162-171`) 일치
- LB22-4 — 확인. `DEFAULT_ROLE_TITLES` 외부 사용 0건(grep), 다섯 곳의 문자열 재기술 일치
- LB22-5 — 확인. `ko` 정렬 결과 기획부장·부회장·자료관리부장·회장, 공개 쪽은 `rank` 정렬(`archive.ts:121-127`)
- LB22-6 — 확인. 캐스트 3회(36·49·65), 문구 없는 `NOT_FOUND`(71·176)는 `auth-guards.ts:162`에서 `message: undefined`로 나간다
- 누락 점검: 파일 전체와 라우트 4개 액션을 문서 없이 다시 읽었다(학기 검증이 정규 학기만 받는 것과 `currentTerm()`이 정규 학기만 내는 것의 일치, 직위 옵션 쓰기의 원자성, 중복 검사 키, 로드의 `requireTerm`). 새 지적 없음
