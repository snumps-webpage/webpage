# `src/lib/server/data/audit.ts` (59줄)

**접두사 `LA30-`** · 감사 로그 채널 — `audit_log`에 한 행을 INSERT하는 `audit()`와, SQL 흐름이 같은 트랜잭션에서 쓸 id·시각을 만드는 `auditStamp()`.

## LA30-1 🟠 "detail에는 필드 **이름**만, PII 값은 절대 안 된다"가 주석뿐이고, 호출자가 값을 넣는다

9행이 계약을 적는다: _"detail must carry field NAMES only, never PII values."_
31행의 타입은 `detail?: Record<string, unknown>` — 계약을 표현할 자리가 없다.

`detail`을 넣는 호출 6곳 중 **이름만** 넣는 것은 하나다(나머지 한 곳 `private-info.read`는 detail 없음)(`members-admin.ts:134` `{ fields: Object.keys(patch) }`).
나머지는 값을 넣는다:

| 호출                                       | detail                   | 성격                                        |
| ------------------------------------------ | ------------------------ | ------------------------------------------- |
| `members-admin.ts:82` revoke-alumni        | `{ reason }`             | **관리자가 쓴 자유 서술** — 무엇이든 담긴다 |
| `members-admin.ts:61` set-status           | `{ status }`             | 열거값                                      |
| `members-admin.ts:97` set-roles            | `{ count }`              | 수                                          |
| `members-admin.ts:114` set-admin           | `{ isAdmin }`            | 불리언                                      |
| `records-admin.ts:292` study.set-organizer | `{ to: newOrganizerId }` | 회원 id                                     |

열거값·불리언은 개인정보라 부르기 어렵지만, **`reason`은 특정 회원(`target_id`)에 대한 자유 서술**이다.
그리고 `audit_log`는 트리거로 UPDATE/DELETE가 거부되는 추가 전용 표다(`20260901000000_documents.sql:28-36,62`,
`ARCHITECTURE.md` §Data Layer "감사 로그"). 그 회원이 탈퇴해도 지울 수 없다.

또 `reason`은 이 로그 **말고는 어디에도 저장되지 않는다** — `revokeAlumni`는 `alumniRevoked: true`만 쓴다
(`members-admin.ts:71-76`). 즉 감사 로그가 사실상 사유의 유일한 저장소로 쓰이고 있다.

두 방향 중 하나를 정해야 한다: (a) 사유를 회원 행(삭제·익명화 대상)에 두고 로그에는 `{ hasReason: true }`만,
또는 (b) 계약 문구를 "PII 값 금지, 단 운영 사유 서술은 허용"으로 바꾸고 그 결정을 기록. (a)는 **동작 변경**이다.
어느 쪽이든 `detail`의 타입을 `Record<string, string | number | boolean | string[]>` 정도로 좁히면
적어도 객체 통째 투입(`detail: { ...member }`)은 막힌다.

## LA30-2 🟡 54-56행의 재던짐 분기는 죽었다 — 그 보장은 이제 SQL에 있다

```ts
// Withdrawal-lifecycle entries are destruction evidence: their loss must
// fail the action itself. Everything else logs and moves on.
if (entry.action.startsWith("withdrawal.")) throw e;
```

`withdrawal.*` 항목은 전부 SQL 흐름 안의 `app_audit`로 옮겨졌다
(`20260928000000_atomic_flows.sql:1052` request, `:1099-1101` cancel/hold/release-hold).
TS 쪽은 `auditStamp()`만 넘긴다(`services/withdrawal.ts:27-46`, `members-admin.ts:146-167`).
**`audit()`에 `withdrawal.*`를 넘기는 호출자는 없다**(`audit(` 호출 7곳 전수 — 위 표 + `admin/members/[id]/+page.server.ts:40`).

그래서 이 분기와 주석은 이 모듈이 더 이상 제공하지 않는 보장을 설명한다. "파기 증거 유실은 액션을 실패시킨다"를
찾는 독자는 여기로 오고, 실제 보장이 트랜잭션 원자성이라는 것을 놓친다. 그리고 정책 키가 **액션 이름의 접두사**라,
파기 증거인데 접두사가 다른 액션이 생기면 조용히 best-effort가 된다.

**고침**: 분기 삭제, 주석을 "withdrawal.* 은 SQL 흐름이 같은 트랜잭션에서 쓴다(ATOMIC-FLOWS §2)"로 교체,
`audit()`의 인자 타입을 TS가 쓰는 액션으로 좁힌다. 구조만 바뀐다.

## LA30-3 🟡 액션 어휘의 출처가 둘이고, 선언만 있고 쓰는 곳이 없는 항목이 있다

- 12-24행의 `AuditAction`과 SQL 문자열 리터럴(`atomic_flows.sql:1052,1099-1101`)이 같은 네 값을 각자 적는다.
  TS 컴파일러는 SQL을 보지 않고, 둘을 대조하는 테스트도 없다. 이름을 바꾸면 한쪽만 바뀐다
- `"withdrawal.auto-anonymize"`(24)는 **쓰는 곳이 저장소 어디에도 없다** — 자동 익명화는 명시적으로 보류됐다
  (`services/withdrawal.ts:9`)
- `actorMemberId: string | "system"`(27)의 `"system"`도 쓰는 곳이 없고(`grep '"system"'` → `theme.ts`뿐),
  타입으로는 `string | "system"`이 그냥 `string`이다. 주석 `// cron = "system"`이 타입 행세를 한다

**고침**: 보류된 기능의 어휘는 기능과 함께 들인다. SQL이 쓰는 액션은 `flow-rules.test.ts` 식으로
`audit_log`에서 읽어 `AuditAction`에 속하는지 확인하는 테스트 하나로 묶을 수 있다. 구조만 바뀐다.

## LA30-4 🟡 `auditStamp()`와 `audit()`가 id·시각을 따로 만든다

38-40행이 `{ auditId: newId(), auditAt: new Date().toISOString() }`를, 45-46행이 같은 두 식을 다시 쓴다.
35-36행 주석이 "the same values `audit` would give it"이라고 약속하는데, 그 약속은 **복사로** 지켜지고 있다.
id 형식이나 시각 표기(예: KST ISO로 통일)를 바꾸면 두 곳이다.
**고침**: `audit()`가 `auditStamp()`를 쓴다. 구조만 바뀐다.

## 확인했고 지적하지 않은 것

- **비-withdrawal 감사 실패를 삼킨다(53-57)** — `private-info.read` 기록이 실패해도 PII 열람이 진행된다.
  그러나 `ATOMIC-FLOWS.md:54`가 "나머지 감사(`member.set-*` 등)는 설계상 best-effort"로 **결정**했다.
  닫힌 결정을 되살리지 않는다(README 교훈 넷째). 삼킴은 `console.error`로 로그를 남긴다
- **`targetTable: TableName | "attendance-queue"`(29)** — 큐는 표가 아니므로 별도 리터럴이 맞다
- **`at`이 UTC ISO(`toISOString`)** — 컬럼이 `timestamptz`라 표기 차이는 저장에서 사라진다
- **INSERT 한 번 = 추가 한 번** — 테이블 문서 CAS와 경합하지 않는다는 주석(6-8)은 사실이다

## 검증 (2026-09-28)

- LA30-1 — 확인. `audit(` 호출 7곳 전수(`members-admin.ts:56,77,92,109,129`, `records-admin.ts:287`,
  `admin/members/[id]/+page.server.ts:40`)와 detail 값, `revokeAlumni`가 사유를 행에 남기지 않음(71-76),
  `audit_log` 불변 트리거(`20260901000000_documents.sql` §3) 확인
- LA30-2 — 확인. `withdrawal.*`는 SQL `app_audit`(`atomic_flows.sql:1052,1099-1101`)만 쓰고 TS `audit()` 호출자는 없다
- LA30-3 — 확인(`auto-anonymize`·`"system"` 사용처 0건)
- LA30-4 — 확인
- 누락 점검: 삼킴 분기의 결정 근거(`ATOMIC-FLOWS.md:54`)·`at` 표기·`targetTable` 리터럴을 확인. 추가 없음.
