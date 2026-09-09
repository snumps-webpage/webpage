# `src/lib/server/notion/members.ts`

271줄 · 함수 8개 · 회원(Members) / 개인정보(Private Info) 두 DB 접근 계층
검토 2026-08-23 · 기준 `cd916f6` · **검증 에이전트 1회 반영 (개정판)**

> 초판에서 M-1의 심각도와 인과 주장, M-5·M-9의 사실관계가 틀렸다. 아래 §개정 이력 참조.

---

## 요약

| # | 지적 | 분류 | 심각도 |
|---|---|---|---|
| **M-10** | **승인 후 캐시 무효화 키가 어긋나 최대 5분간 "회원 아님"이 유지된다** | 버그 | 🔴 |
| M-14 | `getAllPrivateInfo`가 스키마 검증을 우회해 미검증 데이터를 흘린다 | 버그 | 🟠 |
| M-1 | `createMember`가 두 DB 순차 생성 + 롤백 없음 | 정합성 | 🟠 |
| M-6 | `getLatestExecutives`가 한 함수에 책임 4개 + 불필요한 재조회 | 책임 분리 | 🟠 |
| M-15 | 최신 학기에 직책이 하나만 있으면 나머지가 영구 "공석" | 설계 | 🟠 |
| M-11 | 페이지→스키마 매퍼 4개가 거의 동일 | 중복 | 🟠 |
| M-3 | 캐시 TTL이 매직 넘버 (전역 12곳) | 하드코딩 | 🟠 |
| M-7 | 임원 태그 규칙이 함수 내부 하드코딩 | 확장성 | 🟠 |
| M-13 | 이름이 두 DB에 중복 저장되는데 동기화 경로가 없다 | 정합성 | 🟠 |
| M-2 | KST 날짜 포맷 인라인 재구현 | 중복 | 🟡 |
| M-4 | `getMemberByEmail`이 빈 문자열로 채운 `Member` 반환 | 설계 | 🟡 |
| M-12 | `id`와 `memberId`가 항상 같은 값 | 설계 | 🟡 |
| M-5 | 캐시 적용이 함수마다 제각각 | 일관성 | 🟡 |
| M-8 | 오류와 공석을 구분할 수 없다 | 계층 | 🟡 |
| M-9 | 파일 전체 `any` 허용 | 타입 | 🟡 |

---

## M-10 🔴 승인해도 캐시가 안 지워진다

`:57` 캐시 키:

```ts
withCache(`member_${email}`, 300000, ...)
```

`admin/+page.server.ts:102` 무효화 키:

```ts
{ invalidate: [`member_${id}`, "all_applications", "all_members"] }
```

`id`는 `:67`의 `data.get("id")` — **가입 신청 페이지의 id**다. 이메일이 아니다.
**두 키는 절대 일치하지 않는다.**

게다가 `cache.ts`는 `null`도 캐시한다. 승인 전에 사용자가 사이트에 들어오면
`member_<email> → null`이 5분 TTL로 박히고, 관리자가 승인해도 그 항목이 안 지워진다.
→ **승인된 사용자가 최대 5분간 계속 `/signup`·`/wait`로 튕긴다.**

`hooks.server.ts`의 `membershipGuard`가 `getMemberByEmail`을 쓰므로 전 라우트에 영향이 간다.

**제안**: 무효화 키를 `member_${app.email}`로 고친다. `app`은 `:70` 부근에서 이미 조회한다.

> 이게 이 파일 주변에서 가장 확실하고 사용자 눈에 보이는 결함이다.

---

## M-14 🟠 `getAllPrivateInfo`가 검증을 우회한다

`schema.ts:21`은 `email: z.string().email()`이다. 그런데 `:251`은
`getPropertyValue(...)`로 이메일을 넣는데, 이 함수는 값이 없으면 **`""`를 반환**한다
(`utils.ts:30`). `""`는 `.email()`을 통과하지 못한다.

그리고 `validateNotionResponse`(`utils.ts:16-22`)는 검증 실패 시
**로그만 남기고 raw 객체를 `T`로 캐스팅해 그대로 반환**한다.

결과: 이메일 없는 개인정보 행이 있으면 **미검증 객체가 `PrivateInfo` 타입으로 유통**되고,
콘솔에만 조용히 쌓인다. Notion 실측상 이메일 없는 개인정보 행이 실제로 존재한다.

호출부는 `admin.ts:44`의 관리자 회원 검색 하나뿐이라 폭발 반경은 작지만,
**검증기를 통과시키면서 검증하지 않는 상태**라는 게 문제다.

**제안**: bulk 조회용 스키마를 따로 두거나(`email: z.string()`), 빈 이메일 행을 필터링한다.

---

## M-1 🟠 `createMember`의 부분 실패

`:30-52` — 개인정보 행을 만들고(①) 회원 행을 만든다(②). `try/catch`도 보상 처리도 없다.
②가 실패하면 **개인정보 행만 남고 아무도 가리키지 않는다.**

> **초판의 인과 주장은 철회한다.** 초판은 Notion 실측의 고아 개인정보 11행을 이 코드 탓으로 돌리며
> "가설이 아니다"라고 썼다. **자기 증거와 모순된다.**
> 유일한 호출부(`admin/+page.server.ts:83`)를 보면, `createMember`가 던지면
> `:92-96`(검증·승인 표시)이 실행되지 않으므로 **신청 행이 미승인 상태로 남는다.**
> 즉 이 경로가 만든 고아라면 **반드시 대응하는 신청 행이 존재**해야 한다.
> 그런데 실측된 고아 5건은 대응하는 신청이 없었다. **다른 원인이 있다**
> (수동 Notion 편집, 회원 페이지 직접 아카이브, 앱 이전 시드 데이터 등).
> 결함은 실재하나 심각도는 🟠이고, 고아 레코드 원인은 **별도로 조사해야 한다.**

**가장 싼 수정**: `createMember`가 `void`를 반환한다(`:19`). `privatePage.id`와 회원 페이지 id를
반환하면 (a) 호출부가 실패 시 조회 없이 개인정보 행을 아카이브할 수 있고
(b) `:92`의 `getMemberByEmail(app.email, true)` 검증 왕복을 없앨 수 있다.
롤백 로직을 새로 짜는 것보다 작다.

---

## M-6 🟠 `getLatestExecutives` — 88줄, 책임 4개

`:135-222`: 조회 / 태그 파싱 / 학기 선별 / 임원 상세 재조회.

**재조회가 불필요하다.** `:150-154`의 `filter_properties`에 `NAME`과 `MEMBER_TO_PRIVATE`가
**둘 다 포함**돼 있고, `:167`의 루프가 이미 그 속성들을 읽고 있다.
그런데 `:201`이 `notionRetrieve`로 같은 페이지를 다시 가져온다.

조회 횟수: 목록 1 + (retrieve 1 + getPrivateInfo의 retrieve 1) × 2명 = **5회**.
`:201`을 제거하면 **3회**가 된다.

> 성능 이득 자체는 작다 — 1시간 캐시 뒤에 있고 스트리밍 프로미스로 나간다.
> **실질 가치는 테스트 가능성**이다. 파싱·선별을 순수 함수로 빼면
> (`parseExecutiveTag`, `pickLatestTerm`) 이 파일에서 유일하게 로직다운 로직에 테스트가 붙는다.

---

## M-15 🟠 최신 학기에 한 명만 있으면 나머지가 영구 공석

`:194` — `semesterMap[latestSemesterValue]` 하나만 보고 끝난다.

새 학기 회장 태그가 먼저 달리고 부회장 태그가 아직 안 달렸다면,
**전임 부회장이 재직 중이어도 사이트 전체에 "공석"으로 표시된다.**
학기 전환기마다 재현되는 실사용 시나리오다.

**제안**: 직책별로 독립적으로 "가장 최신 태그"를 찾는다. 학기 단위로 묶을 이유가 없다.

---

## M-11 🟠 매퍼 4개가 거의 동일

| 위치 | 대상 |
|---|---|
| `:93-100` `getMemberById` | `MemberSchema` |
| `:122-128` `getAllMembers` | `MemberSchema` |
| `:226-232` `getPrivateInfo` | `PrivateInfoSchema` |
| `:248-255` `getAllPrivateInfo` | `PrivateInfoSchema` |

같은 속성을 같은 `getPropertyValue` 호출로 꺼내 같은 스키마로 넣는다.
`toMember(page)` / `toPrivateInfo(page)` 두 함수로 접힌다.

접으면 부수 효과가 크다 — **M-4·M-12·M-14의 문제가 전부 한 곳에 모인다.**
지금은 placeholder 규칙이 네 군데에 흩어져 있어 하나만 고치면 불일치가 생긴다.

---

## M-3 🟠 캐시 TTL 매직 넘버

`:58` `300000` / `:106` `60000` / `:136` `3600000`.
코드베이스 전체 `withCache` 호출 **12곳** 전부 인라인 숫자다
(`events.ts:21,114`, `notion/events.ts:148`, `applications.ts:17,46`, `seminars.ts:72`,
`members.ts:56,104,136`, `activities.ts:20,65,91`).
`events.ts:22`·`:115`는 `skipCache ? 0 : 60000` 형태의 삼항이지만 상수가 없는 건 같다.

> ⚠️ **`docs/CACHE.md`를 정답지로 삼으면 안 된다 — 문서가 이미 코드와 어긋나 있다.**
> 문서는 임원 캐시 키를 `president_${semester}`라 적었으나 코드는 `latest_executives`(`:136`)다.
> 문서 `:7`·`:41`은 "in-memory only, no external dependencies (Redis/Memcached)"라 하는데
> `cache.ts`에는 Redis 계층이 있다(`84f4b2a`).
> **TTL 상수화와 함께 `docs/CACHE.md`를 코드에 맞춰 다시 써야 한다.**

**제안**: `constants.ts`에 `CACHE_TTL` 테이블. 이 파일만 고치면 오히려 불일치가 는다 —
**전역 리팩터링 대상**이다.

---

## M-7 🟠 임원 태그 규칙이 함수 안에 박혀 있다

`:170` `/(\d{2})-(\d)\s*(회\s*장|부\s*회\s*장)/`

- 인식 직책이 **회장·부회장뿐**이다. 실제 `임원` multi_select에는
  `24-2 자료관리부장`, `24-2 기획부장` 같은 값이 존재하며 조용히 무시된다
  — 근거: 커밋 `15fbff7`의 `docs/migration/notion-site-inventory.md`
  (이 브랜치에는 없다. `git show 15fbff7:docs/migration/notion-site-inventory.md`로 확인)
- 학기 점수 `score = year + sem/10`(`:176`)이 **암묵적 인코딩**이고 의도가 적혀 있지 않다
- `\s*`로 `회 장` 표기를 허용한다 — 데이터가 지저분하다는 뜻인데 그 사실이 기록돼 있지 않다

**제안**: 직책 매핑을 `constants.ts` 테이블로 빼고, 학기 비교는 `utils.ts`의 기존 학기 어휘
(`getSemesterInfo`, `getSemesterKeyFromDate`)와 통일한다. 지금은 학기 표현이 두 종류다.

---

## M-13 🟠 이름이 두 DB에 중복 저장되고 동기화 경로가 없다

`:31`(개인정보 title)과 `:40`(회원 title)에 같은 `data.name`을 쓴다.
그런데 `updatePrivateInfo`(`:259`)는 phone·background만 바꾸고, **`updateMember`는 존재하지 않는다.**

한쪽 이름을 고치면 영구히 어긋난다. `docs/schema.md:24`가
"Member's full name (matches Members DB)"라고 **코드가 강제하지 못하는 제약**을 적어놨다.

---

## M-2 🟡 KST 날짜 포맷 중복

`:47-49`가 `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })`를 인라인으로 재구현한다.
`utils.ts:63`에 `getKSTDate(date?, onlyDate?)`가 이미 있고 `admin/+page.server.ts`가 쓴다.

**대체 안전성 확인함**: 두 경로 모두 `2026-08-23` 형식으로 동일 출력.
한 자리 월/일(`2026-01-05`)에서도 일치한다. `getKSTDate(undefined, true)`로 교체 가능.

---

## M-4 🟡 `getMemberByEmail`이 거짓 `Member`를 반환

`:79-85`가 `name: ""`, `department: ""`로 채운다. `MemberSchema`(`schema.ts:11-12`)는
둘 다 필수 `z.string()`이라 빈 문자열이 통과한다.

**현재는 안전하다** — 모든 호출부(`hooks.server.ts:52`, `+page.server.ts:145`,
`signup/+page.server.ts:35`, `admin.ts:71`, `seminar/apply`, `events/[id]/[type]`)를 확인했고
**`.name`을 읽는 곳이 없다.** 문제는 타입이 그 제약을 표현하지 않는다는 것이다.

`app.d.ts:11`에 이미 정확한 모양이 있다 — `{ privateInfoId: string; memberId: string }`.
**필요한 타입이 이미 존재하는데 스키마만 과장돼 있다.**

---

## M-12 🟡 `id`와 `memberId`가 항상 동일

`:94-95` 둘 다 `page.id`. `:80`·`:82` 둘 다 `relationProp.relation[0].id`.
`schema.ts:10`이 스스로 인정한다 — `memberId: z.string(), // Alias for 'id'`.

이 파일의 모든 생성 지점에서 증명 가능하게 같은 값인 필수 필드가 둘이다. M-4와 같은 뿌리다.

---

## M-5 🟡 캐시 적용이 제각각

| 함수 | 캐시 |
|---|---|
| `getMemberByEmail` / `getAllMembers` / `getLatestExecutives` | ✅ 5분 / 1분 / 1시간 |
| `getMemberById` / `getPrivateInfo` / `getAllPrivateInfo` | ❌ |

> **초판 정정 2건**:
> ① `getAllPrivateInfo`가 "전체 회원 공지 메일"에 쓰인다고 썼는데 **틀렸다.**
>    유일한 호출부는 `admin.ts:44` `getSearchableMembers()`다.
>    공지 메일 코드는 미머지 `seminar` 브랜치 것이다.
> ② `getPrivateInfo`가 "모든 라우트에서 돈다"는 논거도 **틀렸다.**
>    `getLatestExecutives`가 1시간 `withCache` 안에 있어 내부 호출은 시간당 1회다.
>    실제로 캐시 없이 자주 도는 경로는 `+page.server.ts:172`(대시보드)다.

규칙이 보이지 않는다는 지적 자체는 유효하다. **규칙을 정해 문서화하고 코드가 따르게** 한다.

---

## M-8 🟡 오류와 공석을 구분할 수 없다

`:139-140`, `:199`(공석), `:211`(오류). 접근 계층이 UI 문구를 결정한다.

지적할 값어치가 있는 부분은 **문구가 서버에 있다는 것보다 `catch`(`:209`)가
"Notion 장애"와 "부회장 미지정"을 구분 불가능한 문자열로 뭉갠다는 것**이다.
그리고 그게 `+layout.server.ts:28`을 통해 모든 라우트에 렌더된다.

---

## M-9 🟡 파일 전체 `any` 허용

`:1` `/* eslint-disable @typescript-eslint/no-explicit-any */`

**실측 5곳**: `:70`, `:98`, `:204`, `:252`(relation 접근 4), **`:263` `const props: any = {}`**.

> 초판은 "3곳뿐"이라 쓰고 4개를 나열했다. 둘 다 틀렸다.

`:263`은 relation 접근이 아니라 **Notion 속성 페이로드 빌더**다.
`Record<string, unknown>`이면 `any` 없이 된다 — 제안했던 `getRelationId` 헬퍼로는 안 덮인다.

---

## 지적하지 않은 것

- **함수 길이**: `getLatestExecutives` 외 전부 30줄 이하로 적정
- **`env` 검사 반복**(`if (!dbId) throw` 4곳): 각기 다른 DB이고 메시지가 구체적이다.
  헬퍼로 묶으면 스택이 흐려진다. **현 상태가 낫다**
- **`validateNotionResponse`의 fallback 설계**: `utils.ts` 소관.
  단 이 파일에 구체적 피해 사례가 있어 M-14로 별도 지적함
- **`filter_properties` 사용** ✅ **실측 검증함 (2차)**:
  ```
  없음                    → 속성 10개 전부
  "학과"(이름)            → ["학과"]        ← 학과의 실제 ID는 'Sbe%7B'
  "Sbe%7B"(ID)            → ["학과"]
  ["이름","학과","가입일"] → 3개만          ← 코드가 실제 쓰는 조합
  "없는속성"              → HTTP 400
  ```
  Notion API는 **속성 이름과 ID를 모두 받는다.** 코드가 맞다.
  > 초판은 `이름` 하나로만 테스트했는데, 하필 title 속성의 ID가 문자열 `"title"`이라
  > **이름/ID 구분을 전혀 증명하지 못하는 사례**였다. 불투명 ID를 가진 `학과`로 재검증함.

  동시에 이는 "화이트리스트에 안 넣은 속성은 응답에서 사라진다"는 함정이 **실재함**을 확인해 준다
  (3개 지정 시 나머지 7개가 응답에 없다). 단 **없는 속성명은 400으로 시끄럽게 실패**하므로,
  오타는 조용히 넘어가지 않는다

---

## 우선순위

1. **M-10** — 실제 사용자 영향. 한 줄 수정
2. **M-2 / M-9** — 확실하고 국소적. 회귀 위험 없음
3. **M-11** — 매퍼 통합. M-4·M-12·M-14가 여기로 모인다
4. **M-6 / M-15 / M-7** — 임원 로직 전반. 순수 함수 분리 후 테스트
5. **M-1 / M-13 / M-14** — 정합성. 고아 레코드 원인 조사(P0-5)와 함께
6. **M-3 / M-5** — 전역 규칙 + `docs/CACHE.md` 재작성이 선행

---

## 개정 이력

초판 → 개정판 (검증 에이전트 1회):

| 변경 | 내용 |
|---|---|
| M-1 강등 🔴→🟠 | 고아 레코드 인과 주장 철회. 호출부 증거가 자기 주장과 모순 |
| M-10 신설 🔴 | 캐시 무효화 키 불일치 — 실제 사용자 영향 |
| M-5 정정 | `getAllPrivateInfo` 호출부 오인(미머지 브랜치 코드 인용), 레이아웃 빈도 논거 철회 |
| M-9 정정 | `any` 3곳 → **5곳**, `:263` 누락 |
| M-7 보강 | 근거 커밋 명시, 지어낸 `25-1 기획부장` 삭제 |
| M-3 보강 | `docs/CACHE.md` 자체가 낡음 — 정답지로 쓰면 안 됨 |
| M-11~M-15 신설 | 매퍼 중복 / id 중복 / 이름 비동기화 / 스키마 우회 / 학기 폴백 |
| `filter_properties` | 단정 → **실측 검증**으로 승격 |
