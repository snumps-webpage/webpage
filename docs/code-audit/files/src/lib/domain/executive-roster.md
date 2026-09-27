# `src/lib/domain/executive-roster.ts` (52줄)

**접두사 `LC08-`** · `getPublicExecutives()`의 학기별 임원 목록을 헤더/푸터·게스트 표지가 그리는 회장·부회장 명부로 바꾸는 어댑터.
짝 테스트가 **없다**(`executive-roster.test.ts` 부재).

## LC08-1 🟠 "연락처 없음"이 빈 문자열이 되어 빈 `tel:`·`mailto:` 링크로 그려진다

36-37행은 없는 값을 `""`로 채운다. 받는 타입 `PublicExecutive`(`members.ts:69-75`)의 `phone`·`email`이
`string`이라 "없음"을 표현할 자리가 없기 때문이다. 소비자 `ExecutiveContacts.svelte`는 `executive`의
존재만 보고 두 링크를 무조건 그린다:

```
44-49  {#if executive} <a href={phoneHref(executive.phone)}>{executive.phone}</a>
                       <a href={`mailto:${executive.email}`}>{executive.email}</a>
65-68  (푸터 변형도 같다)
```

그 결과:

- **이메일은 항상 비어 있다** — 생산자가 이메일을 내지 않는다(LC08-2). 모든 페이지 푸터와 게스트 표지에
  텍스트 없는 `<a href="mailto:">`가 회장·부회장마다 하나씩 붙는다
- **전화 공개를 거부한 현 회장단**(`hidePublicPhone`, `archive.ts:89-92`) 또는 지난 학기 행(`contact: null`,
  `archive.ts:116`)은 `<a href="tel:">`까지 빈 링크가 된다. `ExecutiveContacts.svelte:51`의 "공개 연락처 미등록"은
  **임원이 없을 때만** 나오고, 연락처가 없는 임원에게는 나오지 않는다

빈 링크는 스크린리더가 이름 없는 "링크"로 읽고 키보드 초점도 받는다. 처방: `PublicExecutive`의 두 필드를
`string | null`로 바꾸고 37행이 `null`을 보존, 컴포넌트는 값이 있을 때만 링크를 그린다. **동작 변경**(마크업).

## LC08-2 🟡 생산자가 내지 않는 형식을 파싱한다

> **검증 정정**: **`LB16-3`의 중복 — 이 문서에서 세지 않는다.** 항목은 "`LB16-3`의 결함을 여기서 다시 세지 않는다 —
> 이 항목은 이 파일의 죽은 코드와 틀린 주석"이라고 선을 긋지만, 그 둘이 바로 `LB16-3`의 둘째·셋째 불릿이다
> (`archive.md` — "`domain/executive-roster.ts:19-20`이 옛 모델을 설명한다", "`executive-roster.ts`는 `"phone · email"`
> 결합 문자열을 파싱하는데, 이 함수가 내는 값은 전화 하나뿐이다"). 처방(파서·주석 제거)도 `LB16-3`의 정리 방향과 같다.
> 사실 확인은 유효하다 — `archive.ts:95-100`이 `formatPhoneForDisplay(phone)` 하나만 내고, 36행 `@` 분기는 참이 될 수 없다.

17-21행 주석과 32-37행 코드는 `contact`를 **`members.publicContact`의 `"phone · email"` 결합 문자열**로 다룬다 —
`·`로 쪼개고 `@`가 있는 조각을 이메일로 고른다. 그러나 이 함수가 받는 `contact`는 `getPublicExecutives`가
`private-info.phone`으로 만든 **전화번호 하나**다(`archive.ts:95-100`, `formatPhoneForDisplay(phone)`).
`publicContact`는 어떤 공개 면도 읽지 않는다 — **`LB16-3`**(운영자 결정 2026-09-01로 출처가 바뀌었다).

따라서:

- 36행 `@` 분기는 참이 될 수 없다. 33-35행의 분할도 전화번호에 `·`가 없으므로 항상 한 조각이다
- 19-20행 "publicContact is the one sanctioned public field"는 옛 모델의 설명이다
- `members.ts:258-260`은 결합 규칙의 거처로 **이 파일**을 가리키는데, 이 파일은 그 규칙의 문자열을 받지 않는다(`LC11-9`)

결정된 쪽(전화)으로 정리하면 32-37행은 `phone: holder.contact`(LC08-1과 함께라면 `null` 보존) 한 줄이 된다.
`LB16-3`의 결함을 여기서 다시 세지 않는다 — 이 항목은 그 결정이 남긴 **이 파일의 죽은 코드와 틀린 주석**이다. **구조만 바뀐다.**

## LC08-3 🟡 "현 회장단"을 정렬된 목록의 첫 항목으로 정한다

> **검증 정정**: **`LB16-7`의 중복 — 이 문서에서 세지 않는다.** `archive.md`의 `LB16-7` 첫 불릿이 같은 행
> (`domain/executive-roster.ts:26`)과 같은 두 결과("연락처 없는 다음 학기", "지난 학기")를 거의 같은 문장으로 적었다.
> 항목 스스로 "한 번만 고친다"고 하고 처방도 `LB16-7`의 구조 제안을 따른다 — 같은 결함에 번호가 둘이다.
> 인과 주장은 코드로 확인했다(`archive.ts:78,116,123-124`).

26행 `terms?.[0]`은 **문자열 역순으로 가장 큰 학기**다(`archive.ts:123-124`). 연락처는 `currentTerm()`의 행에만 붙는다
(`archive.ts:78,116`). 두 기준이 다르므로 다음 학기 직책을 미리 입력하면 명부는 **연락처 없는 다음 학기**를
현 회장단으로 보이고(LC08-1과 겹쳐 빈 링크), 이번 학기 직책이 아직 없으면 **지난 학기**를 보인다.

생산자 쪽에서 같은 결함을 `LB16-7`이 적었다 — 한 번만 고친다. 이 파일의 몫은 "현재"를 판정할 정보(현재 학기)를
받지 않으면서 판정한다는 것이다. 처방은 생산자가 현 학기 항목을 따로 내는 것(`LB16-7`의 구조 제안)이고
그러면 26행의 추측이 사라진다. **동작 변경.**

## 확인했고 지적하지 않은 것

- **`"회장"`·`"부회장"`이 49-50행에 박혀 있다** — `LB22-4`가 이 행을 포함해 다섯 곳을 이미 지적했다. 새 번호를 달지 않는다
- **`PublicExecutiveTerm`(7-15행)이 생산자 반환형의 손 복사본이다** — 호출부(`+layout.svelte:206`,
  `(public)/+page.svelte:100,106`)가 `page.data.executives`(로드가 추론한 타입)를 넘기므로 모양이 어긋나면
  `svelte-check`가 잡는다. 계약이 강제된다. 6행 주석도 사실이다
- **`id`(39행) `${term}-${title}`** — 한 학기 한 직위에 한 명(`archive.ts:111`은 여러 명을 허용하지만 `find`가 첫 사람을 고른다).
  키 충돌은 없다. 같은 직위 복수 배정 자체의 허용 여부는 `LB22-3`의 입력 규칙 문제다
- **`holders`가 비었을 때** — `find`가 `undefined` → `null` → 컴포넌트가 "공석"을 그린다. 맞다
- **`PublicExecutive`·`PublicExecutiveRoster`가 `members.ts`에 산다** — 이 파일과 `ExecutiveContacts.svelte`만 쓴다.
  거처로는 이 파일이 자연스럽지만 옮겨도 얻는 것은 import 한 줄이다. 과한 지적이라 적지 않는다

## 커버리지

테스트가 없다. LC08-1의 빈 값, LC08-3의 "첫 항목" 선택, 29-45행의 분할 규칙이 모두 미검증이다.
이 파일은 모든 페이지의 푸터를 만든다.

## 검증 (2026-09-28)

- LC08-1 — 확인. `ExecutiveContacts.svelte:43-49,65-68`이 `executive` 존재만 보고 두 링크를 그리고, 생산자
  (`archive.ts:95-100`)는 이메일을 내지 않으므로 헤더/푸터(`+layout.svelte:205-206`)와 게스트 표지
  (`(public)/+page.svelte:100,106` → `GuestLanding.svelte:27`)의 `mailto:`는 **항상** 비어 있다. 참고로 역대 회장단 페이지
  (`about/executives/+page.svelte:61-75`)는 이 어댑터를 쓰지 않고 `contact`가 있을 때만 링크를 그린다 — 같은 데이터에
  대해 올바른 형태가 이미 저장소 안에 있다
- LC08-2 — 정정 (`LB16-3`의 중복, 집계 제외)
- LC08-3 — 정정 (`LB16-7`의 중복, 집계 제외)
- 누락 점검: 52줄 전부와 소비자 셋(루트 레이아웃·게스트 표지·`ExecutiveContacts`)을 다시 읽었다. 29-45행 `pick`의
  첫 사람 선택, `id` 조합, 빈 `holders` 처리는 "지적하지 않은 것"의 판단과 같다. 새로 추가할 지적 없음
