# `src/routes/api/cron/maintenance/+server.ts` (27줄)

**접두사 `CM-`** · 잡3. staging 정리 + keep-alive SELECT + 일요일 백업 분기.

> **검증 결과 반영 (2026-09-09).** 초판의 `CM-3`은 인과가 반대였다 — `runMaintenance()`가
> 부분 실패에 던진다고 적었으나 실제로는 단계별로 삼킨다. 그 오류를 정정하면서
> **정반대 방향의 🔴 결함(CM-4)** 이 드러났다. 경위는 문서 말미 "정정 기록" 참조.

> **재검증: 메커니즘 CONFIRMED, 심각도 🔴 → 🟠 · 수정 완료 (2026-09-10).**
> 단계가 catch를 뚫을 수 없고 catch가 도달 불가라는 점은 그대로다. **인과 서사가 틀렸다:**
>
> | 초판 주장                               | 실제                                                                                                                                                       |
> | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | keep-alive 실패 → Supabase pause 미탐지 | `/api/health`가 **동일한** `keepAliveSelect()`를 부르고 실패 시 **500**을 낸다. DB가 닿으면 잡2가 타이머를 리셋하고, 안 닿으면 잡2가 시끄럽게 실패한다     |
> | ping 억제가 스위치를 빨갛게 만든다      | `OPERATOR-TODO.md:155`가 **체크 1개** 공유를 지시한다. `sync-events`가 매시 같은 체크를 누르므로 **maintenance만 억제해도 한 시간 안에 초록으로 돌아온다** |
> | 지금 거짓 초록 경보가 난다              | `HEALTHCHECKS_PING_URL` 미등록 → ping 자체가 무동작. 잠재 상태다                                                                                           |
>
> 남는 진짜 결함은 **정직하지 않은 HTTP 상태**이고, 특히 **주간 백업**이다 —
> `runWeeklyBackup`에는 대체 경로가 레포 어디에도 없어서 영구 실패가 복구 시점까지 안 보인다.
>
> **수정**: `cronFailures()` 판정 후 실패 시 ping 생략 + 500. `CS-5`와 같은 형태.
> **운영 항목으로 남는 것**: 체크가 1개인 한 ping 억제는 장식이다 — 잡별 체크로 나누는 것은
> 스펙·운영 변경이다(`OPERATOR-TODO` 5절).

## CM-4 🔴 세 작업이 전부 실패해도 `success: true`를 반환하고 dead-man's switch를 누른다

```ts
18  try {
19    const results = await runMaintenance();
20    // Dead-man's switch (§5-3): ping ONLY on the success path.
21    await pingHeartbeat();
22    return json({ success: true, ...results });
```

`runMaintenance()`는 **단계마다 자체 try/catch로 격리하고 실패를 플래그로 반환한다**
(`services/maintenance.ts:183-212`) — 자기 독스트링이 그렇게 적고 있다(180-182행:
"Each phase is try/catch-isolated like runCron").

| 단계                   | 실패 시                      | 던지는가 |
| ---------------------- | ---------------------------- | -------- |
| keep-alive (188-193)   | `results.keptAlive = false`  | 아니오   |
| staging 정리 (195-200) | `results.cleanup_failed = 1` | 아니오   |
| 일요일 백업 (202-209)  | `results.backup_failed = 1`  | 아니오   |

따라서 19행은 실질적으로 던지지 않고, **23행의 catch는 작업 실패에 대해 도달 불가**다.
세 작업이 모두 실패해도 흐름은 그대로 20→22행으로 간다:

```
{ success: true, keptAlive: false, cleanup_failed: 1, backup_failed: 1 }   HTTP 200
```

**20행의 주석이 코드가 하는 일과 다르다.** "ONLY on the success path"라고 적혀 있지만
실패 경로가 존재하지 않으므로 ping은 무조건 눌린다. 라우트는 `results`를 읽지 않는다.

### 왜 🔴인가 — 침묵을 감지하려고 만든 장치가 침묵을 덮는다

`pingHeartbeat`의 독스트링(`maintenance.ts:157-161`)이 목적을 명시한다:

> Healthchecks' grace window catches every silence mode — scheduler death,
> deploy accidents, and **project pause** alike.

그런데 project pause를 막는 것이 바로 `keepAliveSelect()`다.
그 함수는 캐시를 우회해 실제 Postgres를 건드리도록 일부러 `readVersion`을 쓴다
(`maintenance.ts:28-36`, 주석이 근거를 밝힘) — Supabase 무료 티어의 7일 비활동 pause 타이머를
리셋하는 유일한 수단이다.

**keep-alive가 매일 실패해도 Healthchecks는 계속 초록이다.**
탐지하려던 정확히 그 상태에서 경보가 울리지 않는다. 주간 백업도 같다 —
복구가 필요해질 때까지 실패를 아무도 모른다.

**처방**: 22행 전에 `results`를 검사한다. `keptAlive === false`이거나 `*_failed` 키가 있으면
ping을 건너뛰고 비200으로 응답한다. `runCron()`도 같은 구조이므로(`events.ts:369-380`)
`sync-events`에 동일 처리가 필요하다 → `CS-5`.

## CM-1 🟠 `sync-events`의 인증 블록 복제본

9-16행이 `api/cron/sync-events/+server.ts:12-19`와 **주석 포함 완전 동일**하다
(`diff`로 확인 — 차이 없음). 셋째 사본이 `api/health/+server.ts:9-16`에 있다.
`requireCronAuth` 같은 공통 헬퍼는 레포에 존재하지 않는다.

근거·처방은 `CS-1` 참조. → `CROSS-CUTTING.md` XC-7

## CM-2 🟡 시크릿 비교가 상수 시간이 아니다

14행. `crypto.timingSafeEqual`은 레포 어디에도 쓰이지 않는다 —
세 크론/헬스 관문이 모두 같다. CM-1의 공통 헬퍼를 만들 때 함께 처리하면 된다.
`CS-2` 참조.

## CM-3 🟡 GET이 파괴적·비멱등 부수효과를 낸다

```ts
8   export const GET: RequestHandler = async ({ request }) => {
```

이 GET이 전이적으로 실행하는 것: 스토리지 객체 삭제(`maintenance.ts:56 removeStaged`),
백업 업로드(`150 uploadToBackups`), 외부 GitHub 저장소에 contents `PUT`(`86`),
오래된 백업 삭제(`118 removeBackups`).

**삭제와 외부 쓰기를 안전 메서드 뒤에 두었다.** 프리페치·크롤러·재시도가
의도치 않게 트리거할 수 있는 형태다. 지금은 Bearer가 막고 있으나,
메서드 선택 자체가 계약을 잘못 표현한다.

## CM-5 🟡 외부 스케줄러에 주는 응답의 모양이 고정돼 있지 않다

22행이 `results`를 그대로 펼친다. 그런데 키 집합이 실행 결과에 따라 달라진다:

| 상황      | 나타나는 키                                   |
| --------- | --------------------------------------------- |
| 정리 성공 | `stagedRemoved` (숫자)                        |
| 정리 실패 | `stagedRemoved` **없음**, `cleanup_failed: 1` |
| 평일      | 백업 키 없음                                  |
| 일요일    | `dumped` · `pushed`                           |

감시자는 **"실행 안 됨"과 "실패함"을 구분하려면 KST 요일을 스스로 계산해야 한다.**
게다가 `GITHUB_BACKUP_REPO`/`TOKEN`이 비어 있으면 `pushed: false`가 정상값이다
(`maintenance.ts:67-73`) — **한 번도 일어나지 않은 오프사이트 백업이
`success: true` 페이로드 안에서 보고된다.**

## 확인했고 지적하지 않은 것

- **`CRON_SECRET` 미설정 시 501 fail-closed**(10-12행) — 시크릿 부재를 "인증 없음"으로 처리하지 않는다. 올바르다
- ~~"성공 경로 전용 ping — 올바르다"~~ — **초판의 이 문장이 CM-4를 정면으로 승인했다.** 정정 기록 참조

## 정정 기록

초판 `CM-3`: "부분 실패도 전체 500이 되고 `pingHeartbeat()`도 건너뛴다."
**틀렸다.** 네 주장 모두 사실이 아니다 — 200을 반환하고, ping은 실행되며,
실패 플래그는 호출자에게 전달되고, `backup_failed`와 `keptAlive`는 별개 키다.

원인은 **`maintenance.ts`를 열지 않고 `CS-4`에서 추론한 것**이다.
초판은 세 지적이 전부 `CS-` 참조였고, 유일하게 이 파일 고유의 추론을 시도한 곳에서 틀렸다.

같은 오류가 `CS-4`에도 있다 — `runCron()` 역시 스텝별로 격리한다(`events.ts:369-380`).
`CS-` 문서에서 정정하고 `CS-5`를 추가했다.

그리고 초판의 "확인했고 지적하지 않은 것"이 **`pingHeartbeat` 호출을 명시적으로 승인**했다.
다른 파일의 면제 판정을 이 파일의 호출 대상을 재확인하지 않고 복사한 결과다.

> **교훈**: 교차 참조는 지적을 옮길 수 있지만 **면제는 옮길 수 없다.**
> `sync-events`에서 옳은 승인이 `maintenance`에서는 결함 승인이 된다.

## 커버리지

`services/maintenance.test.ts:107-127`은 월요일·일요일 정상 경로만 검증한다.
**단계 실패 격리를 검증하는 테스트가 없다** — 테스트 스위트도 CM-4를 잡지 못한다.
