# `src/routes/api/cron/sync-events/+server.ts` (30줄)

**접두사 `CS-`** · Bearer 인증 크론 진입점. `runCron()` 실행 후 heartbeat ping.

> **검증 반영 (2026-09-09).** 초판 `CS-4`는 사실이 아니었다 — `runCron()`은 스텝별로 삼키고
> 던지지 않는다. 정정 과정에서 **정반대의 🔴 결함(CS-5)** 이 드러났다. 말미 "정정 기록" 참조.

> **재검증 CONFIRMED · 수정 완료 (2026-09-10).** 스텝·`pingHeartbeat` 모두 catch를 뚫을 수
> 없고, `handleError` 훅도 없으며, `*_failed`를 읽는 소비자도 없음을 확인했다.
> **한 가지 좁힘**: `HEALTHCHECKS_PING_URL`이 아직 미등록(`OPERATOR-TODO` 3·5절 ⬜)이라
> ping은 현재 무동작이다 — HTTP 200이 cron-job.org 실패 경보를 막는 쪽이 지금 살아 있는 결함이고,
> heartbeat 쪽은 운영 항목이 완료되는 순간 발동한다.
>
> **그리고 초판 처방에 구멍이 있었다.** `studySessionCronStep`이 항목별 실패를 자체적으로
> 삼키고 `{generated}`만 반환하므로(`studies.ts:315-322`), `*_failed` 검사만으로는
> **전 항목이 실패한 실행도 통과한다.**
>
> **수정**: ① `studies.ts`가 삼킨 실패를 `generation_errors`로 표면화,
> ② `runCron`이 `steps_total`을 붙여 부분/전체 실패를 구별 가능하게,
> ③ `services/cron-status.ts`의 `cronFailures()`가 세 가지 실패 표기(`_failed`·`_errors`·
> `keptAlive:false`)를 한 곳에서 판정, ④ 라우트가 실패 시 ping을 건너뛰고 **500**을 반환.
> **HTTP 상태가 핵심이다** — cron-job.org는 상태로 경보하고, 그것이 현재 설정된 유일한 알람이다.

## CS-5 🔴 크론이 전부 실패해도 `success: true`를 반환하고 dead-man's switch를 누른다

```ts
21  try {
22    const results = await runCron();
23    // Dead-man's switch (SUPABASE-MIGRATION-SPEC §5-3): ping ONLY on success.
24    await pingHeartbeat();
25    return json({ success: true, ...results });
```

`runCron()`은 **모든 스텝을 try/catch로 감싸고 실패를 플래그로 바꾼다**(`services/events.ts:369-380`):

```ts
371  for (const step of cronSteps) {
372    try { Object.assign(results, await step.run()); }
373    catch (e) { results[`${step.name}_failed`] = 1; }
374  }
```

따라서 22행은 던지지 않고 **26-29행의 catch는 스텝 실패에 대해 도달 불가**다.
`{"error":"Sync failed"}`는 발생할 수 없다. 모든 스텝이 실패한 실행도 이렇게 끝난다:

```
{ success: true, generate-study-sessions_failed: 1, expire_failed: 1 }   HTTP 200
```

**23행 주석이 코드가 지키지 않는 불변식을 서술한다.** 여기서 "success"는
"라우트가 죽지 않았다"는 뜻일 뿐이다. 라우트는 `results`의 `*_failed` 키를 읽지 않는다.

dead-man's switch는 **침묵만 감지한다** — "돌긴 하는데 아무것도 못 하는" 크론은 못 잡는다.
`maintenance` 엔드포인트에 동일 결함이 있고 거기서는 keep-alive와 얽혀 더 나쁘다 → `CM-4`.

**처방**: 25행 전에 `results`를 검사해 `*_failed`가 있으면 ping을 건너뛰고 비200으로 응답한다.

## CS-1 🟠 Bearer 검사 블록이 세 엔드포인트에 그대로 복제돼 있다

12-19행이 `api/cron/maintenance/+server.ts:9-16` · `api/health/+server.ts:9-16`과
**주석(`// Fail-closed (BE-04)`) 포함 바이트 단위로 동일**하다(`diff` 무차이 확인).
`requireCronAuth` 같은 공통 헬퍼는 레포에 없다.

`OPERATOR-TODO.md` 4절이 이 관문을 쓰는 cron-job.org 잡 3개를 예고하므로 넷째 복사본이 예정돼 있다.
인증 규약이 바뀌면 세 곳을 동시에 고쳐야 하고, 하나를 빠뜨리면 그 엔드포인트만 조용히 다른 규약이 된다.

**처방**: `requireCronAuth(request): Response | null` 하나. → `CROSS-CUTTING.md` XC-7

## CS-2 🟡 시크릿 비교가 상수 시간이 아니다

17행. `crypto.timingSafeEqual`은 레포 어디에도 없다.

**심각도를 올리지 않는 이유**: 원격 HTTP 왕복 지터가 바이트당 차이보다 몇 자릿수 크다.
그러나 비교 대상이 시크릿이라는 사실은 변하지 않는다.

**단, 초판이 적은 처방("바꾸는 비용이 거의 없다")은 틀렸다.**
`timingSafeEqual`은 두 버퍼 길이가 다르면 `RangeError`를 던진다. `authHeader`는 공격자가
완전히 통제하므로 그대로 바꾸면 길이가 다른 헤더마다 401이 아니라 **500**이 나고 길이도 여전히 샌다.
올바른 형태는 **양쪽을 sha256으로 해시한 뒤 고정 길이 다이제스트를 비교**하는 것이다
(`authHeader === null`도 함께 처리된다).

## CS-3 🟠 모듈 최상위 등록이 테스트와 프로덕션의 스텝 목록을 갈라놓았다

```ts
9   registerCronStep(studySessionCronStep);
```

> **초판 정정**: "레지스트리가 오염된다"는 틀렸다. `registerCronStep`은 이름으로 중복을 막는다
> (`events.ts:365-367` — `if (!cronSteps.some((s) => s.name === step.name))`). 재import는 멱등이다.

진짜 문제는 반대쪽 — **등록 누락**이고, 이미 실현돼 있다:

| 사실                                                                        | 근거                                                |
| --------------------------------------------------------------------------- | --------------------------------------------------- |
| `registerCronStep(studySessionCronStep)` 호출 지점은 이 파일 9행 **하나뿐** | grep                                                |
| `events.test.ts:112,126`이 이 모듈 없이 `runCron()`을 부른다                | 테스트는 `expire` 스텝만 도는 레지스트리를 검증한다 |
| `generate-study-sessions`는 `runCron` 경로 커버리지가 0                     | `studies.test.ts:119-150`이 스텝을 직접 호출할 뿐   |

**프로덕션의 `runCron()`과 테스트의 `runCron()`이 다른 함수다.**
`runCron()`을 이 라우트 밖에서 부르는 코드가 생기면 스터디 스텝이 조용히 사라진다.
등록은 `services/events.ts`가 자기 스텝을 스스로 하거나, `runCron()`이 스텝 목록을 인자로 받아야 한다.

## CS-4 🟡 501을 401보다 먼저 반환해 설정 상태를 노출한다

13-15행이 자격 검사 **이전에** 501을 낸다. 익명 요청이
"`CRON_SECRET` 미설정"(501)과 "시크릿 틀림"(401)을 구별할 수 있다.

fail-closed 자체는 옳다(아래 참조). 문제는 **구별 가능성**이고, CS-2의 타이밍 차이보다
훨씬 직접적으로 관측된다. `maintenance:10-12` · `health:10-12`에 복제돼 있다.

## CS-6 🟡 스텝 결과 키가 한 평면에서 충돌한다

`Object.assign(results, await step.run())`(`events.ts:373`)이 스텝 결과를 하나의 평평한
이름공간에 병합한다. 두 스텝이 같은 키를 반환하면 조용히 덮어쓴다.
25행의 `{ success: true, ...results }`는 스프레드가 뒤에 오므로 **스텝이 `success`를 반환하면
라우트 자신의 `success: true`를 덮는다.** 현재 `{expired}`·`{generated}`는 충돌하지 않지만,
레지스트리는 CS-3이 설명한 방식으로 확장되도록 설계돼 있다.

## 확인했고 지적하지 않은 것

- **`CRON_SECRET` 미설정 시 501 fail-closed** — 시크릿 부재를 "인증 없음"으로 처리하지 않는다. 올바르다 (노출 문제는 CS-4로 분리)
- ~~"heartbeat ping이 성공 경로에만 있다(24행) — dead-man's switch로서 정확하다"~~
  → **초판의 이 승인이 CS-5를 정면으로 인증했다.** 삭제한다

## 정정 기록

초판 `CS-4`: "부분 실패도 전체 500이 된다 / 실패 경로에서 결과 구조가 버려진다."
**둘 다 거짓이다.** `runCron`은 200 `success: true`를 반환하고, 26-29행 catch는 도달 불가다.

원인은 `events.ts`의 `runCron` 본문을 열지 않고 라우트만 보고 추론한 것이다.
같은 오류가 `maintenance/+server.md` 초판 `CM-3`에 그대로 복제됐다 —
그쪽은 이 문서를 참조했기 때문이다.

> **교훈**: 라우트 리뷰는 라우트가 부르는 함수의 오류 계약을 확인하기 전에는 끝나지 않는다.
> 그리고 **교차 참조는 지적뿐 아니라 오류도 전파한다.**
