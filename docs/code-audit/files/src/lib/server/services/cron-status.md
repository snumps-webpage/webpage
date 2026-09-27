# `src/lib/server/services/cron-status.ts` (30줄)

**접두사 `LB19-`** · 크론 결과 맵에서 실패 키를 골라내는 집계(`cronFailures`). 소비자는
`api/cron/sync-events/+server.ts:16`과 `api/cron/maintenance/+server.ts:21` — 비어 있지 않으면 500, 비어 있으면 heartbeat ping.

## LB19-1 🟠 실패 표기 규약을 소비자만 알고, 모르는 표기는 성공으로 읽힌다

18-30행은 **이름 규칙으로** 실패를 알아본다(`_failed` 접미사, `_errors` 접미사, `keptAlive` 키 이름).
생산자(`events.ts:378-392` `runCron`, `maintenance.ts:212-240` `runMaintenance`, `runWeeklyBackup`)의 반환 타입은
`Record<string, number | boolean>`이라 **그 규칙을 지키도록 강제하는 것이 없다.**
규칙 밖의 표기는 27행 `return false` — 즉 **초록**으로 떨어지고, 경보(500)도 dead-man's switch 억제도 일어나지 않는다.

이것은 가정이 아니라 이미 한 번 일어난 일이다: 주간 백업 푸시 실패는 `pushed: false`로 표기돼 "미설정"과
구별되지 않았고 집계를 통과했다(`maintenance.ts:176-178` 주석, `cron-status.test.ts:56-67`
"signals that used to slip through"). 수정은 **생산자에 네 번째 표기(`backup_push_failed`)를 추가**하는 것이었다 —
규칙이 생산자 쪽에 없으니 고칠 곳도 사례별이다.

알람 경로에서 "모르면 성공"은 틀린 기본값이다. 생산자가 실패를 명시적 채널로 내게 하면
(예: `{ counts, failures: string[] }` 또는 공용 `markFailed(results, step)`) 이 파일의 이름 규칙이 사라진다.
구조 변경이며 라우트 응답 모양이 조금 바뀐다.

## LB19-2 🟡 `_errors` 표기에 생산자가 없다

15행 주석과 25-26행은 "step이 항목별 오류를 삼키고 `<phase>_errors: n`으로 보고한다"는 표기를 처리한다.
그 표기를 쓰던 유일한 생산자(`generate-study-sessions`의 `generation_errors`)는 `40891fd`에서 삭제됐다.
`src` 전체에서 `_errors`를 쓰는 비테스트 코드는 이 파일뿐이다(`cron-status.test.ts:31-34`만 남아 있다).
11행 "Failure is spelled three ways"는 현재 두 가지다. 죽은 분기 + 낡은 주석. 동작 변화 없이 지울 수 있다
(LB19-1을 하면 함께 사라진다).

## LB19-3 🟡 `keptAlive`는 생산자 한 곳의 키 이름이 일반 집계에 박힌 것이다

23행. `keepAliveSelect()`는 항상 `true`를 반환하고 실패는 throw로만 표현한다(`maintenance.ts:33-36`,
`api/health/+server.md` HL-5). 따라서 `keptAlive: false`는 "`runMaintenance`의 catch가 돌았다"와 같은 뜻이고,
형제 단계들은 그것을 `cleanup_failed: 1`·`backup_failed: 1`로 쓴다(`maintenance.ts:228,236`).
같은 사실을 다른 철자로 적었기 때문에 집계가 특정 키 이름을 알아야 한다. 생산자가 `keepalive_failed: 1`로
쓰면 23행이 사라진다. 구조만(응답의 `keptAlive` 필드는 바뀐다).

## 확인했고 지적하지 않은 것

- **`_failed`의 값 검사(24행)** — `!== 0 && !== false`. 생산자는 항상 `1`을 쓰지만, 0/false를 "실패 아님"으로
  읽는 것은 접미사 규칙 안에서 합리적이다
- **`steps_total`을 보지 않는 것** — 단계 수 0인 `runCron`도 초록이다. 그러나 그 신호의 결함은 생산자 쪽
  (`events.ts` 문서 LB20-6)이 더 정확한 위치다
- **결과 키 평면의 충돌** — PRIORITY W-12(스텝 키·`success`/`failures` 덮어쓰기)가 다루고 아직 열려 있다.
  이 파일은 키를 읽기만 한다
- **테스트** — `cron-status.test.ts`가 세 표기와 과거 누락 사례를 고정한다. 순수 함수라 충분하다

## 검증 (2026-09-28)

- LB19-1 — 확인 (27행 기본값 `false`, 생산자 반환 타입 `Record<string, number | boolean>`, `maintenance.ts:176-182`의 `backup_push_failed` 사후 추가 확인)
- LB19-2 — 확인 (`src`의 비테스트 코드에서 `_errors`는 이 파일뿐. `40891fd`가 `generate-study-sessions` 단계를 지웠다)
- LB19-3 — 확인 (`keepAliveSelect`는 `true`만 반환, 형제 단계는 `cleanup_failed`·`backup_failed`)
- 누락 점검: 두 소비 라우트(`api/cron/sync-events`, `api/cron/maintenance`)와 함께 다시 읽었다. 결과 키 충돌(`success`·`failures` 덮어쓰기)은 초판이 W-12로 넘긴 그대로이고, 이 파일에서 새로 볼 결함은 없다. 추가 지적 없음.
