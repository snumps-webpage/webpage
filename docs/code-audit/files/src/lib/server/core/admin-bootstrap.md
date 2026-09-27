# `src/lib/server/core/admin-bootstrap.ts` (45줄)

**접두사 `LA01-`** · `ADMINS_EMAILS` env 명단을 부트스트랩 관리자 판정·SQL 스탬프용 해시·감사용 actor id로 바꾼다.

## LA01-1 🟡 `ADMINS_EMAILS` 파싱이 두 곳에 있고 규칙이 다르다

> **검증 정정**: 등급은 그대로다. 두 곳을 고친다.
> (1) 아래 "12-13행 주석은 **관리자 권위에 한해서만** 참이다"는 틀렸다. 관리자 권위에 대해서도 거짓이다 —
> 회원 행이 있는 사람이 재등록 승인을 받을 때 `flow_approve_application`의 기존 회원 분기
> (`atomic_flows.sql:702-712`)가 env 명단을 대조해 `isAdmin`을 다시 스탬프한다
> (`approve-application-flow.test.ts:63` "stamps a returning member too"가 핀으로 고정). 이 부분은 새 지적 **LA01-3**으로 옮긴다.
> (2) 파서는 두 곳이 아니라 세 곳이다. `scripts/migration/20-export-tables.ts:109-112`도 같은 env를 파싱한다(`?? ""`, `trim().toLowerCase()` — 이 파일과 규칙이 같다).

15-19행 `bootstrapAdminEmails()`와 `mail/dispatch.ts:31-36` `adminEmails()`가 같은 env 변수를
각자 파싱한다.

| 위치                       | 빈 값 처리 | 정규화                      |
| -------------------------- | ---------- | --------------------------- |
| `admin-bootstrap.ts:16-18` | `?? ""`    | `trim().toLowerCase()`      |
| `mail/dispatch.ts:32-34`   | `\|\| ""`  | `trim()` 만 (대소문자 유지) |

명단 형식(구분자·공백 허용 여부)을 바꾸면 두 곳을 함께 고쳐야 하고, 한쪽만 고치면 "관리자로
인정되지만 알림은 못 받는" 주소가 생긴다. `ARCHITECTURE.md:65-66`이 이 env의 용도를
"부트스트랩과 운영 알림 수신" 둘로 명시하므로, 파서는 하나여야 한다.

덧붙여 12-13행 주석("회원 행이 있는 뒤: env 명단은 더 이상 참조하지 않는다")은 **관리자 권위에
한해서만** 참이다 — 알림 수신자로는 계속 읽힌다. 주석이 범위를 적지 않았다.

처방: `bootstrapAdminEmails`를 export(또는 `adminEmailList()`)하고 dispatch가 그것을 쓴다.
메일 주소는 대소문자 무관이므로 **동작 변화 없음**, 구조만 바뀐다.

## LA01-2 🟡 이메일 정규화 규칙이 파일 안에 세 번, 서버 전체에 여섯 번 쓰였다

> **검증 정정**: 등급과 결론은 그대로다. 어긋날 수 있는 두 곳을 바로잡는다. 22행과 32행은 명단 쪽 정규화(18행)를
> 함께 쓰므로 18행을 고치면 둘이 같이 바뀌고, 둘 사이에서는 어긋남이 생기지 않는다. 적힌 증상("로그인 때는 관리자인데
> 스탬프는 안 됨")을 만드는 짝은 **22행(로그인 이메일 정규화) ↔ `atomic_flows.sql:692`(신청 이메일 정규화)**다.

`e.trim().toLowerCase()`가 18·22·42행에 각각 있고, sha256 계산도 31-33행과 41-43행에 두 번
있다(`bootstrapAdminActorId`의 다이제스트는 `bootstrapAdminEmailHashes`의 원소 하나와 같은 값이다).
같은 규칙이 `services/membership.ts:18`(`norm`), `guards/resolve-member.ts:23,71`에도 있고,
SQL 쪽은 `lower(trim(...))`(`atomic_flows.sql:692,700,724`)다. 게다가 `resolve-member.ts:23`은 이미
정규화한 값을 22행·42행에 넘겨 **같은 정규화가 연달아 두 번** 돈다.

정규화를 바꾸면(예: 유니코드 NFC 추가) 이 파일 3곳 + 서버 3곳 + SQL을 함께 고쳐야 하고, 특히
22행(판정)과 32행(SQL로 가는 해시)이 어긋나면 **로그인 시에는 관리자인데 승인 전환 시 isAdmin이
스탬프되지 않는** 사람이 생긴다 — D4 복귀 직후 관리자 권한을 잃는다.

처방: `normalizeEmail` 하나와 `emailDigest(normalized)` 하나로 모으고 세 export가 그것을 쓴다.
**구조만 바뀐다.**

## LA01-3 🟠 (검증 추가) 머리 주석이 약속한 "회원 행 이후에는 env를 보지 않는다"가 거짓이다 — 화면에서 해제한 관리자가 다음 학기 승인 때 되살아난다

12-13행: "회원 행이 있는 뒤: env 명단은 더 이상 참조하지 않는다 — 관리자 해제는 회원 관리 화면(isAdmin)에서,
env는 명단 정리만 하면 된다". `ARCHITECTURE.md:65-66`(HEAD)도 "`ADMINS_EMAILS`는 회원 행이 생기기 전
부트스트랩과 운영 알림 수신에만 쓴다"고 적는다.

코드는 반대로 동작한다. `membership.ts:115`는 모든 승인에서 `bootstrapAdminEmailHashes()`를 넘기고,
`flow_approve_application`은 **기존 회원 분기**(`atomic_flows.sql:702-712`)에서도 명단에 있으면 `isAdmin: true`를 다시 쓴다.
`approve-application-flow.test.ts:63-75`가 이 동작을 의도로 고정한다("stamps a returning member too, and never takes it away").

S9에서는 학기마다 등록 신청과 승인을 다시 거친다. 따라서:

1. 관리자 A를 회원 관리 화면에서 해제한다(`isAdmin=false`) — 주석이 안내하는 절차다
2. env 명단은 "정리만 하면 되는" 일이라 미뤄 둔다
3. 다음 학기 A의 재등록을 승인하면 `isAdmin=true`가 **말없이 되돌아온다**

권한 회수가 오래가지 않는다. 주석과 문서가 코드보다 약한 조건을 약속해서 생기는 일이다. D4("회원 레코드가 관리자 진실")가
재등록 때마다 env에 덮인다. 어느 쪽을 고칠지는 결정할 일이다: (a) 스탬프를 **신규 회원 분기로만** 좁힌다(**동작 변경**. 테스트
63-75행의 기대가 바뀐다). (b) 주석과 `ARCHITECTURE.md`를 "해제하려면 env 명단에서도 빼야 한다"로 고친다(**문서만**).
실제로 스탬프하는 코드는 SQL에 있지만, 운영자가 따를 계약은 이 파일의 주석이 정의하므로 여기서 지적한다.

## 확인했고 지적하지 않은 것

- **TS 해시와 SQL 해시의 미러** — 32행(`createHash("sha256")…hex`)과 `atomic_flows.sql:695-696`
  (`encode(sha256(convert_to(lower(trim(email)),'UTF8')),'hex')`)은 같은 규칙을 두 언어로 쓴다.
  `approve-application-flow.test.ts:48-60`이 `"Boss@SNU.ac.kr "`(대소문자·공백)로 **실제 SQL을 거쳐**
  스탬프를 확인하므로 핀이 있다. 단 JS `trim()`은 유니코드 공백을, Postgres `trim()`은 ASCII
  공백만 제거한다 — 이 차이는 핀 밖이다. LA01-2의 정규화 단일화 때 함께 정할 일이라 별도 지적하지 않는다
- **actor id가 해시 앞 8자(32비트)** — 명단이 소수라 충돌은 무의미하고, 주석(36-39행)이 "대조하면
  특정 가능"을 의도로 밝힌다. PII를 싣지 않는다는 목적과 맞다
- **env를 호출마다 다시 읽는다** — `$env/dynamic/private`이므로 의도된 동작이다. 캐시하면 테스트
  (`resolve-member.test.ts:69`, `approve-application-flow.test.ts:49`)의 env 교체가 깨진다
- **해시로 보내는 설계**(25-29행) — 주소가 RPC 인자·문장 로그에 남지 않게 한다는 목적이 코드와 일치한다

## 검증 (2026-09-28)

- LA01-1 — 정정 (등급 유지. "관리자 권위에 한해 참"을 철회하고 LA01-3으로 분리. 세 번째 파서 `20-export-tables.ts:109` 추가)
- LA01-2 — 정정 (등급 유지. 어긋나는 짝을 22↔32에서 22↔`atomic_flows.sql:692`로 바로잡음)
- LA01-3 — 추가 🟠 (env가 기존 회원 승인에서도 `isAdmin`을 다시 스탬프함. 해제한 관리자가 재등록 때 복귀)
- 누락 점검: 세 export의 호출부(`resolve-member.ts:31-33`, `membership.ts:115`)와 SQL 스탬프 두 분기(`atomic_flows.sql:692-712`)를 따라갔고, 테스트 `approve-application-flow.test.ts:48-75`와 대조했다. `ARCHITECTURE.md` 행 번호는 HEAD 기준이다(작업 트리가 수정 중이다).
