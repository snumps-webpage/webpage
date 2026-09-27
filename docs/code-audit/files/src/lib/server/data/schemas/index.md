# `src/lib/server/data/schemas/index.ts` (80줄)

**접두사 `LA16-`** · 테이블 레지스트리(`TABLES`)와 봉투 스키마·버전, 전 스키마 모듈의 배럴.

## LA16-1 🟡 스키마 버전이 두 곳(이상)에 따로 적혀 있고, 버전 분기는 존재하지 않는다

59행 `z.object({ schemaVersion: z.literal(1), rows: … })`와 61행 `export const SCHEMA_VERSION = 1`은 서로를 참조하지
않는다. 쓰기는 `SCHEMA_VERSION`으로 봉투를 만들고(`tables.ts:130,147`) 읽기·쓰기 검증은 리터럴 `1`로 한다
(`tables.ts:74,129`). 같은 숫자가 SQL(`atomic_flows.sql:43,540`), `scripts/seed-dev.ts:384`,
`scripts/migration/20-export-tables.ts:578,636`, `scripts/ops/*.mjs`에도 리터럴로 있다.

결과: `SCHEMA_VERSION`을 2로 올리면 읽기는 그대로 성공하고 **모든 `mutate`가 `VALIDATION_FAILED`로 거부된다**
(`tables.ts:129-138` — 봉투는 2를 들고 스키마는 1만 받는다). 57행 주석은 "field-shape changes can branch on version"이라
약속하지만 봉투가 `1`만 받으므로 분기할 지점이 없다 — 버전을 올리는 순간 옛 문서가 읽히지 않는다.

처방: `z.literal(SCHEMA_VERSION)`으로 원천을 하나로 묶고, 주석을 "버전 분기는 아직 없다 — 올리려면 읽기 쪽 이행 코드가
먼저"로 고친다. 동작 변경 없음. SQL·스크립트의 리터럴은 SQL이 TS 상수를 볼 수 없으므로 남되, 주석이 그 사실을 적어야
한다.

## LA16-2 🟡 "절대 쓰지 않는" 기록 보관 테이블이 살아 있는 스키마에 묶여 있다

> **검증 정정**(사실 한 곳, 등급 유지): 결과 1의 "아카이브 행은 운영 전용 필드(`isAdmin`, `withdrawal`,
> `legacyMemberId`, `sourceRequestId`)까지 갖춰야 한다"에서 `legacyMemberId`는 빼야 한다 — `member.ts:40`이
> `.default(null)`이라 키가 없어도 디코드된다. 또 "enum을 좁히면(`LA21-1`의 상태 추가·제거)"에서 아카이브를 깨는 것은
> **제거·좁힘**뿐이고 추가는 깨지 않는다. 나머지(디코드 실패 시 `tables.ts:73-81`이 던짐, `FROZEN_TABLES` 120초,
> `mutate("legacy-members", …)`가 타입 검사를 통과함, 승인 흐름의 `roles`·`project` 복사 `atomic_flows.sql:742,745`)는 확인했다.

29-31행: `"legacy-members": MemberSchema`, `"legacy-private-info": PrivateInfoSchema`, 주석 "순수 기록용 아카이브.
운영 로직은 절대 쓰지(write) 않는다".

결과 둘:

1. **운영 스키마를 조이면 동결된 아카이브가 읽히지 않는다.** `MemberSchema`에 기본값 없는 필수 필드를 더하거나 enum을
   좁히면(예: `LA21-1`의 상태 추가·제거) `legacy-members` 문서 디코드가 실패하고(`tables.ts:73-81`은 조용한 대체 없이
   던진다) `getTable("legacy-members")`가 매 요청 500이 된다 — `tables.ts:36-39`에 따르면 아카이브 레이아웃과 루트
   레이아웃 푸터가 **모든 요청**에서 읽는다. 복구는 "절대 쓰지 않는" 문서를 수동으로 이행하는 것뿐이다.
   아카이브 행은 운영 전용 필드(`isAdmin`, `withdrawal`, `legacyMemberId`, `sourceRequestId`)까지 갖춰야 한다.
2. **"쓰지 않는다"는 주석일 뿐이다.** `tables.ts:46-49`의 `FROZEN_TABLES`가 이 주석을 근거로 로컬 TTL을 120초로
   늘렸지만(`tables.ts:32-44`), `mutate("legacy-members", …)`는 타입 검사를 통과한다. 쓰기가 생기면 다른 인스턴스가
   최대 2분 옛 행을 서빙한다 — 현재 쓰는 곳이 없다는 것은 README 판정 기준상 감면 근거가 아니다.

공유에는 이유가 있다 — 승인 흐름이 아카이브의 `roles`·`project`를 운영 행으로 복사한다(`atomic_flows.sql:742,745`).
처방: 아카이브용 스키마를 운영 스키마에서 **파생하되 분리**하고(`MemberSchema.pick(...)` 또는 별도 정의 + 복사 필드
호환 테스트), 레지스트리에 읽기 전용 표시를 두어 `mutate`의 타입에서 뺀다. 구조 변경만.

## LA16-3 🟡 레지스트리 주석이 자신을 "저장되는 모든 것"이라 부르지만 큐는 빠져 있고, 그렇게 믿는 소비자가 있다

> **검증 정정**(주장 축소, 등급 유지 — 남는 것은 "S3" 잔재): 백업 누락이라는 **사실은 맞고**, 경로를 둘로 갈라 확정했다.
>
> | 경로                                                              | 받는 것                                                                                                      | `app_queues` |
> | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------ |
> | 주간 B1/B2 `runWeeklyBackup`(`maintenance.ts:157-184`)            | `TABLE_NAMES` 순회 `readDoc("table", name)` = `app_tables`만. `audit_log`도 명시적 TODO로 건너뜀(`:152-155`) | **없음**     |
> | 수동 `scripts/ops/ops-backup-db.mjs`(배포 전 롤백용, 로컬 파일만) | `["app_tables", "app_queues", "audit_log"]`(`:34`) `select *`                                                | **있음**     |
>
> 레포의 `backups/supabase-2026-09-17T*.json` 두 개(gitignore됨, `.gitignore:67`)는 최상위 `tables` 키가
> `app_tables`·`app_queues`·`audit_log`임을 키만 출력해 확인했다(내용은 열지 않았다). 즉 큐가 들어간 사본은 **사람이
> 손으로 돌린 로컬 스냅숏뿐**이고, 예약된 off-platform 백업(B2 — 프로젝트 소멸 시 유일한 복구 경로)에는 큐도 감사
> 로그도 없다. `ops-backup-db.mjs:8`은 "주간 백업(`backups/dumps/`)은 비어 있다 — 한 번도 만들어지지 않았다"고 적는다.
>
> 그러나 **이 파일에 귀속된 부분은 성립하지 않는다.** 19-23행 주석은 "The attendance queue is deliberately NOT
> here"라고 큐를 **명시적으로 제외**한다 — "레지스트리 = 저장된 전부"라는 오해를 조장하지 않는다. 소비자 쪽 주석도
> "every app_tables document"(`maintenance.ts:149`)라고 정확히 말한다. 두 주석 모두 참이고, 빠진 것은 스펙 B1 표
> (`SUPABASE-MIGRATION-SPEC.md:232` "전 `app_tables`+`audit_log`")와 그 구현이다. 이 파일에 남는 결함은 20행의 "S3"
> 잔재(`LA13-4`가 이 행을 이 번호로 가리킨다) 하나다. 백업 누락은 `services/maintenance.ts` 리뷰의 몫인데 **그 문서가 아직
> 없다** — 귀속처가 생길 때까지 이 기록이 유일하다. 또 "`TABLE_NAMES`의 유일한 소비자"는 앱 코드 기준으로만 맞다
> (`scripts/measure/inject/probe-server.ts:34`도 쓴다 — 실측 하네스).

19-23행: "the single source of truth for what lives in S3 … The attendance queue is deliberately NOT here".
(S3는 이관 전 잔재 — 현재는 Postgres `app_tables`/`app_queues`, `store.ts:4-13`.)

`TABLE_NAMES`(55행)의 유일한 소비자는 주간 백업이다 — `runWeeklyBackup`이 `for (const name of TABLE_NAMES)`로
문서를 덤프한다(`services/maintenance.ts:162-168`). 그래서 **출석 큐(`app_queues`)는 B1/B2 백업에 들어가지 않는다.**
승인 전 출석 요청과 그 이력은 백업에서 복구할 수 없다. `listQueueIds()`(`store.ts:108`)는 이미 있다.

판정: 스펙 B1은 "전 `app_tables`+`audit_log`"라 적는다(`SUPABASE-MIGRATION-SPEC.md:232`) — 큐를 **명시적으로 제외한
결정은 없고** 표가 큐를 언급하지 않을 뿐이다. 그러므로 닫힌 결정의 재제기가 아니다. 이 파일의 몫은 "레지스트리 =
저장된 전부"라는 오해를 주석이 조장한다는 점이고, 백업 누락 자체의 처방은 `maintenance.ts` 리뷰의 몫이다.
주석 수정(구조), 백업 보완은 동작 변경.

## 확인했고 지적하지 않은 것

- **SQL 흐름이 쓴 행이 zod 게이트를 거치지 않는다** — ATOMIC-FLOWS §3이 설계로 받아들이고 `expectTablesValid`
  (`expect-tables-valid.ts:17-55`)가 흐름 테스트마다 엄격 디코드·기본값 의존 거부로 막는다. 레지스트리가 "단일 원천"이라는
  주장은 이 테스트로 뒷받침된다. 다만 흐름 **입력**이 게이트를 우회하는 사례가 있다 — `LA26-2`
- **`envelope(schema)`가 호출마다 새 zod 객체를 만든다**(`tables.ts:74,129`) — 디코드는 버전이 바뀔 때만 일어난다
  (`tables.ts:100`). 측정할 만한 비용이 아니다
- **`TABLE_NAMES`의 `as TableName[]` 단언** — `Object.keys`의 표준 한계. `as const` 객체라 안전하다
- **배럴 `export *`(63-80행)** — `LA13-1`의 이름 충돌은 배럴이 아니라 `common.ts`의 별칭 탓이다
- **테이블별 한국어 주석(27-49행)** — 대응 스키마 파일 주석과 일치함을 확인했다

## 검증 (2026-09-28)

- LA16-1 — 확인 (`tables.ts:74,129` 리터럴 봉투, `:130,147` `SCHEMA_VERSION`, SQL `atomic_flows.sql:43,540`, `seed-dev.ts:384`, `20-export-tables.ts:578,636` 일치. 2로 올리면 쓰기 전부가 게이트에서 거부된다는 인과도 맞다)
- LA16-2 — 정정 (사실 한 곳: `legacyMemberId`는 기본값이 있어 필수가 아니다. 등급 유지)
- LA16-3 — 정정 (백업 누락 사실은 확인하고 경로별로 확정 — 주간 B1/B2에는 큐·감사 로그 없음, 수동 `ops-backup-db.mjs`에만 있음. 이 파일 주석이 오해를 조장한다는 주장은 철회 — 주석이 큐를 명시적으로 제외한다. 등급 🟡 유지, 남는 결함은 "S3" 잔재)
- 누락 점검: 80행 재독. `envelope`의 `rows: z.array(row)`가 한 행의 오류로 표 전체를 거부하는 것은 `tables.ts:126-128`이 설계로 밝힌 성질이다. 확인 항목의 "`expectTablesValid`가 엄격 디코드"는 최상위 객체에만 `.strict()`가 걸린다(`expect-tables-valid.ts:25` — 중첩 객체의 모르는 키는 잡지 못한다)는 한정이 붙어야 하나, 귀속은 그 파일이다. 추가 없음
