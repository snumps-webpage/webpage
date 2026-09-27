# `src/lib/server/notion/schema.ts`

99줄 · Zod 스키마 7개 + 파생 타입 7개 + 인터페이스 2개
검토 2026-08-24 · 기준 `cd916f6` · **검증 에이전트 1회 반영 (개정판)**

> 초판은 `types.ts`와만 비교하고 **이 파일이 모델링한다는 데이터베이스와는 한 번도 대조하지 않았다.**
> 그 결과 "살아 있다"고 분류한 스키마 2개가 실은 **프로덕션 244행을 매 호출 거부**하고 있다는
> 사실을 놓쳤다. §개정 이력 참조.

---

## 요약

| #                  | 지적                                                                    | 분류   | 심각도 |
| ------------------ | ----------------------------------------------------------------------- | ------ | ------ |
| **SC-9**           | **`MemberSchema`가 회원 231행 전부를 매 호출 거부한다**                 | 버그   | 🔴     |
| **SC-10**          | **`PrivateInfoSchema.email`이 실제 데이터 13행을 거부한다**             | 버그   | 🔴     |
| **SC-1**           | **검증이 강제되지 않는다 — 실패해도 raw를 반환한다 (0/7)**              | 설계   | 🔴     |
| SC-11              | `SeminarRequestSchema.attachment`가 없는 속성을, 틀린 타입으로 선언한다 | 정합성 | 🟠     |
| SC-2               | 타입 5개가 다른 파일에 같은 이름으로 중복 정의                          | 구조   | 🟠     |
| SC-12              | `.optional()`이 전부 헛돌고, 필요한 곳엔 없다                           | 타입   | 🟠     |
| SC-3 · SC-4        | `Event` 필드 모순 · `Activity` 이름 충돌                                | 명명   | 🟡     |
| SC-5 · SC-6 · SC-7 | `rejected` 도달 불가 · 인터페이스 배치 · `memberId` 별칭                | 메모   | 🟡     |

---

## SC-1 🔴 검증이 강제되지 않는다

`utils.ts:15-22`

```ts
const result = schema.safeParse(data);
if (!result.success) {
  console.error(
    ">>> [Notion Validator] Schema Mismatch:",
    result.error.format(),
  );
  return data as T; // ← 원본을 그대로 돌려준다
}
```

**실패해도 데이터가 통과한다.** 콘솔에만 남는다.

따라서 "7개 중 2개가 쓰인다"는 프레이밍 자체가 틀렸다 —
**강제되는 스키마는 0개**다. 두 개는 로그를 만들 뿐이다.

> **초판 오류**: 초판은 "검증 계층이 2/7에만 적용"이라 쓰고,
> 우선순위 2번에 *"적용 쪽이면 `applications.md` AP-2의 `accepted: ""` 누수가 함께 막힌다"*고 적었다.
> **막히지 않는다.** `ApplicationSchema`를 연결해도 Schema Mismatch가 찍히고 `""`가 그대로 흐른다.
> 게다가 나는 **이 동작을 `members.md` M-14에 직접 써 놓고** 이 문서에서 반대로 서술했다.

**제안**: 방침을 정한다. (a) 실패 시 던지고 호출부가 처리한다, (b) 실패 시 안전한 기본값으로
치환한다, (c) 검증을 포기하고 스키마를 타입 선언으로만 쓴다.
**지금은 셋 다 아니고, 있다는 착각만 준다.**

---

## SC-9 🔴 `MemberSchema`가 회원 231행 전부를 거부한다

`schema.ts:14` `privateInfoId: z.string()` — **필수**.

`getAllMembers`(`members.ts:111-129`)는:

- `filter_properties`에 `MEMBER_TO_PRIVATE`를 **넣지 않는다**(`:114-118`)
- 매퍼가 `privateInfoId`를 **만들지 않는다**(`:122-128`은 id·memberId·name·department·joinDate뿐)

그리고 그 결과를 `validateNotionResponse(MemberSchema, ...)`에 넣는다.

**실측: 회원 DB 231행. 매 캐시 미스마다 231건 전부 safeParse 실패.**
→ `>>> [Notion Validator] Schema Mismatch` 로그 231줄.

SC-1 때문에 데이터는 그대로 흐르므로 **기능은 멀쩡해 보이고 로그만 오염된다.**
그리고 `MemberRepository.findAll(): Promise<Member[]>`(`MemberRepository.ts:15-17`)가
`privateInfoId: string`이 있다고 **타입으로 약속하는데 실제로는 없다.**
`any` 경유라 TS가 못 잡는다.

**수정**: `privateInfoId`를 `.optional()`로 하거나, 목록 조회에서 relation을 함께 가져온다.
전자가 맞다 — 목록 화면은 그 값이 필요 없다.

---

## SC-10 🔴 `PrivateInfoSchema.email`이 실제 데이터를 거부한다

`schema.ts:21` `email: z.string().email()`.

`getPropertyValue`는 값이 없으면 `""`를 반환하고(`utils.ts:30`), `""`는 `.email()`을 통과 못 한다.

**실측: 개인 정보 240행 중 이메일이 비어 있는 행이 13개.**
`getAllPrivateInfo`(`members.ts:247-256`)가 240행 전부를 이 스키마에 통과시키므로
**매 호출 13건 실패**한다.

이것도 SC-1 때문에 조용히 흘러간다. 다만 `applications.md` AP-2에서 지적한
"`accepted: ""`가 `Application`인 척 흘러간다"와 **정확히 같은 구조**이고,
여기서는 **이미 일어나고 있다.**

> 🔴 **초판은 이 항목을 "지적하지 않은 것"에 넣고 "맞다"고 명시적으로 승인했다.**
> "이메일을 담는 스키마가 그 둘뿐이므로 맞다"고 썼는데,
> **담는 것과 항상 채워져 있는 것은 다른 문제**다. 면죄부를 잘못 준 자리다.

---

## SC-11 🟠 없는 속성을, 틀린 타입으로 선언한다

`:71` `attachment: z.string().optional()`

두 가지가 틀렸다:

1. **속성이 없다.** 세미나 신청 DB 스키마(실 API 확인)는
   `설명 · 진행자 · 예상 소요 시간 · 승인됨 · 선수 지식 · 제목` 여섯이고 `강의 자료`가 없다.
   `seminars.md` S-1에서 이것 때문에 조회가 400으로 죽는다는 것을 확인했다
2. **타입도 틀렸다.** `강의 자료`가 실재하는 세미나 _기록_ DB에서 그 속성은 `files` 타입이고,
   `getPropertyValue`는 `files`에 대해 **`string[]`을 반환한다**(`utils.ts:62-65`).
   `z.string()`이 아니라 `z.array(z.string())`이어야 한다

즉 이 한 줄이 **존재하지 않는 속성을, 존재한다면 가졌을 타입과도 다르게** 선언한다.

---

## SC-2 🟠 타입 5개가 같은 이름으로 중복 정의됐다

| 이름             | 여기  | 경쟁 정의     | 이기는 쪽                          |
| ---------------- | ----- | ------------- | ---------------------------------- |
| `Member`         | `:8`  | `types.ts:74` | **여기** (`MemberRepository.ts:2`) |
| `Application`    | `:30` | `admin.ts:20` | **`admin.ts`**                     |
| `Activity`       | `:43` | `types.ts:9`  | **`types.ts`**                     |
| `SeminarRequest` | `:64` | `types.ts:19` | **`types.ts`**                     |
| `Event`          | `:78` | `types.ts:51` | **`types.ts`**                     |

**`Member`만 이 파일이 이기고 넷은 진다.** 규칙이 없어 새 코드가 매번 판단해야 한다.
죽은 정의는 **5개**다 (`types.ts` Member + 여기 넷).

> 초판 정정: "6개"라 썼다. **5개다.** `types.ts:22`도 오기 — `SeminarRequest`는 `:19`다.

그리고 **세 번째 정의가 더 있다** — `admin/+page.svelte:17`(`Application`),
`:29`(`SeminarRequest`), `:38`(`Event`)에 컴포넌트 로컬 인터페이스가 또 있다.
같은 도메인 개념이 **세 곳**에 선언돼 있다.

---

## SC-12 🟠 `.optional()`이 헛돌고, 필요한 곳엔 없다

`getPropertyValue`는 **`undefined`를 반환하지 않는다** — `""`·`false`·`0`·`[]`를 반환한다
(`utils.ts:30, 41, 43, 47, 49, 67`).

그러므로 `joinDate?` · `remarks?` · `url?` · `background?` · `attendees?` · `speakerIds?` · `date?`는
**전부 도달할 수 없는 선언**이다. 실제 "빈 값"은 `""`나 `[]`인데
비-optional `z.string()`이 `""`를 조용히 받아들인다.

반대로 진짜 `undefined`가 될 수 있는 필드는 `?.relation?.[0]?.id`로 만드는 둘뿐이다:

- `privateInfoId` — **필수로 선언돼 있어 SC-9로 터진다**
- `memberId` — optional, 맞다

**optional이 정확히 반대 집합에 붙어 있다.**

---

## SC-3 · SC-4 🟡 `Event` 필드 모순 · `Activity` 이름 충돌

- **SC-3**: `date: z.string().optional()` vs `types.ts:55 date: string`,
  `status: z.string()` vs `types.ts:57` 유니온.
  > 초판은 여기에 "실제 버그가 사는 자리"라고 썼다. **과했다.**
  > `NOTION_DB_EVENTS`가 `.env`에 없어 `events.ts:18-19`가 `[]`를 반환하므로
  > 측정 가능한 환경에서 이벤트 경로는 무동작이다. 계약 불일치는 사실이지만 🟡이다
- **SC-4**: `schema.ts`의 `Activity`는 Notion 행, `types.ts`의 `Activity`는 대시보드 뷰 모델
  (`attendees` ≠ `attended`). `types.ts`는 `NotionActivity` → `Activity`로 구분하는데
  여기는 원본을 그냥 `Activity`라 부른다. 이름을 `ActivityRow`로 바꾸면 해소

---

## SC-5 · SC-6 · SC-7 🟡 메모

- **SC-5** `:72` `z.enum([... "rejected"])` — 저장은 `승인됨` checkbox 하나라
  `"rejected"`를 담을 수 없다(실 API로 신청 DB 스키마 확인: status 필드 자체가 없음).
  반려는 아카이브로 처리한다. `types.ts:27`에도 같은 enum이 복제돼 있다
- **SC-6** `:91-99` `ExecutiveInfo`·`LatestExecutives`는 Zod가 아니고
  Notion 원본도 아니다(`getLatestExecutives`가 조립한 결과). `members.ts`가 맞는 자리
- **SC-7** `:9-10` `id`와 `memberId`가 세 생성 지점(`members.ts:80/82`, `:94/95`, `:123/124`)
  전부에서 동일하다. 주석의 "to maintain compatibility"가 무엇과의 호환인지 안 적혀 있다

---

## 지적하지 않은 것

**초판의 비지적 3건은 전부 철회한다. 세 개 다 틀렸다.**

| 초판 주장                                                        | 실제                                                                                                                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "`z.string().email()`이 그 둘뿐이라 **맞다**"                    | **틀렸다.** 실 데이터 13행이 거부된다 → SC-10                                                                                                                      |
| "`Member.privateInfoId`는 호출부 문제이고 **스키마는 정확하다**" | **틀렸다.** `getAllMembers`가 아예 안 만든다 → SC-9. 게다가 근거로 인용한 `members.md` M-4는 `name`/`department`에 대한 것인데 `privateInfoId`로 **잘못 인용**했다 |
| "이 디렉터리에서 **유일하게** `any`가 없는 파일"                 | **틀렸다.** `index.ts`·`utils.test.ts`도 `any`가 없다. 세 개다                                                                                                     |

남는 비지적: **없음.**

---

## 우선순위

1. **SC-1** — 검증 방침 결정. 이걸 정하지 않으면 SC-9·SC-10을 고쳐도 다음 불일치가 또 조용히 흐른다
2. **SC-9 / SC-10** — 지금 프로덕션에서 244행이 실패하고 있다. 각각 한 줄
   (`privateInfoId` optional화, `email`을 `z.string()`으로 완화하거나 빈 행 필터)
3. **SC-11** — `seminars.md` S-1 수정과 함께. 속성 존재 여부부터 결정
4. **SC-2 / SC-12** — 정본 결정 + optional 재배치. `types.ts`(A-28)와 함께 봐야 결론이 난다
5. **SC-3 ~ SC-7** — 이후

---

## 개정 이력

| 변경                  | 내용                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| **SC-9 신설 🔴**      | `MemberSchema`가 231행 전부 거부 — 실측                                               |
| **SC-10 신설 🔴**     | `PrivateInfoSchema.email`이 13행 거부 — 실측. **초판이 "맞다"고 승인한 항목**         |
| **SC-1 재구성 🟠→🔴** | "2/7 적용" → **강제되는 것 0개**. 실패해도 raw 반환. `members.md` M-14와 모순됐음     |
| **SC-11 신설 🟠**     | 없는 속성 + `files`인데 `z.string()`                                                  |
| **SC-12 신설 🟠**     | optional이 정확히 반대 집합에 붙어 있다                                               |
| SC-2 정정             | 죽은 정의 "6개"→**5개**, `types.ts:22`→`:19`, 세 번째 정의(`admin/+page.svelte`) 추가 |
| SC-3 강등             | "실제 버그가 사는 자리" 철회 — 이벤트 경로는 env 부재로 무동작                        |
| SC-8 철회             | 출석 큐를 "실재하는 DB"라 했으나 env에 없다. 근거 없는 단정이었음                     |
| 비지적 3건 전부 철회  | 셋 다 틀렸고, 하나는 자기 문서를 오인용                                               |
| 분량                  | 200줄 → 실측 근거로 교체하며 압축                                                     |
