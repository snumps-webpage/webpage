# `src/lib/server/guards/resolve-member.ts` (78줄)

**접두사 `LB05-`** · 세션 이메일 → `private-info` → `members` → 이번 학기 `registrations`로 `MemberContext`를 만든다(capability 파생 포함). 관리자 부트스트랩 분기와 신청 여부 조회 `hasApplication`.

## LB05-1 🟠 capability가 탈퇴 상태를 모른다 — 양쪽으로 틀린다

> **검증 정정**: **`LA02-1`(`core/capabilities.md`)과 같은 결함이다 — 독립 건수로 세지 않고 상호참조로 둔다.**
> 원인(파생 입력 `CapabilityInput`에 `status`가 없다), 두 증상(api 존 presign 과다 부여 · 학기 경계 후 자기 취소 403), 처방(`withdrawn → [MANAGE_SELF]`)이
> 셋 다 같다. 결함의 소유자는 파생 규칙을 가진 `capabilities.ts`이고, 이 파일 64행은 그 입력을 채우는 호출부다 — 처방이 이 줄의 인자를 바꾸는 것은
> `LA02-1`의 "호출부 시그니처가 바뀐다"에 포함된다. 인과 주장은 코드로 확인했다(presign: `requireCapabilityAction` → 이 파일 64행 → `PARTICIPATE`;
> 취소: `decide` 156행이 capability 검사 전에 허용 → `hooks.server.ts:160-168`이 `MANAGE_SELF` 부재로 403).
>
> 두 문서 모두의 서술을 한 가지 **강하게** 고친다. 둘 다 창을 "유예(30일)가 학기 경계를 넘으면"으로 적었지만,
> `services/withdrawal.ts:9-10`은 자동 익명화를 **연기**했고 "self-cancellation never expires"라고 적는다 — 기한이 지난 탈퇴 회원은 그대로 남는다.
> 따라서 창은 30일이 아니라 **무기한**이고, 탈퇴를 신청한 비동문 준회원은 **누구나 결국** 다음 학기 경계에서 취소 능력을 잃는다.

64행 `capabilitiesFor({ isAlumni: member.isAlumni, registered })` — `member.status`를 넘기지 않는다.
`core/capabilities.ts:13`은 그 이유를 "withdrawn은 capability 이전 단계(가드)에서 차단된다"라고 적고,
`zone.ts:32`는 capability를 "가드·서비스는 **이것만** 본다"고 적는다. 두 문장이 함께 참일 수 없다. 그 틈에서 두 결함이 나온다.

**(a) 가드가 없는 곳에서 탈퇴 회원이 참여 권한을 가진다.**
`flow_request_withdrawal`(`atomic_flows.sql:1044-1051`)은 `status`만 바꾸고 이번 학기 `registrations` 행을 남긴다 → 탈퇴 유예 중인 등록 회원의 capability는
`[VIEW, PARTICIPATE, MANAGE_SELF]` 그대로다. api 존은 가드를 거치지 않는다(`zone.ts:103-105`, `hooks.server.ts:122`).
`api/uploads/presign/+server.ts:33-35`의 `requireCapabilityAction(locals, PARTICIPATE)`가 통과해 **탈퇴 신청자가 세미나 포스터 presign을 받는다.**

**(b) 가드가 있는 곳에서 탈퇴 회원이 자기 권리를 잃는다.**
`services/withdrawal.ts:9-10`: "self-cancellation never expires." 취소 액션은 `/(member)/withdraw/pending` POST이고,
그 라우트는 `MANAGE_SELF`를 요구한다(`zone.ts:75`, 판정 `hooks.server.ts:160-168`). 그런데:

- 등록 학기에 탈퇴를 신청한 **비동문**(준회원 이력만) 회원이
- 유예 중(30일, `core/time.ts:8`) 또는 관리자 보류 중에 학기가 바뀌면
- `registered = false`, `isAlumni = false` → `capabilitiesFor`가 **`[]`**(`capabilities.ts:45`)
- `decide`는 탈퇴 회원을 pending 페이지에 들인다(`zone.ts:150-156`, capability 검사 전 반환). 페이지는 보인다
- 취소 버튼 POST → **403 "이번 학기 등록 회원만 할 수 있는 작업입니다."**

스펙이 기한 없다고 한 자기 취소가, 학기 경계를 넘는 순간 영구히 막힌다.

처방(동작 변경): 파생 입력에 `status`를 넣는다 — `withdrawn`이면 `[MANAGE_SELF]`만(참여 불가, 자기 취소 가능). 수정 지점은 `capabilitiesFor`(`core/capabilities.ts`)와 이 파일 64행 둘이고,
`resolve-member.test.ts`에 탈퇴×등록 여부×동문 여부 행렬을 추가해야 한다(현재 탈퇴 사례 0건).

## LB05-2 🟡 `hasApplication`이 데이터 장애를 "신청 없음"으로 바꾼다 (`HS-16` 재확인)

> **검증 정정**: 결함·등급 유지, 결과 서술을 좁힌다. "거기서 중복 신청 `CONFLICT`를 만난다"는 지금 코드에서 따라 나오지 않는다.
> `/signup` 로드는 대기 신청이 있으면 리디렉션하지 않고 **대기 상태 화면**을 그린다(`signup/+page.server.ts:35-40`의 주석과 `getApplicationForEmail`).
> 그러므로 삼킴 뒤의 결과는 둘 중 하나다 — 장애가 이어지면 같은 `getTable("applications")`가 `/signup` 로드에서 다시 던져 **500**(이 로드는 `httpGuard`로 감싸지 않아 `SERVICE_UNAVAILABLE`도 503이 되지 못한다),
> 일시 장애였다면 대기 화면. `CONFLICT`는 사용자가 그 화면에서 다시 제출해야 생긴다(HS-16의 "실측"은 대기 화면 도입 이전 동작일 수 있다).
> 남는 결함은 그대로다 — 같은 파일의 두 헬퍼가 같은 장애에 반대로 반응하고, 삼킴이 로그 한 줄 없이 목적지를 바꾼다.
> (덧붙여 장애가 표 전체라면 존 가드의 `resolveMember`가 먼저 던지므로 이 `catch`에 닿는 것은 `applications` 한 표만 읽기에 실패한 경우 — 봉투 검증 실패나 그 호출만의 일시 오류다.)

72-77행 `try { … } catch { return false; }`. 로그도 없다. 같은 파일의 `resolveMember`는 같은 `getTable`이 실패하면 던진다(`SERVICE_UNAVAILABLE`, `tables.ts:63-71`).
장애 중 신청 대기자는 존 가드에서 `/wait` 대신 **`/signup`** 으로 보내지고(`zone.ts:118,147,164`), 거기서 중복 신청 `CONFLICT`를 만난다.
두 헬퍼의 장애 정책이 한 파일 안에서 반대다. `STATUS-CODES.md` HS-16 → `W-36`, 미처리. 처방: 삼킴 제거(전파 → 503). 동작 변경.

## LB05-3 🟡 부트스트랩 분기의 조건이 주석이 말하는 조건이 아니다

28-30행 주석과 `core/admin-bootstrap.ts:10`의 계약은 "**회원 행이** 없는 동안" env 명단이 관리자다. 코드는 **`private-info` 행이** 없을 때만 부트스트랩을 본다(27행 `if (!info)`).
`private-info` 행은 있는데 그것이 가리키는 `members` 행이 없으면(48-49행) 곧장 `null`이다 — 부트스트랩 검사를 건너뛴다.

- 그 이메일이 env 명단에 있어도 **관리자 존을 잃고**(`zone.ts:172` → 404) 루트에서 `/signup`으로 보내진다(`zone.ts:115-119`)
- `private-info`만 남는 상태는 `members` 행 삭제·이관 누락·부분 복구에서 생긴다. 지금 데이터에 없다는 것은 감면 근거가 아니다

같은 분기(32-41행)는 부트스트랩 관리자에게 `status: "regular"`를 **지어낸다.** 타입이 status를 요구해서 넣은 값이지만,
`status === "regular"`를 "정회원"으로 읽는 코드가 생기면 회원 행도 없는 사람을 정회원으로 센다. 이름 `"관리자"`(35행)도 같은 성격의 자리채움이다.

처방: 부트스트랩 검사를 "회원 행 없음"(27행과 48행 두 경우 모두)에 걸고, `MemberContext`에 부트스트랩 여부를 표현하는 자리를 둔다. 동작 변경.

## LB05-4 🟡 이메일 정규화가 다섯 번 적혀 있고, 양변이 다르게 정규화된다

> **검증 정정**: 등급 유지, 범위를 넓힌다. 사본은 다섯이 아니다 — `services/membership.ts:18`의 `norm`(신청 조회·제출)과
> SQL `flow_approve_application`의 `lower(trim(…))`(`atomic_flows.sql:692,700,724`)이 더 있다.
> 그리고 "양변이 다르다"는 추상이 아니라 **TS와 SQL 사이에서 구체적으로 갈린다**: 승인 흐름은 저장된 `private-info.email`을 `lower(trim())`으로 비교해
> 앞뒤 공백이 있는 저장값을 **복귀 회원**으로 매칭하는데(새 행을 만들지 않는다), 이 파일 26행은 저장값을 `toLowerCase()`만 해서 같은 행을 **못 찾는다**.
> 그 사람은 승인됐는데 로그인하면 `/signup`으로 간다. 오늘 저장값에 공백이 없다는 것은 데이터의 성질이다.

`email.trim().toLowerCase()` — 23행, 71행, `core/admin-bootstrap.ts:18,22,42`. 그리고 비교 상대인 저장값은 `toLowerCase()`만 한다(26행, 74행).
정규화 규칙(예: 유니코드 NFKC, `+태그` 처리)을 바꾸면 다섯 곳과 저장값 쪽 두 곳을 함께 고쳐야 하고, 하나를 빠뜨리면 **로그인 매칭이 조용히 실패한다**(→ `/signup`).
`normalizeEmail()` 하나로. 구조 변경.

## 확인했고 지적하지 않은 것

- **D4 — 회원 행이 있으면 `isAdmin`은 레코드만 본다**(60-61행) — `admin-bootstrap.ts`의 계약과 일치하고 `resolve-member.test.ts:88`이 고정한다
- **등록 판정이 `currentTerm()` 기준**(50-53행) — S9의 "이번 학기 등록"과 일치. 학기 경계 문제는 LB05-1의 (b)로만 드러난다
- **표 전체 선형 탐색 3회**(25·45·51행) — 요청마다 돌지만 `getTable`이 캐시하고 규모가 동아리다. 논리 결함 아님
- **감사 로그 면제**(13행) — API-SPEC §1-5가 명시한 예외다
- **`private-info.email`이 `""`를 허용한다**(`schemas/private-info.ts:9`) — 입력 쪽이 빈 이메일로 여기 오지 않는다(호출부 `hooks.server.ts:135`, `auth-guards.ts:35`가 모두 truthy 검사 후 호출). 빈 문자열끼리 매칭될 경로가 없다
- **`hasApplication`이 새 표만 본다**(69-70행) — 주석이 근거(이관 시점 레거시 대기 신청 0건)를 적었다. 레거시 표는 기록 전용이라 새 대기 신청이 생길 수 없다

## 검증 (2026-09-28)

- LB05-1 — 정정 (`LA02-1`과 같은 결함 → 상호참조, 독립 건수에서 제외. 창은 30일이 아니라 무기한)
- LB05-2 — 정정 (등급 유지. `CONFLICT` 결과 서술 → 500 또는 대기 화면)
- LB05-3 — 확인 (27행 `if (!info)`만 부트스트랩을 보고, 48행 `if (!member) return null`은 건너뛴다 — `admin-bootstrap.ts:10`의 "회원 행이 없는 동안"과 다르다)
- LB05-4 — 정정 (등급 유지. 사본 7곳, TS↔SQL 사이의 구체적 불일치 추가)
- 누락 점검: 78줄을 문서 없이 다시 읽고 `private-info` 첫 매칭(대소문자만 다른 중복 행이면 앞의 것이 이긴다 — 스키마가 유일성을 강제하지 않는 것은 스키마 문서의 몫), `registrations`의 학기 대조, 부트스트랩 `memberId`가 회원 쓰기 경로에 쓰이지 않는지(`capabilities: []`)를 확인했다. 추가 없음
