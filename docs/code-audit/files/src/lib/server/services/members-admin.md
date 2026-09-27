# `src/lib/server/services/members-admin.ts` (184줄)

**접두사 `LB25-`** · 관리자의 회원 편집(API-SPEC §7-3) — 공개 필드·지위·동문 박탈·직책·관리자 플래그·개인정보 수정과 그 감사, 탈퇴 보류/해제(흐름 호출), 관리자 대시보드의 유예 중 목록.

## LB25-1 🔴 `updatePrivateInfo`가 로그인 키의 유일성을 지키지 않는다

118-128행은 관리자가 넣은 `email`을 대상 행에 그대로 쓴다. 다른 행과의 중복은 보지 않는다.
입력 검증(`domain/members.ts:201-205` `privateInfoUpdateSchema`)은 형식과 `@snu.ac.kr` 접미사만 본다.

그런데 이 필드는 **인증의 열쇠**다.

- 스키마 주석: "login matching key (unique when present)"(`schemas/private-info.ts:8`)
- 세션 매칭: `infos.find((i) => i.email.toLowerCase() === normalized)`(`guards/resolve-member.ts:26`) — **첫 행**이 이긴다
- 재가입 승인: `where lower(trim(i ->> 'email')) = v_email limit 1`(`atomic_flows.sql:699-700`) — 역시 첫 행

관리자가 회원 B의 이메일 칸에 회원 A의 주소를 넣으면(오타, 복사 실수), 배열에서 B의 행이 A보다 앞에 있을 때
**A가 구글로 로그인하면 B로 식별된다** — B의 개인정보 화면, B의 권한, B의 이름으로 하는 모든 행위.
B 본인의 계정은 더 이상 어떤 행과도 맞지 않아 잠긴다. 대소문자만 다른 주소도 같은 결과다(두 매칭 모두 소문자화).
UI가 이 입력을 노출한다(`MemberRecordSections.svelte:379-386`).

심각도는 확률이 아니라 결과로 매긴다 — 유일성은 이 저장소의 인증이 서 있는 전제이고, 이 함수는 그것을 깨는 유일한 쓰기 경로다
(본인 수정 경로는 phone·background만 받는다, `API-SPEC.md:466`).

**고침**: `mutate` 콜백 안에서 `memberId !== targetMemberId`인 행 중 정규화된 이메일이 같은 것이 있으면 `CONFLICT`.
같은 CAS 안이라 경합도 막힌다. **동작 변경**(지금 통과하는 입력이 거부된다).

## LB25-2 🟠 "마지막 관리자는 사라지면 안 된다"를 본인 회수 금지로 대신했다 — 두 관리자가 서로를 회수하면 0명이 된다

```ts
101  /** Grant/revoke admin. Self-revocation is refused — the last admin must not vanish. */
...
107    if (targetId === actorId && !isAdmin) throw new AppError("CONFLICT");
108    await patchMember(targetId, (m) => ({ ...m, isAdmin }));
```

107행은 **신원** 비교이고 `mutate` 밖에 있다. 불변식("관리자 ≥ 1")은 **개수**다. 관리자가 A·B 둘일 때
A가 B를, B가 A를 거의 동시에 회수하면 두 요청 모두 107행을 통과하고(서로 남이다), 권한 확인(`requireAdminAction`)도
각자 요청 시작 시점에 끝났다(`auth-guards.ts:238`). CAS는 쓰기를 직렬화할 뿐 조건을 다시 보지 않는다 → **관리자 0명.**

복구 경로가 앱 안에 없다. env 부트스트랩은 **회원 행이 없는 이메일에만** 작동한다
(`resolve-member.ts:28` "회원 행이 없는 동안만"). 둘 다 회원이므로 SQL 편집만 남는다.

스펙은 "본인 회수 불가"라고만 적는다(`API-SPEC.md:714`). 규칙은 스펙대로이고, **101행 주석이 그 규칙에 더 강한 목적을 붙였고
코드가 그 목적을 달성하지 못한다.** 주석을 낮추거나 목적을 지키거나 둘 중 하나다.

**고침**: `patchMember` 콜백 안에서 "회수 후 `isAdmin`인 행이 0이면 `CONFLICT`". 본인 회수 금지는 유지해도 된다.
**동작 변경**. 현 테스트(`members-admin.test.ts:98-105`)는 본인 경우만 고정한다.

## LB25-3 🟡 아무것도 바뀌지 않은 조작이 "바뀌었다"로 기록된다

- `setStatus` 같은 값으로(regular→regular): 52행이 `statusChangedAt`을 새로 찍는다. 그래서 `mutate`의 무변경 건너뛰기
  (`tables.ts:124`)도 작동하지 않고, `statusChangedAt`의 뜻이 "지위가 바뀐 때"에서 "관리자가 마지막으로 저장한 때"로 바뀐다
- `setAdmin`·`setRoles` 같은 값으로: 쓰기는 `tables.ts:124`에서 건너뛰지만 감사(92-98, 109-115)는 **무조건** 한 행을 추가한다.
  테스트가 이것을 정상으로 적는다 — `members-admin.test.ts:104` "self no-op grant is fine"은 `member.set-admin` 행을 하나 남긴다

`audit_log`는 수정·삭제가 막힌 추가 전용 표다. "권한이 바뀌었다"는 거짓 행은 지울 수 없다.

**고침**: `patchMember`가 "실제로 바뀌었는가"를 돌려주고(지금 반환값은 아무도 안 쓴다 — LB25-10), 바뀐 경우에만
`statusChangedAt`을 찍고 감사한다. **동작 변경**.

## LB25-4 🟡 `updatePrivateInfo`의 감사가 쓰지 않은 필드까지 "고쳤다"고 적는다

126행은 `definedOnly(patch)`만 쓰는데 134행은 `Object.keys(patch)`를 적는다. 라우트는 항상 세 키를 넘기고
(`admin/members/[id]/+page.server.ts:198-206`), `blankAsMissing`(`domain/members.ts:188-194`)이 빈 phone·email을
`undefined`로 만든다. 그 값은 126행에서 버려지지만 감사에는 `fields: ["phone", "background", "email"]`로 남는다.
실제 값이 같은 필드도 마찬가지다.

"누가 이 회원의 이메일을 바꿨나"를 감사 로그로 답할 수 없다 — 모든 수정이 이메일을 바꾼 것으로 보인다.

**고침**: 콜백 안에서 기존 행과 비교해 **바뀐 키**를 모으고 그것을 감사한다. **동작 변경**(감사 내용).

## LB25-5 🟡 보류는 겹쳐 걸리는데 해제는 보류가 없으면 거부된다

`holdWithdrawal`(142-153)이 부르는 흐름은 이미 보류된 회원에게도 `hold`를 다시 적용해 `holdBy`·`holdAt`을
두 번째 관리자로 **덮어쓴다**(`atomic_flows.sql:1088-1090`). 반대 방향은 막혀 있다 — 보류 없이 `release`하면
`CONFLICT`(`:1092`). 결과: 첫 보류자와 시각이 회원 행에서 사라지고(감사 로그에만 남는다), 두 관리자가 각자
"내가 보류했다"고 알게 된다. 두 연산의 전제 검사가 비대칭이다.

**고침**: 보류 중 `hold`는 `CONFLICT`(또는 무변경 성공). SQL 한 줄. **동작 변경**.

## LB25-6 🟡 동문 박탈에 되돌리는 길이 없다

`alumniRevoked: true`(75행)를 `false`로 되돌리는 코드가 저장소에 없다(`grep alumniRevoked` — 쓰는 곳은 이 파일 75행뿐).
그리고 `isAlumni`를 부여하는 유일한 경로(53행)가 그 플래그를 존중한다. 다른 관리 토글은 모두 역연산이 있다 —
`setAdmin` 부여/회수, `setStatus` 양방향, 보류/해제.

관리자가 엉뚱한 회원 화면에서 박탈을 누르면 **앱 안에서는 복구할 수 없다.** 사유도 회원 행에 남지 않는다(`LA30-1`).
스펙 §7-3 표(`API-SPEC.md:709-718`)에 복원 액션이 없다 — **결정이 필요한 공백**이지 닫힌 결정은 아니다.

**고침**: `restoreAlumni(targetId, reason, actorId)`(감사 포함) 추가, 또는 "되돌릴 수 없음"을 스펙과 UI 확인 문구에 명시.
전자는 **동작 변경**.

## LB25-7 🟡 직책 변경의 감사는 개수만 남긴다

97행 `detail: { count: roles.length }`. 같은 파일의 다른 감사는 새 값을 남긴다 — `{ status }`(61), `{ isAdmin }`(114).
직책은 PII가 아니라 **공개 임원 이력**이다(`API-SPEC.md:525` 익명화 후에도 유지하는 필드). 값을 뺄 이유가 없다.
지금 감사 로그로는 "누가 X를 회장으로 올렸나"에 답할 수 없다 — 개수가 같으면 변경 전후도 구분되지 않는다.

**고침**: `detail: { roles }`(또는 추가·삭제 차분). **동작 변경**(감사 내용).

## LB25-8 🟡 `getWithdrawnPending`의 모양이 유일한 소비자와 맞지 않는다

169-184행이 돌려주는 것과 소비자(`admin/+page.server.ts:136-147`)가 쓰는 것:

| 서비스가 주는 것  | 소비자                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `held` (182)      | **쓰지 않는다**                                                                                     |
| — (`holdBy` 버림) | `members` 표를 **다시 읽어** `byId.get(w.id)?.withdrawal?.holdBy`를 꺼낸다(137-147)                 |
| `deleteAfter`     | `graceEndsAt`으로 **이름을 바꿔** 넘긴다(146) — 삭제는 보류됐으므로 소비자 쪽 이름이 맞다(`LB27-3`) |
| `department`      | 쓰지 않는다                                                                                         |

그리고 179-181행의 유예 종료 계산은 `withdrawal.ts:53-55`와 같은 식의 복사이고, 도메인에는 **규칙이 다른 셋째 사본**이 있다
(`LB27-1`, `LA09-4`). 178·180·182행의 `m.withdrawal!` 단언은 173행 필터가 타입을 좁히지 못해서 생겼다.

**고침**: 소비자가 필요한 `{ memberId, name, requestedAt, graceEndsAt, holdBy }`를 돌려주고 라우트의 재조회를 없앤다.
마감 계산은 LB27-1의 단일 함수로. **구조만 바뀐다.**

## LB25-9 🟡 탈퇴 흐름 호출이 두 파일에 세 벌이다

`holdWithdrawal`(146-152)·`releaseWithdrawalHold`(160-166)와 `withdrawal.ts:39-45` `cancelWithdrawal`은
`callFlow("flow_member_withdrawal", { memberId, op, actorId, now: nowKstIso(), ...auditStamp() })`에서
`op` 하나만 다르다. 흐름 입력에 필드를 더하면(예: 보류 사유) 두 파일 세 곳을 고친다.
10-11행 모듈 주석이 "HOLD는 여기, 요청 흐름은 BE-41"이라고 나눴지만, SQL 쪽은 한 함수다(`atomic_flows.sql:1061`).

**고침**: `withdrawal.ts`에 `memberWithdrawalOp(op, memberId, actorId)` 하나를 두고 셋이 그것을 쓴다. **구조만 바뀐다.**

## LB25-10 🟡 `patchMember`의 반환값은 아무도 쓰지 않고, 같은 패턴이 바로 아래에 다시 있다

14-27행은 `updated`를 콜백 밖으로 빼내 `updated!`로 돌려준다. 호출자 다섯(38, 47, 72, 91, 108)은 모두 버린다.
반환을 위해 존재하는 변수와 non-null 단언이다(게다가 `mutate`가 실제로 저장하는 것은 게이트를 거친 `parsed`이지
`updated`가 아니다, `tables.ts:142-153`).

123-128행 `updatePrivateInfo`는 "`findIndex` → `NOT_FOUND` → 치환"을 `private-info` 표에 대해 다시 쓴다.
`membership.ts:64-75`도 같다(`LB26-3`).

**고침**: `patchMember`는 LB25-3을 위해 "바뀌었는가"를 돌려주게 하거나 `void`로. 표·키를 받는 `patchRow` 하나로 셋을 모은다.
**구조만 바뀐다.**

## 확인했고 지적하지 않은 것

- **지위·권한 변경과 감사가 원자적이지 않다** (47-62 등) — `audit()`는 `withdrawal.*` 외 실패를 삼킨다(`audit.ts:53-57`). ATOMIC-FLOWS가 **설계로 정했다**: "나머지 감사(`member.set-*` 등)는 설계상 best-effort"(`ATOMIC-FLOWS.md:53-54,128`). 닫힌 결정이다. 10행 "Every … mutation … is audited"는 best-effort 의미로 읽으면 참이다
- **`setStatus`의 withdrawn 거부가 콜백 안에 있다** (48) — 같은 CAS 안이라 동시 `flow_request_withdrawal`과도 어긋나지 않는다
- **강등 시 `isAlumni`를 유지한다** (53) — 동문은 누적 지위다. 스펙 §7-3과 같다
- **탈퇴한 관리자의 `setAdmin`** — C-18 결정(관리자 권한은 회원 상태에 구속되지 않는다, `SCOPE.md:644`)
- **보류·해제가 흐름으로 원자적이다** (142-167) — `withdrawal-flow.test.ts:109`가 감사 행과 함께 고정한다. 해제가 `requestedAt`을 덮어쓰는 것은 스펙이다(`API-SPEC.md:717` "requestedAt 갱신")
- **`updateMember`가 `stripInvisibles`를 거치지 않는다** (29-39) — `LA08-1`이 이 경로를 명시해 지적했다
- **`revokeAlumni`의 사유가 감사 로그에만 산다** (82) — `LA30-1`
- **`revokeAlumni`의 `reason.trim()` 검사가 라우트 스키마와 겹친다** (71) — 서비스 경계의 방어적 재검사다. 라우트 외 호출자가 생겨도 계약이 선다
- **콜백 안의 제자리 수정**(`rows[idx] = …`, 23·126) — `mutate`가 `structuredClone`한 배열을 준다(`tables.ts:123`). 캐시를 오염시키지 않는다

## 커버리지

`members-admin.test.ts`에 `updateMember`·`updatePrivateInfo`·`setRoles` 테스트가 없다. LB25-1(이메일 중복)·LB25-2(동시 회수)·
LB25-4(감사 필드)는 모두 미검증 영역에 있다.

## 검증 (2026-09-28)

- LB25-1 — 확인 (🔴 유지. 일회용 vitest로 재현했다(메모리 스토어, 실행 후 삭제): 관리자 라우트와 같은 `privateInfoUpdateSchema.safeParse({ email: " Alice@SNU.ac.kr ", … })`가 통과하고, `updatePrivateInfo("mB", …)` 뒤 `private-info` 행 순서가 [B, A]이면 `resolveMember("alice@snu.ac.kr")`가 `memberId: "mB"`·`name: "Bob"`을 돌려주며 `resolveMember("bob@snu.ac.kr")`는 `null`이다. 순서가 [A, B]면 A는 A로 남고 B만 잠긴다. 스키마는 trim만 하고 소문자화하지 않으므로 `Alice@SNU.ac.kr`로 저장되지만 `resolve-member.ts:26`이 양쪽을 소문자화해 같은 키가 된다. 이메일을 쓰는 다른 경로(본인 프로필 `(public)/+page.server.ts:589`, 알림 설정 두 곳)는 email을 받지 않음을 확인 — "유일한 쓰기 경로"가 맞다. B가 관리자면 A는 관리자 권한까지 얻는다)
- LB25-2 — 확인 (재현: 관리자 둘이 `Promise.all([setAdmin(B,false,A), setAdmin(A,false,B)])` → 관리자 0명. 창은 "거의 동시"보다 넓다 — 권한 판정의 `getTable("members")`는 다른 인스턴스에서 최대 15초 낡을 수 있다(`cache.ts:42-52` `table_` 로컬 TTL 상한))
- LB25-3 — 확인 (`tables.ts:124` 무변경 건너뛰기, 테스트 `members-admin.test.ts:104` 확인. `revokeAlumni`를 두 번 눌러도 같은 형태로 감사 행이 하나 더 생긴다)
- LB25-4 — 확인
- LB25-5 — 확인 (`atomic_flows.sql:1088-1090` hold 덮어쓰기, `:1092` release 거부)
- LB25-6 — 확인 (SQL에도 `alumniRevoked`를 false로 되돌리는 곳은 신규 회원 행 생성뿐)
- LB25-7 — 확인 (`API-SPEC.md:525` 익명화 유지 목록에 `roles`)
- LB25-8 — 확인
- LB25-9 — 확인
- LB25-10 — 확인
- 누락 점검: 184줄을 문서 없이 다시 읽었다 — `setStatus`의 withdrawn 거부 위치, `revokeAlumni` 재실행, 부트스트랩 관리자의 `actorId`(`env-admin-…`)가 회원 id와 겹칠 수 없는 점, `updatePrivateInfo`의 익명화된 행(NOT_FOUND), 감사가 쓰기 뒤에 오는 순서. 새 지적은 없다.
