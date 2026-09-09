# `src/lib/server/notion/applications.ts`

120줄 · 함수 5개(+별칭 1) · 가입 신청(Applications) DB 접근 계층
검토 2026-08-24 · 기준 `cd916f6` · **검증 에이전트 1회 반영 (개정판)**

> 초판은 AP-1의 결과 사슬을 **세 지점에서** 잘못 추적했고, AP-4는 **적용하면 관리자 화면이
> 비는** 처방을 냈으며, 비지적 항목 하나는 **존재하지 않는 코드를 "확인했다"고 썼다.**
> §개정 이력 참조.

---

## 요약

| # | 지적 | 분류 | 심각도 |
|---|---|---|---|
| **AP-9** | **`hooks.server.ts`가 감싸지 않은 함수를 써서 Notion 장애 시 전 보호 라우트가 500** | 버그 | 🔴 |
| **AP-10** | **중복 신청 행이 생길 수 있고, `notionQueryFirst`가 정렬 없이 아무거나 집는다** | 버그 | 🔴 |
| AP-11 | 관리자 UI가 "영구적으로 삭제됩니다"라고 하지만 실제로는 아카이브 | 신뢰성 | 🟠 |
| AP-12 | `removeApplication`이 오류를 삼키고 성공으로 보고한다 | 버그 | 🟠 |
| AP-2 | `Application` 타입이 둘이고, **검증되는 쪽이 죽어 있다** | 정합성 | 🟠 |
| AP-13 | `updateApplicationInNotion`이 전체 덮어쓰기라 이름·학과가 되살아난다 | 버그 | 🟠 |
| AP-1 | 승인 후 `application_${email}` 캐시가 안 지워진다 | 버그 | 🟠 |
| AP-3 | 6필드 매퍼가 두 함수에 중복 | 중복 | 🟠 |
| AP-8 | `getPropertyValue`가 `any`라 매핑 6필드 전부 타입이 없다 | 타입 | 🟠 |
| AP-5 · AP-6 · AP-7 | 중복 정규화 · `PHONE` 이름 · 아카이브 별칭 | 메모 | 🟡 |
| ~~AP-4~~ | ~~`filter_properties` 없음 → PII 전량~~ | **철회** | — |

---

## AP-9 🔴 Notion이 흔들리면 모든 보호 라우트가 500

`hooks.server.ts:11`이 **감싸지 않은** `getApplicationByEmail`을 `$lib/server/notion`에서 직접 가져온다.

같은 함수를 `admin.ts:80-90`은 `try/catch`로 감싸 `null`을 반환하게 해 두었고,
`+page.server.ts:152`는 **그쪽**을 쓴다.

즉 **같은 함수가 두 호출부에서 정반대 오류 의미를 갖는다**:

| 호출부 | 래핑 | Notion 장애 시 |
|---|---|---|
| `+page.server.ts:152` (대시보드) | ✅ `admin.ts` 래퍼 | `null` → 화면이 degrade |
| `hooks.server.ts:57` (**membershipGuard**) | ❌ 원본 | **예외 전파 → 500** |

`notionQuery`는 실패를 다시 던진다(`client.ts:102`).
`membershipGuard`는 **모든 페이지 로드 전에** 실행되므로,
Notion 502 한 번에 **비회원 로그인 사용자의 모든 보호 라우트가 500**이 된다.
홈은 멀쩡히 뜨는데 나머지가 전부 죽는 형태라 원인을 짚기도 어렵다.

**수정**: 훅에서도 래핑된 쪽을 쓰거나, 훅 안에서 자체 `try/catch`로 `null` 처리한다.

---

## AP-10 🔴 중복 신청 → 영구 잠김

`:24-26`

```ts
const page = await notionQueryFirst(dbId, {
  filter: { property: NOTION_PROPS.EMAIL, email: { equals: email } },
});
```

**`sorts`가 없다.** `notionQueryFirst`(`client.ts:113-117`)는 `page_size: 1`로 조회해
`results[0]`을 집는다 — **Notion이 주는 순서 그대로, 즉 임의다.**

그리고 중복이 실제로 생길 수 있다:
- `createApplicationInNotion`(`:96`)에 **유일성 검사가 없다**
- `signup/+page.server.ts`의 **액션**(`:63-105`)은 기존 신청을 다시 확인하지 않는다.
  확인은 `load`(`:45-49`)만 하고, 그건 60초 캐시된 목록을 본다

→ 더블 서브밋이나 캐시 만료 직전 재제출로 **행 두 개**가 만들어진다.
승인은 그중 한 페이지 id의 `수락됨`을 켜는데, 가드는 다른 쪽을 읽을 수 있다.
**TTL이 지나도 해소되지 않는 영구 잠김**이다.

> AP-1(60초 지연)과 달리 이건 시간이 고쳐주지 않는다. 초판은 `notionQueryFirst`를
> 인용해 놓고 **그것이 임의의 행을 집는다는 사실을 보지 못했다.**

**수정**: 생성 전 유일성 검사, 그리고 조회에 `sorts`(예: 생성일 내림차순) 추가.

---

## AP-11 🟠 UI는 영구 삭제라고 하고 코드는 아카이브한다

`admin/+page.svelte:626`·`:678`

```svelte
confirmMessage={app.accepted ? '신청 내역을 삭제하시겠습니까?'
                             : '정말 거절하시겠습니까? 신청 내역이 영구적으로 삭제됩니다.'}
```

실제 동작은 `removeApplicationInNotion` = `notionArchive` → `PATCH { archived: true }`
(`client.ts:186-204`). **Notion 휴지통으로 가고 복구 가능하다.**

관리자가 "영구 삭제"로 알고 누르는데 데이터는 남는다. 개인정보 처리 관점에서
**약속과 실제가 어긋나는 것 자체가 문제**다 — 남아 있으면 남아 있다고 말해야 한다.

> 부기: 이 감사 시리즈에서 **내가 정확히 반대 방향으로 틀린 적이 있다**
> (`client.md` 초판에서 아카이브를 "영구 삭제"로 단정). 코드를 오해했던 그 자리에서,
> 제품이 사용자에게 같은 거짓말을 하고 있는 것은 못 봤다.

---

## AP-12 🟠 삭제 실패를 성공으로 보고한다

`admin.ts:133-139`가 `removeApplicationInNotion` 오류를 잡아 `console.error`만 하고
**다시 던지지 않는다.**

→ `handleAdminAction`은 `{ success: true }`를 반환하고
→ `admin/+page.svelte:627`이 `'신청 내역이 삭제되었습니다.'`를 띄운다

**Notion이 4xx를 내도 관리자는 삭제됐다고 본다.** AP-11과 겹쳐서,
"영구 삭제됐다"고 안내받은 항목이 실제로는 아카이브조차 안 됐을 수 있다.

---

## AP-2 🟠 `Application` 타입이 둘이고 검증되는 쪽이 죽어 있다

| 정의 | 검증 | 사용처 |
|---|---|---|
| `schema.ts:30` `ApplicationSchema` + `type Application` | Zod ✅ | **0곳 — 죽어 있다** |
| `admin.ts:20-29` `export interface Application` | 없음 ❌ | `signup/+page.server.ts:4`, `signup/edit/+page.server.ts:7`, `admin.ts:83` 반환 타입 |

> **초판 정정**: 초판은 "스키마가 정의만 되고 안 쓰인다"로만 적고
> **경쟁하는 두 번째 정의가 프로덕션에서 쓰이고 있다는 사실을 놓쳤다.**
> 그래서 초판이 제시한 선택지 중 "안 쓸 거면 스키마를 지운다"는 **틀린 처방**이다 —
> 지우면 검증 없는 쪽이 유일한 정의로 굳는다.

이 파일의 두 매퍼(`:30-39`, `:55-64`)는 검증 없이 raw 객체를 반환한다.
`validateNotionResponse`를 쓰는 모듈은 **`members.ts` 하나뿐**이다
(데이터 모듈 5개 중 1개 — `activities`·`applications`·`events`·`members`·`seminars`).

> 초판은 "6개 중 1개"라고 썼다. **5개다.**

결과: `수락됨` 속성이 없거나 비면 `getPropertyValue`가 `""`를 돌려주고(`utils.ts:30`)
`accepted: ""`가 `Application`인 척 흘러간다. `!app.accepted`가 참이므로
**승인된 사람이 미승인으로 판정된다.**

---

## AP-13 🟠 수정이 전체 덮어쓰기라 이름·학과가 되살아난다

`:75-94`는 네 필드를 **전부 필수로 받아 무조건 쓴다.**
같은 디렉터리의 `updatePrivateInfo`(`members.ts:259-271`)는 선택 필드를 조건부로 조립한다 —
**같은 계층에서 정반대 계약**이다.

유일한 호출부 `signup/edit/+page.server.ts:64-69`는 사용자가 전화·배경만 고치게 하면서
`name`·`department`를 **`parseGoogleName(session.user.name)`에서 매번 새로 유도해 다시 쓴다.**

→ 구글 표시 이름 형식이 바뀌면 **신청자의 저장된 이름·학과가 조용히 덮어써진다.**
`background`는 검증이 없어 `""`로 비워질 수 있다. 이메일은 아예 수정 불가.

---

## AP-1 🟠 승인 후 `application_${email}` 캐시가 안 지워진다

`:18` 키 `` `application_${email}` ``, TTL **60초**. 무효화하는 코드가 없다
(`grep -rn 'application_' src/` → 이 파일 1건).

`admin/+page.server.ts:102`의 무효화 목록은
`[\`member_${id}\`, "all_applications", "all_members"]` — `id`는 **신청 페이지 id**라
존재하지 않는 키를 지운다.

> **초판 정정 ① — "`/wait`에 갇힌다"는 거짓이다.**
> `hooks.server.ts:47-49`가 `/wait`를 `isAuthAllowed`로 조기 반환하므로
> **`/wait` 요청에는 `locals.member`·`locals.userApplication`이 아예 설정되지 않는다.**
> 그래서 `wait/+page.server.ts:17`이 `!application`으로 판단해 `/signup`으로 보내고,
> `signup/+page.server.ts:47`이 다시 `/signup/edit`으로 보낸다.
> 사용자는 대기 화면이 아니라 **신청 수정 폼**을 본다.
> (부수 발견: `/wait`는 그 대상 사용자에게 사실상 도달 불가능한 페이지다 — 이 파일 범위 밖)

> **초판 정정 ② — 승인이 회원 캐시를 스스로 되살린다.**
> `admin/+page.server.ts:92`가 `getMemberByEmail(app.email, true)`를 부른다.
> `cache.ts`에서 `skipCache`는 **읽기와 Redis 쓰기만** 막고
> **로컬 캐시 쓰기는 무조건 실행된다**(가드 밖).
> 즉 승인 시점에 `member_${email}`이 실제 회원 값으로 **덮어써진다.**
> 같은 인스턴스라면 사용자는 바로 통과한다. 초판은 이 줄을 못 봤다.

> **초판 정정 ③ — 5분은 이 파일 것이 아니다.**
> 300초는 `member_${email}`(`members.ts:57`)의 TTL이고 이미 `members.md` M-10 🔴이다.
> 회원 조회가 회원을 돌려주면 `hooks.server.ts:55`는 신청 캐시를 **읽지도 않는다.**
> 이 파일의 결함이 기여하는 것은 **최대 60초**, 그것도 "어느 비회원 화면이 뜨는가"에만 해당한다.
> 초판은 M-10을 다른 문서에서 새 🔴로 다시 계상했다.

**구조적 원인**: 무효화 배열이 **바깥 스코프**에서 만들어지는데 거기엔 `id`밖에 없다.
`app.email`은 클로저 안(`:73`)에서야 해석된다. 그래서 `member_${id}`가 쓰였다.
**처방은 키 헬퍼가 아니라 무효화를 클로저 안으로 옮기거나
`handleAdminAction`이 키 생성 콜백을 받게 하는 것**이다.

---

## AP-3 🟠 매퍼 중복

`:30-39`와 `:55-64`가 **6필드 + `submittedAt`**을 동일하게 만든다.
AP-2의 검증을 넣을 때도 두 곳이다. `toApplication(page)` 하나로.

---

## AP-8 🟠 매핑 6필드가 전부 `any`

`utils.ts:29` `export function getPropertyValue(property: any): any`.

**`(page as any)` 두 곳만의 문제가 아니다** — 매퍼가 만드는 여섯 필드가 전부 `any`다.
그래서 `admin.ts:83`의 `Promise<Application | null>`(`accepted: boolean`)이
`accepted`에 `""`가 들어와도 **컴파일된다.**

> **초판 정정**: 초판은 이걸 🟢 스타일 메모로 두고 파일 전체 `any` 허용을 "정당"이라 했다.
> 그런데 **AP-2가 설명한 `accepted: ""` 누수의 메커니즘이 바로 이것**이다.
> 두 절이 서로 모순됐다.

---

## AP-5 · AP-6 · AP-7 🟡 메모

- **AP-5** `:71` `NOTION_PROPS.APP_ACCEPTED.normalize("NFC")` — `constants.ts:6`의 `n()`이
  이미 정규화한다. `grep -rn 'normalize("NFC")' src/` → **`constants.ts:6`과 여기 둘뿐**.
  코드베이스 유일한 중복 정규화
- **AP-6** `PHONE`=`"전화번호"` / `PHONE_APP`=`"전화 번호"`. **실 API로 두 DB 확인**:
  가입 신청은 `전화 번호`(공백), 개인 정보는 `전화번호`. 상수가 정확히 대응한다 — 버그 아님.
  다만 `PHONE_APP`이라는 이름이 어느 DB 것인지 말해주지 않는다
- **AP-7** `notionArchive` 별칭이 이 디렉터리에 **넷**
  (`events.ts:95`, `:136`, `seminars.ts:210`, `applications.ts:120`).
  DB 소속 검사가 없고 이름이 동작(아카이브)과 다르다. 호출부는 관리자 게이트 뒤(확인)

---

## ~~AP-4~~ **철회** — `filter_properties`로 줄일 것이 없다

초판은 `:53` `notionQuery(dbId)`에 `filter_properties`가 없어 **PII를 전량 끌어온다**고 지적하고,
`accepted` 필터 추가를 우선순위 4번으로 제시했다. **둘 다 틀렸다.**

실 API 확인:

```
가입 신청 DB 속성: 6개 — 학과, 이메일, 수락됨, 배경 지식, 전화 번호, 이름
코드가 읽는 속성:  6개
→ filter_properties 로 줄일 수 있는 속성: 없음
```

**매퍼가 여섯 개를 전부 읽는다.** 응답은 바이트 단위로 동일하다. PII 축소는 일어날 수 없다.

그리고 `accepted` 필터는 **적용하면 프로덕션이 깨진다**:

```
행 9개 — 수락됨 true: 9 / false: 0
```

- `admin/+page.svelte:591,606,624`가 승인된 신청을 **의도적으로 렌더한다**
- `admin/+page.server.ts:74-76`이 `apps.find(...)` 후 `if (app.accepted) throw "Application already accepted"`로
  **중복 승인을 막는다.** 필터를 걸면 `find`가 undefined가 되어 가드가 "없음"으로 바뀐다

→ 관리자 목록이 비고 중복 승인 가드가 무력화된다.

남는 것은 "이 디렉터리에서 유일하게 `filter_properties`가 없는 조회"라는 **일관성 메모(🟢)**뿐이다.

---

## 지적하지 않은 것

- **`markApplicationAsAccepted`·`updateApplicationInNotion`에 `dbId` 검사가 없는 것**:
  둘 다 페이지 id를 직접 받으므로 DB id가 필요 없다. `notionUpdate`는
  `/v1/pages/{id}`를 PATCH한다(`client.ts:157-181`). **맞다**
- **빈 JSDoc**(`:2-3`): 이 디렉터리 데이터 모듈 5개 중 4개가 동일
  (activities · applications · events · seminars). 템플릿 잔재

> **초판이 여기 넣었다가 철회하는 항목**:
> "`createApplicationInNotion`이 `null`을 반환해도 호출부 `admin.ts`가 받아 처리한다 —
> 여기서도 확인했다"라고 썼다. **확인하지 않았고, 그런 처리가 없다.**
> `admin.ts:106-113`은 `const id = await createApplicationInNotion(app);`
> 다음 줄에서 곧바로 `return { ...app, id, ... }`다. **null 검사가 없다.**
> `id: null`인 객체가 그대로 반환된다.
> 현재 무해한 이유는 호출부(`signup/+page.server.ts:94`)가 반환값을 **버리기** 때문이지
> 누가 처리해서가 아니다.
> `seminars.md` S-7에서는 **없는 피해를 지어냈다가** 호출부의 `throw`를 확인하고 철회했는데,
> 여기서는 반대로 **없는 처리자를 지어내 비지적을 정당화했다.** 더 나쁜 실수다.

---

## 우선순위

1. **AP-9** — 훅의 감싸지 않은 호출. Notion 장애 시 전 보호 라우트 500. 한 줄
2. **AP-10** — 중복 신청 + 임의 행 선택. 시간이 고쳐주지 않는 유일한 잠김
3. **AP-11 / AP-12** — 관리자에게 거짓을 보고한다. 문구 수정 + 오류 재전파
4. **AP-2 / AP-8** — 타입 둘 중 하나로 통일하고 검증 적용. `accepted: ""` 누수의 뿌리
5. **AP-13** — 부분 수정으로 변경
6. **AP-1** — 무효화를 클로저 안으로. **단독 영향은 60초**
7. **AP-3** — 매퍼 통합
8. **AP-5 / AP-6 / AP-7** — 정리. AP-7은 디렉터리 4곳을 한 번에

---

## 개정 이력

| 변경 | 내용 |
|---|---|
| **AP-9 신설 🔴** | 훅이 감싸지 않은 `getApplicationByEmail`을 쓴다 |
| **AP-10 신설 🔴** | 중복 행 가능 + `notionQueryFirst`가 정렬 없이 임의 행 선택 |
| **AP-11·AP-12 신설 🟠** | UI "영구 삭제" vs 아카이브 / 삭제 실패를 성공 보고 |
| **AP-13 신설 🟠** | 전체 덮어쓰기로 이름·학과가 되살아남 |
| **AP-4 철회** | 속성 6개를 전부 읽으므로 줄일 것이 없고, `accepted` 필터는 프로덕션을 깬다 |
| AP-1 강등 🔴→🟠 | `/wait` 도달 불가, 승인이 회원 캐시를 되살림, 5분은 M-10 것 |
| AP-2 재구성 | "죽은 스키마" → **경쟁하는 두 정의, 검증되는 쪽이 죽음**. "6개 모듈" → 5개 |
| AP-8 승격 🟢→🟠 | `getPropertyValue: any`가 AP-2 누수의 실제 메커니즘 |
| 비지적 1건 철회 | 존재하지 않는 null 처리자를 "확인했다"고 씀 |

### 3차 — 판정 기준 정정 (2026-08-25)

| 변경 | 내용 |
|---|---|
| AP-1 근거 정리 | 등급(🟠)은 유지. 단 **"`/wait` 도달 불가"를 감면 사유에서 제거** — 도달성은 증상의 크기를 정하지 결함의 유무를 정하지 않는다. 무효화 키가 캐시 키와 다르다는 것이 결함이고, 라우트가 살아나면 그대로 드러난다 |
