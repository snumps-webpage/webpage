# `src/lib/domain/term.ts` (44줄)

**접두사 `LC17-`** · 학기 파생 규칙의 브라우저 안전 원천 — `termOf`(instant → `YY-1`/`YY-2`, KST), `termOfDateString`(저장 문자열 → 학기 또는 `"Unknown"`), `termLabel`(`"26-1"` → `"2026년 1학기"`).

## LC17-1 🟡 학기 이름을 붙이는 함수가 세 개이고, 이미 서로 다르게 말한다

> **검증 정정**: 첫째 불릿의 "이 파일의 `termLabel`은 **유효한 학기에 틀린 이름**을 낸다"를 좁힌다. 이 코드베이스의 어휘에서 "term"은
> 정규 학기뿐이다 — `TERM_PATTERN = /^\d{2}-[12]$/`(`core/semester.ts:10`), 임원 역할의 `term: Term`(`schemas/member.ts:8`),
> `currentTerm()`도 정규만 낸다. `YY-S`/`YY-W`는 `Semester`(기록 학기)이지 `Term`이 아니므로 `termLabel`과 회장단 페이지의 지역 `termLabel`
> 모두에게 **정의역 밖**이다. 즉 `"S학기"`는 `"NaN년 undefined학기"`와 같은 부류(인자가 `string`인데 정의역을 검사하지 않는다)이지
> 정의역 안의 오답이 아니다. 남는 결함 — 같은 일을 하는 함수 셋이 정의역 밖에서 제각각 말하고, 기록 학기(`Semester`)를 다룰 수 있는 것은
> `formatArchiveTerm` 하나라는 것 — 과 처방은 그대로다. 🟡 유지.

41-44행 `termLabel`은 이 모듈 머리 주석(1-7행)이 "the single definition"이라 부르는 파일에 있지만, 같은 일을 하는
함수가 둘 더 있다.

| 함수                                                                   | `26-1`       | `26-S`           | `26-W`           | 형식 밖(`Unknown`)        |
| ---------------------------------------------------------------------- | ------------ | ---------------- | ---------------- | ------------------------- |
| 여기 `termLabel` (41-44)                                               | 2026년 1학기 | **2026년 S학기** | **2026년 W학기** | **`NaN년 undefined학기`** |
| `domain/public-content.ts:77-84` `formatArchiveTerm`                   | 2026년 1학기 | 2026년 여름학기  | 2026년 겨울학기  | 입력 그대로               |
| `routes/(public)/about/executives/+page.svelte:12-18` 지역 `termLabel` | 2026년 1학기 | **2026년 여름**  | **2026년 겨울**  | `20Unknown년 undefined`   |

- 방학 학기의 이름이 세 가지(`S학기` / `여름학기` / `여름`)다. 저장 형식(`SEMESTER_PATTERN`, `core/semester.ts:17`)이
  `YY-S`·`YY-W`를 정상 값으로 받으므로, 이 파일의 `termLabel`은 **유효한 학기에 틀린 이름**을 낸다
- 입력 검사가 없다. `split("-")`의 결과를 그대로 `Number()`·템플릿에 넣어 형식 밖 문자열이 `NaN년 undefined학기`가 된다.
  같은 모듈의 `termOfDateString`(29-38행)이 바로 `"Unknown"`을 학기 자리에 돌려주는 함수라서, 두 함수를 이어 붙이는
  호출자는 그 문구를 화면에 낸다
- 지금 호출부(`(public)/+page.server.ts:253` `termLabel(currentTerm())`)는 정규 학기만 넘긴다. 판정 기준대로 감면 근거는 아니다 —
  이름이 "학기 → 이름"이고 인자가 `string`이다

결과: 방학 학기 표기를 바꾸거나 새 화면이 학기 이름을 그리려 하면 세 함수 중 무엇이 기준인지 알 수 없고,
고르는 것에 따라 같은 학기가 다른 이름으로 나온다.

처방: 하나로 합친다 — `formatArchiveTerm`의 표(네 종류 + 형식 밖은 입력 그대로)를 이 파일로 옮겨 `termLabel`로 삼고,
`public-content.ts`와 회장단 페이지는 import한다(회장단 페이지는 "여름"→"여름학기"로 바뀐다). 정규 학기 출력은 그대로이므로
**현행 호출부 기준 구조 변경**, 회장단 페이지의 방학 표기만 **동작 변경**. 정규식은 `LA06-1`의 이사(패턴을 이 파일로)와 함께 하면 된다.

## LC17-2 🟡 `termOf`가 잘못된 `Date`에 `"NaN-2"`라는 학기를 지어낸다

19-23행은 `Invalid Date`를 거르지 않는다. `kstYearMonth`가 `{ year: NaN, month: NaN }`을 내고, `month >= 3 && month <= 8`이
거짓이라 22행으로 떨어져 `` `${yy(NaN)}-2` `` = **`"NaN-2"`** 를 돌려준다(실측). 같은 파일의 `termOfDateString`은
34행에서 같은 경우를 `"Unknown"`으로 막는다 — 한 모듈의 두 입구가 "날짜가 아니다"를 다르게 말한다.

그 차이가 한 페이지 안에서 만난다. `(admin)/admin/events/connect`는 서버가 학기 목록을
`termOf(new Date(a.date))`로 만들고(`+page.server.ts:20-22`), 브라우저는 같은 `a.date`를 `termOfDateString(a.date)`로
걸러낸다(`+page.svelte:24`). 날짜가 깨진 행이 있으면 드롭다운에는 `NaN-2`가 뜨고, 그것을 골라도 필터는 `"Unknown"`과
비교하므로 **아무 행도 나오지 않는다**. `a.date`는 `DateTime` 게이트(`schemas/common.ts:13`)를 통과한 값이라 지금은 일어나지
않지만, 결함은 `termOf`가 계약 밖 입력을 "그럴듯한 학기 문자열"로 바꾼다는 데 있다 — `"NaN-2"`는 `TERM_PATTERN`에는 걸리지만
문자열로 비교·그룹핑하는 소비자에게는 학기 하나로 보인다.

처방: 19행에서 `Number.isNaN(d.getTime())`이면 던진다(`RangeError`) — 입력이 `Date`인 입구는 오류가 맞다. **동작 변경**(잘못된 입력에서만).
`events/connect`의 서버 쪽도 `termOfDateString`을 쓰면 두 입구 불일치가 사라진다(그 파일의 몫).

## LC17-3 🟡 `termOfDateString`이 오프셋 없는 시각을 실행 환경의 시간대로 읽는다 — 서버와 브라우저가 다른 학기를 낸다

26-27행 주석의 계약은 "오프셋이 붙은 ISO instant, 또는 맨 날짜"다. 그러나 33행은 그 밖의 문자열을 `new Date(value)`에
그대로 넘긴다. ECMAScript는 오프셋 없는 날짜-시각 형식을 **로컬 시각**으로 해석하므로 결과가 실행 환경의 `TZ`에 달린다.

```
termOfDateString("2026-02-28T23:30:00")
  TZ=UTC        → "26-1"   (= 3월 1일 08:30 KST)
  TZ=Asia/Seoul → "25-2"   (= 2월 28일 23:30 KST)
```

(실측, 같은 규칙을 두 `TZ`로 실행.) 이 모듈이 존재하는 이유가 5-6행 "pages and the server derive terms the same way"인데,
실제 호출자가 양쪽에 다 있다 — 서버(`(public)/+page.server.ts:140,369,375,383`)와 브라우저(`events/connect/+page.svelte:24`).
`"2026/03/01"` 같은 비ISO 문자열도 `"Unknown"`이 아니라 학기가 된다.

저장된 `DateTime`은 오프셋이 필수(`schemas/common.ts:13`)라 지금 경로의 입력은 계약 안이다. 감면 근거가 아니다 —
함수 이름이 "저장 날짜 문자열"이고, 계약 밖 입력에 대해 `"Unknown"` 대신 **환경마다 다른 답**을 낸다.

처방: 30행처럼 형식을 먼저 판별한다 — 맨 날짜, 또는 `Z`/`±HH:MM`으로 끝나는 ISO만 받고 나머지는 `"Unknown"`.
**동작 변경**(계약 밖 입력만).

## LC17-4 🟡 (검증 추가) instant 갈래는 날짜 굴림을 막지 않는다 — 없는 2월 29일이 3월로 넘어가 학기가 바뀐다

36행의 "실재하는 날인가" 검사는 **맨 날짜 갈래에만** 걸린다. 33행 `new Date(value)` 갈래는 V8(Node·Chrome)에서
없는 날을 다음 달로 굴린다(실측, Node 24):

```
termOfDateString("2026-02-29")                  → "Unknown"   (36행이 막는다)
termOfDateString("2026-02-29T10:00:00+09:00")   → "26-1"      (= 3월 1일로 굴림)
termOfDateString("2026-02-30T10:00:00+09:00")   → "26-1"      (= 3월 2일)
```

같은 "없는 날"이 형식에 따라 `"Unknown"`과 **다른 학기**(2월 → `25-2`가 아니라 3월 → `26-1`)로 갈린다 — 2월 말은 학기 경계라
굴림이 곧 학기 오답이다. 명세(ECMA-262 Date Time String Format)는 범위 밖 원소를 형식 위반으로 보므로 엔진마다 결과가 다를 수 있어,
LC17-3과 같은 "환경마다 다른 답"이 시간대가 아니라 **엔진** 축으로 한 번 더 있다.

저장된 `DateTime`은 zod가 이 값을 거절하므로(`z.string().datetime({ offset: true })`, 실측 `false`) 지금 경로의 입력은 계약 안이다 —
판정 기준대로 감면 근거는 아니다. LC17-3의 처방(형식 판별)은 이 입력을 통과시키므로 **따로 필요하다**.

처방: instant 갈래에서도 날짜 부분(`value.slice(0, 10)`)이 실재하는 날인지 32·36행과 같은 방법으로 확인하고, 아니면 `"Unknown"`.
**동작 변경**(계약 밖 입력만).

## 확인했고 지적하지 않은 것

- **KST 경계(21-22행)** — 3~~8월 → `YY-1`, 9~~12월 → `YY-2`, 1~2월 → 전년도 `-2`. `term.test.ts:4-17`이 KST/UTC 경계,
  윤일, 두 자리 연도를 고정한다. `core/semester.test.ts:12-34`도 재수출 경로로 같은 경계를 고정한다
- **SQL 미러 `app_term_of`** (`atomic_flows.sql:143-153`) — `flow-rules.test.ts:18-34`가 경계·윤일·2100년 랩까지 `termOf`와 대조한다.
  핀이 있는 미러다. 7행 주석이 정확하다
- **`termRange`가 경계를 따로 인코딩** (`core/semester.ts:36-39`) — `semester.test.ts:37-44`의 왕복 핀이 있다(`LA06-1` 문서의 판정과 같다)
- **맨 날짜를 KST 정오로 읽는다(32행)** — 정오 KST는 같은 UTC 날짜(03:00Z)라 36행의 `toISOString().slice(0,10)` 비교가
  "존재하는 날짜인가"를 정확히 판정한다. `2026-02-29`가 굴러 넘어가는 것을 막는다(`term.test.ts:27`)
- **`KST_OFFSET_MS`(10행)·`"+09:00"` 리터럴(32행)** — `LA06-2`·`LA09-3`이 이미 셌다. 재등급하지 않는다
- **학기 형식 정규식이 이 파일에 없다** — 그래서 사본이 도메인 곳곳에 생겼다는 것이 `LA06-1`·`LC03-2`의 판정이고, 처방이
  "이 파일로 옮기라"다. 여기서 따로 세지 않는다
- **두 자리 연도(`year % 100`, 17행)** — 저장 형식 자체의 계약이다. 2100년 랩(`"99-2"`)은 SQL 미러와 함께 고정돼 있다

## 검증 (2026-09-28)

- LC17-1 — 정정 (`YY-S`/`YY-W`는 `Term`의 정의역 밖 — "유효한 학기에 틀린 이름"을 "정의역 밖 입력을 검사하지 않음"으로 좁힘. 🟡 유지. 세 함수의 출력표는 실측과 일치)
- LC17-2 — 확인 (`termOf(new Date("x"))` → `"NaN-2"` 실측, `events/connect` `+page.server.ts:20-22`·`+page.svelte:24` 확인)
- LC17-3 — 확인. `TZ=UTC`/`TZ=Asia/Seoul` 두 번 실행으로 재현: `"2026-02-28T23:30:00"` → `26-1`/`25-2`, `"2026-08-31T20:00:00"` → `26-2`/`26-1`; `"2026/03/01"`·`"March 1, 2026"`은 두 환경 모두 `"Unknown"`이 아니라 `26-1`. **오프셋 없는 값의 출처 점검**: 호출자 넷(`(public)/+page.server.ts:140,369,375,383`)과 `events/connect`의 `a.date`는 모두 `activities.date.start`이고, 그 칼럼은 `DateTime`(zod 3.25 `datetime({offset:true})` — 오프셋 없는 값 `false` 실측)이며 `getTable`이 읽을 때 봉투 전체를 검증한다(`data/tables.ts:74-79`) — 오프셋 없는 행은 이 함수에 닿기 전에 표 읽기가 실패한다. SQL 흐름은 TS 입력 문자열을 그대로 옮기고(`atomic_flows.sql:937,948,980`), `seed-dev.ts`는 `kstISO`를 쓴다. 즉 현재 저장·표시 경로에 오프셋 없는 값은 없고, 결함은 문서가 적은 대로 계약 밖 입력에서의 환경 의존이다
- LC17-4 — 추가 (instant 갈래의 날짜 굴림: 없는 2월 29·30일이 `26-1`로)
- 누락 점검: 44줄 전부를 원문만으로 다시 읽었다(`kstYearMonth`·`yy`·세 export). 위 LC17-4 외에 없음
