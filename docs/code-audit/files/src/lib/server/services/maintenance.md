# `src/lib/server/services/maintenance.ts` (241줄)

**접두사 `LB24-`** · 잡3(일일 유지보수) 본체 — keep-alive SELECT, staging 정리, KST 일요일 주간 백업(B1 버킷 덤프 + B2 GitHub push + B1 8주 보존), 그리고 두 크론 라우트가 공유하는 dead-man's switch `pingHeartbeat`.

## LB24-1 🟠 주간 덤프는 "데이터베이스 전체"가 아니다 — 출석 큐와 감사 로그가 빠지고, 같은 저장소의 운영 스크립트는 셋 다 받는다

162-168행은 `TABLE_NAMES`만 돈다. 그래서 두 부류가 덤프에 없다.

| 빠진 것                         | 내용                                                                                                                                                                      | 근거                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `app_queues` (이벤트별 출석 큐) | 대기 중 체크인, 거절 행, 체크인 **시각**(`startTime`/`endTime`). 승인은 `activities.attendeeIds`에도 남지만(`atomic_flows.sql:593-602`) 시각과 대기·거절 행은 큐에만 있다 | `schemas/index.ts:19-23`이 큐를 레지스트리에서 뺐다 — `LA16-3`이 처방을 이 파일로 넘겼다 |
| `audit_log`                     | 탈퇴 수명주기의 파기 증거(§1-5) 전부                                                                                                                                      | 152-155행이 스스로 밝힌 누락                                                             |

152-155행이 누락의 이유로 든 전제 — "audit_log export needs a select API that is not yet on the store seam" — 는
**같은 저장소 안에서 이미 반증돼 있다.** `scripts/ops/ops-backup-db.mjs:34,44-45`는 `app_tables`·`app_queues`·`audit_log`
세 표를 각각 `select("*")`로 받는다. 큐 쪽은 seam에 `listQueueIds()`(`store.ts:108`)까지 있다.
즉 이 저장소에는 **백업 작성기가 둘 있고, "전체"의 정의가 서로 다르며, 자동으로 도는 쪽이 덜 완전하다.**

결과: 176-177행 주석대로 B2는 "프로젝트가 소멸하면 유일한 복구 경로"다. 그 경로로 복원하면 대기 중 출석과
체크인 시각(`(member)/events/manage/+page.server.ts:59`가 읽는다), 그리고 감사 로그가 통째로 사라진다.
`dumped`(166)는 "몇 개 표를 덤프했나"만 세므로 이 누락은 결과에도 드러나지 않는다.

**고침**: 덤프 대상을 "`app_tables` 전 행 + `app_queues` 전 행 + `audit_log`"로 정하고, 운영 스크립트와 같은 목록을 쓴다.
`audit_log`와 `app_queues`는 PostgREST Max rows(기본 1000)에 잘리므로 페이지 순회가 필요하다(`LA40-2`와 같은 함정).
**동작 변경**(덤프 내용·크기).

## LB24-2 🟠 백업 주기가 "오늘이 KST 일요일인가"에 걸려 있어, 한 번 놓치면 RPO가 두 배가 된다

231-238행: 일요일에만 `runWeeklyBackup`을 시도한다. 스펙은 B1의 목표를 **RPO ≤7일**로 적는다
(`SUPABASE-MIGRATION-SPEC.md:232`).

- 일요일 실행이 실패하면(업로드 오류, 172행) 그날은 `backup_failed: 1`로 500이 나간다. 그러나 **월~토 여섯 번의
  실행은 백업을 시도조차 하지 않으므로 초록**이다. 다음 시도는 7일 뒤 — 마지막 성공 덤프로부터 14일
- 스케줄러가 일요일 실행 자체를 놓치면(배포 사고, cron-job.org 장애) 실패 신호도 없다
- 잡은 매일 돈다. 따라서 "빠진 날을 다음 날 메울" 기회가 매일 있는데 쓰지 않는다

**고침**: "마지막 덤프가 7일 이상 됐으면 오늘 만든다"로 판정한다 — `listBackups("dumps")`(이미 132행이 쓴다)의
최신 `createdAt`을 본다. 일요일 고정이 필요하면 "일요일이거나, 마지막 덤프가 7일을 넘었으면"으로.
**동작 변경**(백업 시점).

## LB24-3 🟠 `runWeeklyBackup`의 선언된 반환 타입이 실패 신호를 숨긴다

```ts
157  export async function runWeeklyBackup(
158    now: Date = new Date(),
159  ): Promise<{ dumped: number; pushed: boolean }> {
...
179    return {
180      dumped,
181      pushed: push === "pushed",
182      ...(push === "failed" ? { backup_push_failed: 1 } : {}),
183    };
```

182행이 펼치는 `backup_push_failed`는 159행 타입에 없다. 스프레드로 들어간 초과 속성은 검사되지 않으므로 컴파일은 통과한다.
그런데 이 키가 **오프사이트 백업 실패가 경보에 닿는 유일한 통로**다 — 176-178행 주석이 그 이유로 만들었고,
`cron-status.test.ts:57-63`이 그 키를 전제로 한다. 지금은 233행의 `Object.assign`이 런타임 객체를 통째로 합쳐서 살아 있다.

타입을 믿고 233행을 `results.dumped = r.dumped; results.pushed = r.pushed`처럼 고치는 순간(타입상 완전한 복사다)
push 실패는 조용히 초록이 된다. 테스트도 잡지 못한다 — `maintenance.test.ts`에는 push가 **실패하는** 경우가 없고
(95-119행은 성공만), `cron-status.test.ts`는 손으로 만든 맵을 넣는다.

**고침**: 반환 타입에 `backup_push_failed?: 1`을 적는다(또는 LB24-5의 결과 타입으로). 그리고 `runMaintenance(SUNDAY)`가
PUT 실패 시 `backup_push_failed`를 내는지 보는 테스트 한 건. **구조만 바뀐다.**

## LB24-4 🟠 덤프가 한 시점의 스냅숏이 아니다 — 원자적 흐름이 반쪽으로 찍힐 수 있다

> **검증 정정**: 🟡 → 🟠, 그리고 사실 하나를 바로잡는다. 인과는 확인했다 — `flow_approve_application`은 신청 행을
> **지운다**(`atomic_flows.sql:782` `app_without`). 그래서 `members`(25행)·`private-info`(26행)를 읽은 뒤·`applications`(34행)를
> 읽기 전에 승인이 커밋되면 그 사람은 덤프 어디에도 없다. 결과는 LB24-1과 같은 부류다 — **복원이 커밋된 데이터를 말없이 잃는다**
> (여기서는 회원 한 명 전체). 두 지적을 가르는 것은 창의 크기, 즉 빈도뿐인데 빈도는 등급의 근거가 아니다(판정 기준).
> 그리고 표는 17개가 아니라 **18개**다(`schemas/index.ts:24-49`, `role-titles`까지). "확인했고 지적하지 않은 것"의 "표 17개"도 같다.

162-168행은 17개 문서를 **하나씩 순서대로** `readDoc`한다. 각 읽기가 별개 문장이므로 그 사이에 커밋된 흐름은
일부 표에만 반영된 채 덤프된다. `TABLES` 순서는 `members`, `private-info`, `registrations`, … `applications`
(`schemas/index.ts:24-36`)이고, `flow_approve_application`은 네 표를 한 트랜잭션에서 바꾼다
(`atomic_flows.sql:680`).

`members`를 읽은 뒤·`applications`를 읽기 전에 승인이 커밋되면 덤프에는 **회원 행도 없고 신청 행도 없다** —
복원하면 그 사람이 통째로 사라진다. ATOMIC-FLOWS가 없애려던 "반쪽 상태"를 백업이 다시 만든다.

**고침**: `app_tables`를 한 문장(`select name, doc`)으로 읽는다 — Postgres는 한 문장 안에서 일관된 스냅숏을 준다.
LB24-1의 세 표까지 한 시점으로 묶으려면 SQL 함수 하나(`backup_snapshot()`)가 필요하다. **동작 변경**(덤프 내용).

## LB24-5 🟡 실패의 철자가 셋이고, 결과 타입이 그것을 표현하지 못한다

| 단계       | 성공 키            | 실패 표기                     |
| ---------- | ------------------ | ----------------------------- |
| keep-alive | `keptAlive: true`  | `keptAlive: false` (221)      |
| staging    | `stagedRemoved: n` | `cleanup_failed: 1` (228)     |
| 백업       | `dumped`·`pushed`  | `backup_failed: 1` (236)      |
| B2 push    | —                  | `backup_push_failed: 1` (182) |

`keptAlive`만 불리언이라 `cronFailures`가 그 이름을 특별 취급한다(`cron-status.ts:16,23`). 새 단계를 더하는 사람은
`cron-status.ts`의 관례(`_failed`/`_errors` 접미사)를 알아야 하고, 이 파일의 214행 타입
`Record<string, number | boolean>`은 어떤 철자든 받는다.

게다가 `keepAliveSelect`(33-36)는 **항상 `true`를 반환한다** — 실패는 예외로만 표현되므로 218행의 값은 상수이고,
`keptAlive: false`는 catch(221)에서만 생긴다(`HL-5`). 불리언 반환은 정보가 없다.

**고침**: `keepAliveSelect(): Promise<void>`, 실패는 `keepalive_failed: 1`로 통일하고 `cronFailures`의 특례를 지운다.
결과 타입을 `{ [K in \`${string}_failed\`]?: 1 } & {...}`처럼 좁히거나 단계 목록을 선언형으로. **구조만 바뀐다**
(응답 JSON의 키 이름은 바뀐다 — 외부 감시자가 `keptAlive`를 읽는지 확인할 것).

## LB24-6 🟡 보존 정리의 실패는 경보에 닿지 않는다 — 같은 함수 안에서 두 정책

`pruneOldDumps`(129-146)는 모든 예외를 삼키고 `console.error`만 남긴다. 반면 바로 옆 B2 push 실패는
176-178행이 "경보에 닿아야 한다"며 `backup_push_failed`로 끌어올렸다. 한 백업 단계 안에서
"오프사이트 사본 실패"는 경보, "보존 정리 실패"는 로그로 갈린다.

보존 정리가 영구히 실패하면(버킷 권한 변경, `listBackups` 오류) `dumps/`는 매주 한 객체씩 무한히 쌓이고
아무도 모른다. 무료 플랜 Storage 한도를 쓰는 쪽이다.

**고침**: 삼키되 `backup_prune_failed: 1`을 반환해 census가 보게 한다("백업을 실패시키지 않는다"는 128행 계약은 유지).
**동작 변경**(실패 시 500).

## LB24-7 🟡 요일은 KST로, 파일 이름과 `generatedAt`은 UTC로 정한다

> **검증 정정**: 등급 유지. 마지막 문단의 셈이 틀렸다 — `KST_OFFSET_MS`는 `src` 안에서 **넷째** 정의다
> (`core/time.ts:5`, `core/semester.ts:8`, `domain/term.ts:10`, 이 파일 202행 — 스크립트까지 치면 여섯, `semester.md` 참조).
> 그리고 `LA06-2`는 검증에서 `LA09-3`의 중복으로 철회됐다 — 참조는 `LA09-3` 하나로 충분하다.

- 204-206행: 일요일 판정은 KST
- 170행: 파일 이름은 `now.toISOString().slice(0, 10)` — **UTC 날짜**
- 169행: `generatedAt`도 UTC `Z` 문자열. 저장소의 다른 시각은 전부 `+09:00`이다(`core/time.ts:3`)

잡3은 04:00 KST(= 전날 19:00 UTC)에 돈다(`maintenance.test.ts:34`). 그래서 **모든 일요일 덤프가 토요일 날짜로 이름 붙는다.**
테스트가 이를 그대로 고정한다 — `SUNDAY_KST = 2026-08-23T04:00+09:00`의 덤프 경로는 `dumpPathFor`(38-39)로
`dumps/2026-08-22.json`이다. 복구 시점을 고르는 사람은 파일 이름을 믿을 수 없다.

또 202행 `KST_OFFSET_MS`는 저장소의 다섯째 사본이다(`LA09-3`, `LA06-2`).

**고침**: `toKstIso(now).slice(0, 10)`으로 이름 짓고 `generatedAt: toKstIso(now)`. 요일 판정도 `core/time`의 헬퍼로.
**동작 변경**(파일 이름).

## LB24-8 🟡 외부 호출 세 곳에 시한이 없다 — "never throws"는 "never hangs"가 아니다

104·108행(GitHub contents API)과 196행(Healthchecks)의 `fetch`에 `signal`이 없다. 173행 주석은 push가
"never throws"라 해서 백업 단계가 잡을 가라앉히지 않는다고 말하지만, 응답 없는 연결은 던지지 않고 **기다린다.**
그러면 라우트는 플랫폼 타임아웃까지 반환하지 않고, 이미 끝난 staging 정리·업로드의 결과도 응답에 실리지 못한다.

**고침**: `AbortSignal.timeout(…)`을 세 호출에 붙이고 시한 초과를 `"failed"`로 분류한다. **동작 변경**(시한 초과 시 실패로 보고).

## LB24-9 🟡 두 크론이 공유하는 `pingHeartbeat`가 잡3 모듈에 산다

186-200행은 잡3 고유 기능이 아니다 — `cron/sync-events/+server.ts:5,24`도 이 파일에서 가져온다. 그래서
매시 도는 sync-events 라우트가 유지보수 모듈(→ `data/storage`, `data/schemas`)을 import한다.
크론 공용 모듈은 이미 있다 — `services/cron-status.ts`(두 라우트의 실패 census). 13-17행 모듈 주석이
"sync-events와 일부러 분리했다"고 하는 것과도 어긋난다.

**고침**: `pingHeartbeat`를 `cron-status.ts`로 옮긴다. **구조만 바뀐다.**

## LB24-10 🟡 B3 미러 정리는 구현되지 않았고, 그 TODO는 엉뚱한 함수 안에 있다

144-145행 TODO: "assets-mirror/ 90-day cleanup … Not implemented here." 스펙은 이것을 잡3의 몫으로 적는다
(`SUPABASE-MIGRATION-SPEC.md:237` "B3는 원본 삭제 후 90일 정리(잡 3)"). 미러는 승격마다 쓰인다(`uploads.ts:147`)
— 지우는 코드가 저장소에 없으므로 `backups/assets-mirror/`는 단조 증가한다.

그리고 TODO가 **덤프 보존 함수**(`pruneOldDumps`) 안, 일요일 분기에만 도는 자리에 있다. 잡3 목록(13-14행 모듈 주석)에는
B3가 나오지 않는다. 잡3이 무엇을 해야 하는지 보려는 사람은 `runMaintenance`를 읽고 이 누락을 보지 못한다.

**고침**: 구현 전까지 TODO를 `runMaintenance`의 단계 목록 자리와 모듈 주석으로 옮긴다(구조). 구현은 원본 삭제
추적이 필요하므로 별도 작업(동작 변경).

## 확인했고 지적하지 않은 것

- **keep-alive가 `readVersion`으로 캐시를 우회한다** (26-36) — `getTable`은 `withCache` 뒤라 Postgres에 닿지 않을 수 있다. 주석대로 정확하다
- **`listStagedFiles`의 폴더 판별이 `createdAt === ""`** (54) — `storage.ts:211-214`의 `listAll`이 폴더 행을 그렇게 표면화한다고 계약한다. 메모리 백엔드도 같은 모양이다(W-2 처리 결과, `PRIORITY.md`). 파일인데 `created_at`이 null이면 빈 폴더로 내려가 아무것도 지우지 않는 쪽으로 틀린다 — 안전한 방향이다
- **날짜를 해석할 수 없는 staging 파일은 지우지 않는다** (66-67) — 모르는 것을 지우지 않는 보수적 선택이다
- **같은 날 재실행이 멱등이다** — `uploadToBackups`는 `upsert: true`(`storage.ts:249`), GitHub 쪽은 기존 `sha`를 읽어 덮는다(102-107)
- **B2 미설정과 실패를 구분한다** (78, 86-95, 117-124) — `CM-5`가 지적한 `pushed: false` 이중 의미는 `PushOutcome` 3값으로 해소됐다. 미설정 경고가 프로세스당 한 번인 것(74-75)도 의도대로다
- **덤프에 PII가 들어가 외부 GitHub 저장소로 나간다** — 스펙 결정 S3(`SUPABASE-MIGRATION-SPEC.md:9`, private repo + fine-grained PAT `:204-205`)이다
- **`readDoc`의 원시 문서를 zod 디코드 없이 덤프한다** (163-165) — 백업은 저장된 그대로여야 한다. 옳다
- **단계별 try/catch 격리** (217-238) — 설계다. 라우트가 이제 `cronFailures`로 판정한다(`CM-4` 처리)
- **GET이 파괴적 부수효과를 낸다** — 라우트의 몫, `CM-3`
- **표 17개(검증: 18개)를 순차로 읽는 비용** — 주 1회, 수백 행. 성능 지적 대상이 아니다(스냅숏 문제는 LB24-4)

## LB24-11 🟡 B1 업로드가 실패하면 B2는 시도조차 되지 않는다 — 두 계층이 서로의 대비책이 아니게 묶였다 (검증 추가)

172행 `await uploadToBackups(path, body)`가 던지면 예외가 `runWeeklyBackup` 밖으로 나가 173행 `pushDumpToGitHub`에
도달하지 않는다(236행 `backup_failed: 1`). 그러나 스펙 §7 표에서 B1과 B2는 **다른 사고**에 대비한다 — B1은 "오염된 쓰기 롤백",
B2는 "프로젝트 단위 소멸(off-platform)"이다(`SUPABASE-MIGRATION-SPEC.md:232-233`). 플랫폼 Storage가 망가진 주가 바로
off-platform 사본이 가장 필요한 주인데, 그 주에 B2가 빠진다. 표의 B2 주기 "B1 직후"는 순서이지
"B1이 성공하면"이라는 조건이 아니다 — B2가 올리는 것은 이미 메모리에 있는 같은 본문이다.

LB24-6과 맞물린다: 보존 정리가 조용히 실패해 `dumps/`가 무료 플랜 Storage 한도를 채우면, 그 뒤로는 매주 B1 업로드가 실패하고
**B2도 매주 건너뛴다** — 두 백업이 한꺼번에 멈춘다. 실패 자체는 `backup_failed`로 500이 되므로 조용하지는 않다(그래서 🟡).

**고침**: 덤프 본문은 이미 메모리에 있으므로 B1·B2를 독립 시도하고(`Promise.allSettled` 또는 각자 try) 실패를
`backup_upload_failed`·`backup_push_failed`로 따로 보고한다. **동작 변경**(B1 실패 주에도 B2가 나간다).

## 커버리지

`maintenance.test.ts`는 정상 경로만 본다. **B2 push 실패(`backup_push_failed`), 보존 정리 실패, staging 삭제 실패,
keep-alive 실패의 단계 격리**가 전부 미검증이다. `cron-status.test.ts`는 손으로 만든 결과 맵을 넣으므로
이 파일이 실제로 그 키를 내는지는 보지 않는다(LB24-3).

## 검증 (2026-09-28)

- LB24-1 — 확인 (`LA16-3`과 중복 아님: LA16-3은 레지스트리 주석의 오해를 맡고 백업 누락의 처방을 명시적으로 이 문서에 넘겼다(`schemas/index.md:49-52`). 결함의 주인은 여기다. 인용 `ops-backup-db.mjs:34,44-45`·`store.ts:108`·`atomic_flows.sql:593-602`·`events/manage/+page.server.ts:59` 모두 맞다)
- LB24-2 — 확인 (`vercel.json`의 최후 심장은 sync-events만 부르므로 일요일 두 번째 기회도 없다. Healthchecks 체크는 매시 sync-events 핑과 공유라 일요일 한 번의 누락을 잡지 못한다)
- LB24-3 — 확인 (스프레드 속성은 초과 속성 검사 대상이 아님. `maintenance.test.ts`에 push 실패 케이스 없음을 확인)
- LB24-4 — 정정 (🟡 → 🟠. 승인 흐름이 신청 행을 삭제하므로 "사람이 통째로 사라진다"가 참이다. 결과가 LB24-1과 같은 부류이고 차이는 빈도뿐. 표 개수 17 → 18)
- LB24-5 — 확인 (`HL-5`와 `keepAliveSelect` 반환값 부분이 겹치나 이 지적의 본체는 결과 타입·철자 문제라 교차 참조로 둔다)
- LB24-6 — 확인
- LB24-7 — 정정 (등급 유지. 오프셋 상수는 src 안 넷째 정의, `LA06-2`는 철회됨)
- LB24-8 — 확인
- LB24-9 — 확인
- LB24-10 — 확인 (`uploads.ts:147`이 미러를 쓰고 지우는 코드는 없음)
- LB24-11 — 추가 (B1 실패가 B2를 막는다)
- 누락 점검: 241줄 전부를 문서 없이 다시 읽었다 — staging 재귀·TTL 필터, GitHub PUT의 sha 처리(비 404 GET 실패 → sha 없는 PUT → 422 → `"failed"`로 정상 보고됨), 보존 정리가 업로드 성공 뒤에만 도는 순서, 단계 격리, 라우트의 `cronFailures` 판정. 새 지적은 LB24-11 하나.
