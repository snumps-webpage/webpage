# `src/lib/server/core/semester.ts` (60줄)

**접두사 `LA06-`** · 서버 쪽 학기 모듈 — 학기 형식 정규식 두 개, `termOf` 재수출, 현재 학기, 학기 구간, 학기 시작일.

## LA06-1 🟡 학기 형식이 서버 전용 모듈에 있어 브라우저 쪽에 복사본이 여섯 개 생겼다

> **검증 정정**: 🟠 → 🟡. 복사본 여섯 곳은 모두 확인했다. 그러나 이 지적이 스스로 드는 결과는 **크게 드러나는 거부**뿐이다.
> 어긋난 입력 스키마가 받은 학기 문자열은 모두 `mutate`의 쓰기 게이트(`data/tables.ts:126-137`)를 거쳐 처음 저장되고,
> 게이트는 저장 스키마(`common.ts:15,17`)로 걸러 `VALIDATION_FAILED`를 낸다. 예를 들어 스터디 신청은 `mutate("study-requests")`,
> 기록 편집은 `records-admin.ts`의 `mutate`로 저장한다. SQL flow는 이미 검증된 저장값이나 `currentTerm()`만 옮긴다.
> 반대 방향(입력 쪽이 더 좁을 때)도 폼에서 드러나는 거부다. `public-content.ts:78`은 검증이 아니라 표시용 포매터라서, 어긋나면 원문을 그대로 보여 줄 뿐이다.
> 조용한 오염이 없으므로, 같은 부류인 LA08-2·LA09-3(중복된 규칙에 핀이 없음)과 등급을 맞춘다.
> 목록에 한 곳을 더한다. SQL `app_may_derive_semester`의 `'^\d{2}-[SW]$'`(`atomic_flows.sql:160`)도 방학 학기 집합을 한 번 더 적는다.

10행 `TERM_PATTERN`과 17행 `SEMESTER_PATTERN`은 저장 스키마의 계약이다(`data/schemas/common.ts:15,17`).
그런데 `$lib/server` 안에 있으므로 `domain/`·페이지는 import할 수 없고, 각자 리터럴을 다시 쓴다.

| 복사본                                             | 대응               | 핀                                       |
| -------------------------------------------------- | ------------------ | ---------------------------------------- |
| `domain/members.ts:208-213`                        | `TERM_PATTERN`     | `members.test.ts:20-24` — `26-W` 한 값만 |
| `routes/(admin)/admin/executives/+page.svelte:101` | `TERM_PATTERN`     | 없음                                     |
| 같은 파일 `:109` (HTML `pattern`)                  | `TERM_PATTERN`     | 없음                                     |
| `domain/admin-records.ts:67`                       | `SEMESTER_PATTERN` | 없음                                     |
| `domain/studies.ts:80`                             | `SEMESTER_PATTERN` | 없음                                     |
| `domain/public-content.ts:78` (캡처 그룹 변형)     | `SEMESTER_PATTERN` | 없음                                     |

`domain/semester-order.ts:10`의 `HALF_ORDER` 키(`1`·`S`·`2`·`W`)도 같은 집합을 한 번 더 적는다.

학기 종류를 하나 바꾸면(예: 계절학기 표기 변경) 이 파일 + 여섯 곳 + 정렬표를 함께 고쳐야 하고, 하나를 놓치면
**입력 스키마는 받는데 저장 스키마가 거부하는**(또는 반대) 상태가 된다 — 사용자는 폼을 통과한 뒤 저장 단계에서 실패한다.

`termOf`는 바로 이 이유로 `domain/term.ts`로 옮겨졌다(19-21행, `term.ts:5-6` "Browser-safe … so pages and
the server derive terms the same way"). 두 정규식만 그 이사에서 빠졌다. 처방: 두 상수를 `domain/term.ts`로
옮기고 이 파일은 재수출, 복사본은 import로 바꾼다. **구조만 바뀐다.**

## ~~LA06-2 🟡 KST 오프셋이 이 파일에도 따로 정의돼 있다~~

> **검증 정정 — 철회(중복)**: `LA09-3`과 같은 결함이다. LA09-3은 오프셋 상수 네 벌을 나열하는데 그중 하나가 이 파일 8행이고,
> 처방(`domain/term.ts`에 하나 두고 import)도 같다. 이 지적에만 있던 사실 — 54-56행의 "instant → KST 날짜 문자열" 패턴과
> 그 스크립트 복사본(`seed-dev.ts:39`, `migration/lib.ts:349`) — 은 LA09-3으로 옮겨 적었다.

8행 `KST_OFFSET_MS`는 `core/time.ts:5`, `domain/term.ts:10`, `services/maintenance.ts:202`와 같은 값의
네 번째 정의다(스크립트까지 치면 여섯). 54-56행의 "instant → KST 날짜 문자열"(오프셋 더하고 `toISOString().slice(0,10)`)도
`scripts/seed-dev.ts:39`, `scripts/migration/lib.ts:349`에 같은 형태로 있다. 한국 표준시에는 서머타임이 없어
값이 바뀔 일은 없지만, "KST 날짜/시각 변환"이라는 개념이 한 곳에 없어서 새 코드가 매번 다시 쓴다.
`LA09-3` 참조 — 정의는 `domain/term.ts`(브라우저 안전)에 하나 두고 여기와 `time.ts`가 import하면 된다.
**구조만 바뀐다.**

## LA06-3 🟡 `termStartDateOrNull`이 예외를 제어 흐름으로 쓴다

> **검증 정정**: 등급은 그대로이고 주장을 좁힌다. "저장된 학기 문자열이 깨져도 화면은 조용히 날짜를 비운다"는 인과가 틀렸다.
> 호출부의 `s.semester`는 읽기 시점에 저장 스키마 `Semester`(SEMESTER_PATTERN)로 엄격하게 디코드된다. 깨진 문자열이 있으면
> 여기까지 오기 전에 테이블 읽기가 실패한다(`tables.ts:73-81`). 남는 결함은 논리에 관한 것이다. 설계상의 `null`(방학 학기)과
> 형식 오류, `termRange` 내부의 향후 버그가 한 값으로 뭉개진다. 그리고 `"nonsense" → null`을 핀으로 고정한 테스트가
> 그 뭉개짐을 계약으로 만든다(`semester.test.ts:94-96`).

52-59행. `termRange`가 던지는 모든 예외를 `catch {}`로 삼켜 `null`로 바꾼다. 46-47행 주석은
`null`의 뜻을 "방학 학기라 설계상 시작일이 없다"로 정의하지만, 실제로는 방학 학기·형식 오류·향후
`termRange` 내부 버그가 모두 같은 `null`이 된다(`semester.test.ts:94-96`이 `"nonsense"`의 `null`도 핀으로 고정했다).
호출부(`archive/+layout.server.ts:167,178`)는 `null`을 "날짜 없음"으로 표시하므로, 저장된 학기 문자열이
깨져도 화면은 조용히 날짜를 비운다.

판별은 이미 10행에 있다: `TERM_PATTERN.test(term) ? … : null`. 출력은 같고 예외 경로가 사라진다.
**구조만 바뀐다**(형식 오류를 `null`로 둘지 드러낼지는 별도 결정).

## 확인했고 지적하지 않은 것

- **`termRange`가 학기 경계(3월·9월)를 `termOf`와 따로 인코딩한다** (36-39행) — 미러지만
  `semester.test.ts:37-44`가 `start`·`end-1s`·`end`를 `termOf`에 되돌려 넣어 왕복을 핀으로 고정한다.
  핀이 있는 미러다
- **`2000 + Number(yy)`** (33행) — `domain/term.ts:43` `termLabel`과 같은 세기 규칙이다. 두 자리 연도라는 저장
  형식 자체의 성질이고, 바뀌면 `TERM_PATTERN`부터 바뀌어야 하므로 LA06-1의 이사에 함께 묶인다
- **`currentTerm()`이 `termOf(now)`의 별칭** (23-25행) — 인자 없는 호출이 "현재 학기"라는 의도를 이름으로
  말한다. 테스트 밖 18곳이 이 이름을 쓴다. 불필요한 중복으로 보지 않는다
- **`compareSemesters` 재수출** (43행) — 빌드 차단 사고(`semester-order.ts:2-4`) 후의 이사 흔적이고, 정의는 한 곳이다
- **SQL 미러 `app_term_of`** — `flow-rules.test.ts:18`이 `termOf`와 대조한다

## 검증 (2026-09-28)

- LA06-1 — 정정 🟠 → 🟡 (복사본 여섯 곳은 확인했다. 그러나 어긋났을 때의 결과가 모두 쓰기 게이트나 폼에서 드러나는 거부다. SQL 사본 `atomic_flows.sql:160`을 목록에 더함)
- LA06-2 — 철회 (LA09-3과 중복. 이 지적에만 있던 사실은 LA09-3으로 옮김)
- LA06-3 — 정정 (등급 유지. "깨진 저장값이면 날짜가 조용히 빈다"는 읽기 디코드가 먼저 막으므로 틀렸다. 남는 것은 null의 의미가 뭉개진다는 점이다)
- 누락 점검: `termRange`의 경계(`semester.test.ts:37-44` 왕복 핀), `termStartDateOrNull`의 KST 날짜 계산(54행), 재수출 두 개를 읽었다. 두 정규식의 소비처(`common.ts:15,17`, `executives-admin.ts:77`)도 확인했다. 새 지적은 없다.
