# `src/routes/api/health/+server.ts` (25줄)

**접두사 `HL-`** · 잡2. Bearer 인증 후 실제 SELECT 1회 — keep-alive 겸 liveness probe.

## HL-1 🟠 인증 블록 복제본 (셋 중 셋째)

9-16행이 `cron/maintenance:9-16` · `cron/sync-events:12-19`와 바이트 단위 동일. `CS-1` 참조.
(초판이 `11-16행`으로 적었다 — 블록은 10행부터다.)

## HL-2 🟡 주석이 이 엔드포인트를 실제보다 넓게 부른다

> **초판 정정**: 🟠 → 🟡, 그리고 **사용자 확인 항목으로 넘기려던 것을 철회**한다.
> 초판은 "Bearer 인증이 걸린 헬스체크는 liveness probe로 쓸 수 없다"를 결함으로 제기했다.
> **그 판단은 이미 내려져 있었고, 초판은 그것을 확인하지 않았다.**

`docs/spec/SUPABASE-SPEC-REVIEW.md:17`의 **S5(R1-6)** 가 공개 무인증 `/api/health`를
🔴로 지적한다 — "아무나 DB SELECT 유발 가능(무료 플랜 rate limit 부재).
cron-job.org가 헤더를 지원하므로 Bearer 포기 이유 없음."
`SUPABASE-MIGRATION-SPEC.md:11,172`가 이를 확정했고, 파일 6행의 "S5" 태그가 그 근거다.

의도된 감시자는 헤더를 붙이는 cron-job.org 잡2다(`OPERATOR-TODO.md:144`).
초판의 표에 나오는 "헤더를 모르는 감시자"는 **설계가 일부러 배제한 대상**이다.

남는 것은 문구 문제뿐이다 — 6-7행이 "liveness probe"라고 부르지만
인증 없이는 아무도 못 쓰므로 그 이름이 과하다. 🟡.

그리고 잡 등록이 ⬜ 미완인 사실은 **`CROSS-CUTTING.md` XC-4가 이미 판정한 부류**다 —
"결함이 아니라 열린 채로 남은 운영 항목." 초판은 같은 사실을 🟠로 올리고 새 C 항목으로 넘겼다.
**자기 선례를 적용하지 않았다.**

## HL-3 🟡 `ok:false` 500이 원인을 구분하지 않는다

21-23행. 연결 실패·권한 실패·쿼리 실패가 호출자에게 같아 보인다. 로그는 남는다.
`CS-`·`CM-`과 같은 형태 — 세 엔드포인트가 모두 이렇다.

## HL-4 🟡 keep-alive가 두 잡에 중복돼 있다

`keepAliveSelect()`를 여기(19행)와 `runMaintenance()`(`maintenance.ts:189`)가 모두 부른다.
`SUPABASE-MIGRATION-SPEC.md:172-173`은 keep-alive **자격 확보를 잡3에 배정**했고
잡2 항목은 "1행 SELECT 후 200"이라고만 적는다.

따라서 초판이 "keep-alive 목적이 실현되지 않아 pause 조건과 직결된다"고 쓴 것은
**이 엔드포인트에 과잉 귀속**이다 — 잡3이 그 역할을 맡는다(둘 다 미등록인 것은 같다).
실제 관찰은 **중복**이다.

## HL-5 🟡 `keepAliveSelect()`의 반환값이 죽은 신호다

`maintenance.ts:33-36`은 항상 `true`를 반환하고 19행은 그것을 버린다.
`runMaintenance`는 `results.keptAlive`에 담지만(`:189`) 그 값도 `true` 아니면
catch의 `false`뿐이다 — 함수가 성공 여부를 표현하지 못한다.

## HL-6 🟡 200 본문이 아무것도 증명하지 않는다

`{ ok: true }`뿐이다. 타임스탬프도, 지연시간도, 버전도 없다.
"실제 SELECT를 한다"는 설계의 장점이 **호출자에게는 관측되지 않는다.**

## 확인했고 지적하지 않은 것

- **실제 SELECT를 한다** — `readVersion`을 store seam에서 직접 불러 `withCache`를 우회한다(`maintenance.ts:26-36`). 응답만 200 내는 가짜 헬스체크가 아니다. 설계 의도가 정확하다
- **`pingHeartbeat()`를 부르지 않는다** — 다른 둘과 다르지만 `SUPABASE-MIGRATION-SPEC.md:181`이 dead-man's switch를 sync-events·maintenance로 한정한다. **스펙 준수다**

## 커버리지

`src/routes/api/` 아래에 테스트가 하나도 없다. 501·401·200·500 분기와 fail-closed 계약(BE-04,
`API-SPEC.md:577`)이 전부 미검증이다. `guards/zone.test.ts:97`은 경로의 존 분류만 확인한다.
