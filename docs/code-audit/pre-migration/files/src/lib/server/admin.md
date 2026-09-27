# `src/lib/server/admin.ts`

146줄 · export 10개(함수 8 + 인터페이스 2) · 가입 신청 서비스 + 관리자 판정
검토 2026-08-28 · 기준 `cd916f6` · **검증 에이전트 1회 반영 (개정판)**

> 초판은 「지적하지 않은 것」에서 **거짓 전제로 면죄부를 줬다** —
> "하위 두 함수가 각각 캐시된다"고 썼는데 `getAllPrivateInfo`는 캐시가 없다.
> 그리고 AD-1의 피해 범위와 처방이 틀렸다. §개정 이력 참조.

> 이 파일은 다른 세 리뷰가 미뤄둔 판정의 정본이다 —
> `mail/templates.md` MT-8, `notion/applications.md` AP-9·AP-2.

> 판정 기준은 `README.md` §판정 기준. "현재 설정값으로는 안 터진다"는 감면 근거가 아니다.

---

## 요약

| #         | 지적                                                                      | 분류      | 심각도 |
| --------- | ------------------------------------------------------------------------- | --------- | ------ |
| **AD-13** | **훅에 관리자 우회가 없어 비회원 관리자가 `/admin`에 도달할 수 없다**     | 버그      | 🔴     |
| **AD-1**  | **래퍼와 피래퍼의 export 이름이 같아, 전역 훅이 감싸지 않은 쪽을 집었다** | 버그      | 🔴     |
| AD-14     | `getSearchableMembers`가 매 호출마다 개인정보 DB 전수를 무캐시로 긁는다   | 성능      | 🟠     |
| AD-15     | 회원 전원의 이메일이 모든 인증 사용자의 브라우저로 전송된다               | 노출      | 🟠     |
| AD-2      | 관리자 게이트가 6곳에 인라인 복제돼 있고 응답이 제각각이다                | 보안      | 🟠     |
| AD-3      | `isAdmin`이 대소문자를 구분한다                                           | 버그      | 🟠     |
| AD-4      | `ADMINS_EMAILS` 파서가 두 벌이고 갈라져 있다                              | 중복      | 🟠     |
| AD-6      | `addApplication`이 `null` id를 검사 없이 반환한다                         | 버그      | 🟠     |
| AD-7      | `submittedAt`을 지어낸다 — 어디에도 저장되지 않는 값이다                  | 정합성    | 🟠     |
| AD-5      | 이 파일에 오류 처리 규약이 없다 — 같은 계층에서 **네 가지**               | 오류 처리 | 🟠     |
| AD-8      | `getSearchableMembers`가 회원을 조용히 뺀다 — 발표자로 선택 불가          | 도메인    | 🟡     |
| AD-16     | "관리자다"의 파생이 셋이고 서로 다른 답을 낼 수 있다                      | 정합성    | 🟡     |
| AD-9      | `SearchableMember.email`이 빈 문자열일 수 있다                            | 타입      | 🟡     |
| AD-10     | `Application` 인터페이스가 `schema.ts`의 동명 타입과 경쟁한다             | 정합성    | 🟡     |
| AD-17     | 계층 역전 — `admin.ts`가 상위 계층 `auth-guards`를 import한다             | 계층      | 🟡     |
| AD-18     | 반환 타입 미선언 3개 + `isAdmin`이 호출마다 env를 재파싱                  | 타입      | 🟡     |
| AD-11     | `updateApplication`만 동적 import                                         | 일관성    | 🟡     |

**호출부 실측** (실호출 수):

```
isAdmin              12   ← 이 파일 최대 소비자. 그중 6곳이 AD-2
getApplications       5   getSearchableMembers  2   resolveActualName  2
getApplicationByEmail 1   addApplication 1   updateApplication 1   removeApplication 1
```

---

## AD-13 🔴 비회원 관리자는 `/admin`에 갈 수 없다

`hooks.server.ts:55-66`:

```ts
if (!member) {
  const app = await getApplicationByEmail(session.user.email);
  event.locals.userApplication = app;

  if (!app && path !== "/signup") {
    throw redirect(303, "/signup");
  }
  if (app && !app.accepted && path !== "/wait") {
    throw redirect(303, "/wait");
  }
}
```

**관리자 우회가 없다.** 회원 레코드가 없는 인증 사용자는 무조건 `/signup`으로 간다.

반면 라우트 세 곳은 전부 관리자를 예외로 둔다:

| 위치                                    | 우회                                                              |
| --------------------------------------- | ----------------------------------------------------------------- |
| `signup/+page.server.ts:39`             | `const isUserAdmin = isAdmin(user.email)`                         |
| `signup/edit/+page.server.ts:22`, `:30` | `if (member && !isAdmin(...))` / `if (!pending && !isAdmin(...))` |
| `wait/+page.server.ts:12`, `:17`        | `if (isMember && !isAdmin)` / `if (!application && !isAdmin)`     |

**훅이 먼저 돈다.** 라우트의 우회는 훅을 통과한 뒤에야 평가된다.
따라서 Notion 회원 DB에 없는 관리자가 갈 수 있는 곳은
`/`, `/signup`, `/wait`, `/signout`뿐이다 — **`/admin`은 도달 불가다.**

### 가정이 아니다

`dev-preview.ts:47-50`이 관리자 미리보기 세션을 이렇게 만든다:

```ts
{ id: "dev-admin", name: "Dev Admin / 운영진 / 수리과학부", email: DEV_PREVIEW_ADMIN_EMAIL }
```

`dev-admin@snu.ac.kr`은 **어느 Notion DB에도 없다.**
`isAdmin:143`이 `dev && email === DEV_PREVIEW_ADMIN_EMAIL`로 관리자 판정을 통과시켜도,
훅이 `member === null`을 보고 `/signup`으로 보낸다.
**관리자 미리보기 기능이 미리보기하려는 화면에 들어갈 수 없다.**

같은 일이 실제 운영에서도 일어난다 — 새 관리자를 `ADMINS_EMAILS`에 넣었는데
아직 회원 승인이 안 됐거나 개인정보 relation이 끊어져 있으면(AD-8의 그 상태)
관리자 화면을 못 연다. 원인을 알려주는 것은 아무것도 없다.

### 이 파일의 몫

AD-2가 "정책을 아무도 소유하지 않는다"를 **응답 축**에서 봤다면,
이것은 **순서 축**의 같은 결함이다. `isAdmin`이 원시 술어로만 존재하고
"관리자는 회원 검사를 건너뛴다"는 규칙이 네 곳에 흩어져 있는데
그중 가장 먼저 도는 곳(훅)에만 없다.

---

## AD-1 🔴 안전판을 만들고 이름을 구별하지 않았다

`:6-15`가 원본을 개명해서 들여오고, `:80-90`이 감싼 것을 **원래 이름 그대로** 내보낸다:

```ts
import { getApplicationByEmail as getApplicationByEmailFromNotion, … } from "./notion";
…
export async function getApplicationByEmail(email, skipCache = false): Promise<Application | null> {
  try { return await getApplicationByEmailFromNotion(email, skipCache); }
  catch (e) { console.error(…); return null; }
}
```

**두 모듈이 같은 이름을 export한다** — `notion/applications.ts:16`(원본)과 여기(`:80`, 래퍼).
**개명이 감싸는 쪽이 아니라 감싸지는 쪽에 붙어 있다.**

| 호출부                      | import 경로              | 얻는 것               |
| --------------------------- | ------------------------ | --------------------- |
| `+page.server.ts:152`       | `$lib/server/admin`      | 래퍼 — 실패 시 `null` |
| **`hooks.server.ts:11,57`** | **`$lib/server/notion`** | **원본 — 예외 전파**  |

`$lib/server/notion`은 4줄 셰임(`notion.ts`) → `notion/index.ts:6` → `applications.ts`로
해석된다. 훅은 감싸지 않은 것을 받는다. 확인했다.

`handleError` 훅은 코드베이스에 **없고**(grep 0건) `routes/+error.svelte:14-16`에
`INTERNAL ERROR` 분기가 있으므로, `handle` 안의 미포착 예외는 진짜 500 페이지가 된다.

### 피해 범위 — 초판이 두 배로 부풀렸다

> **초판 정정.** 초판은 "**로그인한 모든 사용자**의 모든 보호 라우트가 500"이라고 썼다.
> **틀렸다.** `:57`은 `:55` `if (!member)` 안이므로 **비회원만** 도달한다.
> 초판이 근거로 인용한 `applications.md` AP-9가 정확히 "비회원"이라고 적어 놓았는데
> 내가 그것을 인용하면서 범위를 넓혔다.

### 더 중요한 정정 — 이 수정으로 AP-9는 닫히지 않는다

`hooks.server.ts:52`가 **먼저** 돈다:

```ts
const member = await memberRepo.findByEmail(session.user.email);
```

`MemberRepository.findByEmail`(`repositories/MemberRepository.ts:6-8`)은 그냥 위임이고,
`getMemberByEmail`(`members.ts:55-88`) 경로 **어디에도 try/catch가 없다** —
`:61` `if (!dbId) throw`, `withCache`(`cache.ts:99`)는 잡지 않고,
`notionQuery`는 `client.ts:102`에서 재전파한다.

**Notion 장애 + 콜드 캐시면 `:52`가 모든 인증 사용자를 500으로 보낸다.
`:57`에 닿기 전이다.**

AD-1의 실제 delta는 좁다 — **비회원**이면서, 회원 캐시(300초)는 따뜻하고
신청 캐시(60초)는 식은 구간뿐이다.

> 초판 「수정 순서」의 "AP-9가 닫힌다"는 **거짓**이다.
> 훅의 `getApplicationByEmail`을 감싸도 `:52`의 500은 그대로다.
> `applications.md` AP-9도 이 사실을 놓쳤다 — 그쪽도 함께 고칠 것.

### 처방

1. 원본을 `queryApplicationByEmail`처럼 개명해 이름 충돌 자체를 없앤다
2. `hooks.server.ts:52`를 **함께** 감싼다. 그것이 AP-9의 본체다

> 초판은 처방 ②로 "배럴에서 원본을 빼기"를 들고 `notion/index.md` IX-1과 같다고 했다.
> **오인용이다.** IX-1은 `client.ts`/`utils.ts`의 **프리미티브 14개**에 관한 것이고
> 처방이 "도메인 표면만 내보낸다"이므로 `getApplicationByEmail` 같은 도메인 함수는
> **남긴다.** 방향이 반대다. 게다가 배럴에서 빼면 `admin.ts:15` 자신의 import가 깨진다.

---

## AD-14 🟠 매 호출마다 개인정보 DB 전수를 무캐시로 긁는다

`:41-45`:

```ts
const [members, privateInfos] = await Promise.all([
  getAllMembers(), // withCache("all_members", 60000)  — members.ts:104
  getAllPrivateInfo(), // 캐시 없음                          — members.ts:235
]);
```

`members.ts`의 `withCache`는 **`:56`, `:104`, `:136` 세 곳뿐**이고
`getAllPrivateInfo`(`:235-257`)는 `notionQuery`를 직접 부른다.
`skipCache` 매개변수도 없다.

> **초판 면죄부 철회.** 초판은 「지적하지 않은 것」에
> "`getSearchableMembers`가 캐시를 안 쓰는 것 — **하위 두 함수가 각각 캐시된다**"라고 썼다.
> **거짓 전제다.** 한쪽만 캐시된다. 확인하지 않고 통과시켰다.

호출부는 세미나 페이지 두 곳(`seminar/apply:21`, `seminar/edit/[id]:48`)이다.
**두 페이지를 열 때마다 개인정보 데이터베이스 전체가 페이지네이션되어 조회된다.**
`Promise.all`의 병렬성이 그 사실을 가린다.

### 파생 결함: 신선한 것과 낡은 것을 조인한다

`:47-50`이 **실시간** `privateInfos`를 **최대 60초 낡은** `memberMap`에 맞춘다:

```ts
const memberMap = new Map(members.map((m) => [m.id, m]));
return privateInfos.filter((p) => p.memberId && memberMap.has(p.memberId));
```

그 60초 창에 생성된 회원은 `privateInfos`에는 있고 `memberMap`에는 없다 →
**조용히 버려진다**(AD-8). 캐시 비대칭이 데이터 누락으로 나타난다.

두 조회의 캐시 정책을 맞추는 것이 선행이다.

---

## AD-15 🟠 회원 전원의 이메일이 브라우저로 간다

`:31-36` `SearchableMember`가 `email: string`을 담고, `:57`이 채운다.

```
seminar/apply/+page.server.ts:36   members: searchableMembers,      ← 페이로드에 실림
seminar/apply/+page.svelte:91      members={data.members}
SpeakerSelector.svelte:26          m.email.toLowerCase().includes(searchQuery…)   ← 클라이언트 필터
SpeakerSelector.svelte:79          <span class="r-email">{member.email}</span>    ← 화면 표시
```

**모든 인증 사용자의 페이지 페이로드에 전 회원의 이메일 주소가 들어간다.**
검색이 클라이언트에서 돌기 때문이다.

서버는 `email`로 아무것도 하지 않는다 — 그냥 실어 보낸다.
발표자 선택에 필요한 것은 `id`·`name`·`department`이고,
동명이인 구별이 목적이라면 마스킹한 형태(`ab***@snu.ac.kr`)로 충분하다.

`mail/templates.md` MT-12가 훨씬 작은 노출(관리자 주소가 서로에게 보임)을 🟡로 올렸다.
이쪽이 더 크다.

---

## AD-2 🟠 관리자 게이트가 6곳에 복제돼 있다

동일 표현식 `if (!session?.user?.email || !isAdmin(session.user.email))`가 여섯 번:

| 위치                                      | 실패 시 응답                                       |
| ----------------------------------------- | -------------------------------------------------- |
| `admin/events/connect/+page.server.ts:10` | `throw error(404, "Not Found")`                    |
| `admin/events/new/+layout.server.ts:7`    | `throw redirect(302, "/")`                         |
| `admin/events/new/+page.server.ts:15`     | `throw error(404, "Not Found")`                    |
| `admin/events/new/+page.server.ts:40`     | `return fail(401, { error: "Unauthorized" })`      |
| `api/admin/seminar-requests/+server.ts:9` | `json({ error: "Unauthorized" }, { status: 401 })` |
| `api/admin/applications/+server.ts:7`     | 〃                                                 |

**메커니즘 4가지, 상태 코드 3가지**(404 / 302 / 401)다.
`fail(401)`과 `json(…, {status:401})`은 코드가 같다 — 초판이 "응답 4가지"라고 뭉갰다.

**`/admin/events/new` 하나에 게이트가 셋이고 답이 셋이다** —
레이아웃 302, 페이지 load 404, 액션 401. 같은 라우트가 같은 질문에 세 가지로 답한다.

비관리자가 어떤 경로에서는 404(경로 은닉)를, 어떤 경로에서는 302(경로 노출)를 받는다.

`auth-guards.ts:34`·`:52`에 `ensureAdmin`·`requireAdminAction`이 있는데 여섯 곳 다 안 쓴다.
`events.md` SE-8과 같은 형태 — 계층이 있는데 우회된다.
`auth-guards.md` AG-5(기본값이 덜 안전한 쪽)도 이 난립의 일부다.

---

## AD-3 🟠 `isAdmin`이 대소문자를 구분한다

`:144-145`:

```ts
const admins = (env.ADMINS_EMAILS || "").split(",").map((e) => e.trim());
return admins.includes(email);
```

**정확한 문자열 일치**다. `ADMINS_EMAILS`에 `Foo@snu.ac.kr`이 있고
세션이 `foo@snu.ac.kr`을 주면 **조용히 관리자 권한이 사라진다.** 오류도 로그도 없다.

도메인부는 RFC상 비구분이고 Google 계정은 로컬파트도 실무상 비구분이다.
설정 파일에 사람이 손으로 적는 값이므로 대문자가 섞일 여지가 실재한다.

정규화가 **어디에도 없다** — 이 파일에도, `auth.ts`에도.
`auth.ts:22`의 도메인 검사(`email.endsWith("@snu.ac.kr")`)와
`getMemberByEmail`의 Notion 필터(`members.ts:64`)도 같은 문제를 갖는다.

권한 판정에서 조용한 거짓 음성은 거짓 양성만큼 다루기 어렵다 —
관리자가 "왜 안 되지"를 겪고 원인을 찾을 단서가 없다. AD-13과 증상이 겹쳐 진단이 더 어렵다.

---

## AD-4 🟠 `ADMINS_EMAILS` 파서가 두 벌이고 갈라져 있다

| 위치                      | 코드                               |
| ------------------------- | ---------------------------------- |
| `admin.ts:144`            | `.split(",").map((e) => e.trim())` |
| `mail/templates.ts:13-16` | 〃 `+ .filter(Boolean)`            |

후행 쉼표가 있으면 `admin.ts` 쪽 배열에만 `""`가 들어간다.
현재 `.env`의 값에는 쉼표가 **0개**(관리자 1명)라 발현하지 않는다.

> **감면 근거가 아니다.** 오늘 설정값의 성질이지 코드의 성질이 아니다.
> 이 값은 **권한 판정**과 **메일 수신자**를 동시에 정한다 —
> 두 해석이 갈리면 "관리자인데 알림을 못 받는" 또는 그 반대가 생긴다.

**정본을 여기로 한다.** 정규화(AD-3)와 형식 검증을 포함한 목록을
모듈 스코프에서 한 번 만들어 export하고(AD-18) `templates.ts`가 그것을 쓰게 한다.

---

## AD-6 🟠 `null` id를 검사 없이 반환한다

`:103-118`:

```ts
const id = await createApplicationInNotion(app);
return { ...app, id, submittedAt: new Date().toISOString(), accepted: false };
```

`createApplicationInNotion`(`applications.ts:103-104`)은 `if (!dbId) return null`이다.
**검사가 없다.** `id`는 `string | null`이고 그대로 객체에 들어간다.
반환 타입이 선언돼 있지 않아(AD-18) 컴파일러도 침묵한다.

같은 상황을 `createEvent`(`events.ts:64-65`)는 이렇게 처리한다:

```ts
if (!id) throw new Error("Failed to create event in Notion");
```

**두 곳이 같은 계약을 다르게 다룬다.** 한쪽은 던지고 한쪽은 `null`을 흘린다.
`signup:93`이 반환값을 버려서 지금은 드러나지 않는다 — 감면 근거가 아니다.

---

## AD-7 🟠 `submittedAt`을 지어낸다

`:111` `submittedAt: new Date().toISOString()`.

`createApplicationInNotion`(`applications.ts:106-116`)은
**`submittedAt`에 해당하는 속성을 쓰지 않는다.** 읽을 때의 값은 페이지 생성 시각이다:

```
applications.ts:38   submittedAt: (page as any).created_time,
applications.ts:63   submittedAt: (page as any).created_time,
```

**반환된 `submittedAt`은 어디에도 저장되지 않은 값**이고,
같은 신청을 다시 읽으면 다른 값(Notion 서버 시각)이 온다.

함수가 자기가 모르는 것을 사실처럼 반환한다 — `mail/templates.md` MT-11과 같은 형태다.
모르면 반환하지 않거나, 생성 후 재조회해서 실제 값을 담아야 한다.

> **초판 정정.** 초판은 "UTC ISO라서 KST를 쓰는 도메인과 어긋난다, 세 번째 시간 표현"이라고
> 덧붙였다. **틀렸다.** Notion `created_time`도 UTC ISO-8601이므로 **형식은 동일하다.**
> 게다가 비교 대상으로 든 `getKSTDate`는 `events.md` SE-5가 밝혔듯
> KST 벽시계에 `Z`를 붙인 잘못된 표현이다. 지적은 첫 논거만으로 성립한다.

---

## AD-5 🟠 오류 처리 규약이 없다 — 같은 계층에서 네 가지

| 함수                    | 줄         | 실패 시                   |
| ----------------------- | ---------- | ------------------------- |
| `addApplication`        | `:114-117` | log + **rethrow**         |
| `updateApplication`     | `:127-130` | log + **rethrow**         |
| `removeApplication`     | `:136-138` | log + **삼킴**            |
| `getApplicationByEmail` | `:84-89`   | `null`                    |
| `getApplications`       | `:95-100`  | `[]`                      |
| `resolveActualName`     | `:66-78`   | **전파** (try/catch 없음) |
| 〃                      | `:69`      | `""` — 이메일 없을 때     |

**여덟 함수 중 여섯이 실패를 다루는데 규약이 넷이다.**

**① `removeApplication`의 삼킴.** `admin/+page.server.ts:112`가 성공으로 보고한다 —
UI는 "삭제되었습니다"인데 Notion에는 남아 있을 수 있다(`applications.md` AP-12, AP-11).

**② rethrow 두 개는 로그만 중복시킨다.** 둘 다 `handleUserAction`을 거치고
`auth-guards.ts:126`이 다시 `console.error("[Action Error]", e)`를 찍는다.
같은 예외가 두 줄로 남고 이 파일이 더하는 정보는 없다(`notion/client.md` C-4).
(초판은 `:184`도 인용했는데 그것은 `handleAdminAction` 경로다 —
`removeApplication`이 rethrow했다면 갔을 자리이지 현재 경로가 아니다.)

**③ `getApplications() → []`의 구체적 피해.** 초판은 추상적으로만 적었다. 실제 경로:

```
Notion 장애 → signup/+page.server.ts:36  apps = []
           → :45  pending = undefined
           → :47  가드 미발동 → 빈 신청서 폼 제공 → 사용자가 제출
           → 중복 행 생성 → applications.md AP-10의 "영구 잠김"
```

대칭으로 `signup/edit/+page.server.ts:18,26,30`은 정당한 대기자를 `/signup`으로 쫓아낸다.
**장애가 데이터 손상으로 전환된다.**

**④ `resolveActualName:69`의 `return ""`.** `AuthenticatedSession`은
`user.email: string`을 선언하므로(`auth-guards.ts:4-11`) 이 분기는 계약상 죽어 있고,
살아난다면 `""`는 "회원인데 이름이 없다"와 구별되지 않는다.

> **초판 정정.** 초판은 `resolveActualName`의 전파를 "호출부가 `Promise.all` 안이라
> **전체가 실패한다**"고 썼다. **틀렸다.** 두 호출부 모두 try/catch로 감싸고
> 설계된 대체 동작을 갖는다 — `seminar/apply/+page.server.ts:19-31`이
> `memberDirectoryUnavailable = true`를 세우고
> `actualName = parseGoogleName(session.user.name).name`으로 떨어진다.
> 그 플래그는 UI까지 전달된다(`+page.svelte:92` → `SpeakerSelector.svelte:7`).
> **대체 장기이지 차단기가 아니다.** 전파하는 쪽이 옳다는 결론은 유지되지만,
> 초판이 그 근거로 든 예가 하필 유일하게 제대로 처리된 다리였다.

---

## AD-8 🟡 `getSearchableMembers`가 회원을 조용히 뺀다

`:49-50` `.filter((p) => p.memberId && memberMap.has(p.memberId))`.

**개인정보 행을 기준으로 순회하고 회원과 연결되지 않은 것을 버린다.**
사라지는 경우가 셋이다:

1. 개인정보 행의 relation이 비어 있는 회원
2. **relation이 있는데 대상 회원이 삭제·아카이브된 경우** — `memberMap.has`가 별도로 거른다
3. **60초 캐시 창에 생성된 회원** — AD-14 참조

호출부는 세미나 발표자 선택이다(`seminar/apply:21`, `seminar/edit/[id]:48`).
**빠진 사람은 발표자로 선택할 수 없고**, 빠졌다는 사실이 호출부에 전달되지 않는다.

`privateInfos.length - result.length`를 로그로 남기거나 반환에 포함하면
데이터 정합성 문제가 드러난다.

> 필터 자체는 필요하다 — `:52`의 `memberMap.get(p.memberId!)!`가 안전하려면 있어야 한다.
> 지적은 **버린 것에 대해 아무 말도 하지 않는 것**이다.

---

## AD-16 🟡 "관리자다"의 파생이 셋이다

| 위치                      | 식                                                               |
| ------------------------- | ---------------------------------------------------------------- |
| `admin.ts:141`            | `isAdmin(email)` — 원시 술어                                     |
| `+layout.server.ts:14-16` | `devPreviewRole === "admin" \|\| isAdmin(email)` — **독립 파생** |
| `wait/+page.server.ts:5`  | `event.parent()`의 `isAdmin` — 위 ②의 값을 소비                  |

②는 ①이 거짓일 때도 참일 수 있다. 그리고 `wait`은 ①을 아예 안 부른다.

즉 **술어 자체가 중복돼 있고**, 어느 것이 정본인지 코드가 말하지 않는다.
AD-2가 "정책을 아무도 소유하지 않는다"를 지적했다면 이것은 **술어조차 하나가 아니라는** 것이다.

`isAdmin`이 `dev` 분기(`:143`)를 이미 갖고 있으므로 ②의 `devPreviewRole` 검사와
역할이 겹친다 — 두 곳이 같은 예외를 다르게 표현한다.

---

## AD-9 🟡 `SearchableMember.email`이 빈 문자열일 수 있다

`:57` `email: p.email`. 타입은 `string`(`:35`)이다.

`PrivateInfo.email`의 출처는 `getPropertyValue`이고 없는 속성에 `""`를 준다
(`notion/utils.ts:30`). `PrivateInfoSchema.email`은 `z.string().email()`(`schema.ts:21`)이지만
`validateNotionResponse`가 **실패해도 원본을 통과시킨다**(`utils.ts:15-22`).

**검증이 값을 보고도 통과시킨다.** `notion/schema.md` SC-10의 "개인정보 13행 검증 실패"가 이 경로다.
그 `""`가 AD-15를 거쳐 브라우저까지 간다.

---

## AD-10 🟡 `Application`이 셋이다

| 정의                                            | 검증 | 사용                                             |
| ----------------------------------------------- | ---- | ------------------------------------------------ |
| `admin.ts:20-29` `export interface Application` | 없음 | `app.d.ts:13`, `signup:4,45`, `signup/edit:7,27` |
| `schema.ts:41` `export type Application`        | zod  | **0곳**                                          |
| `admin/+page.svelte:17` `interface Application` | 없음 | 그 컴포넌트 지역                                 |

**같은 이름이고 검증되는 쪽이 죽어 있다**(`applications.md` AP-2).
AD-1과 같은 병이다 — **이름이 겹치는데 안전하지 않은 쪽이 이긴다.**

---

## AD-17 🟡 계층 역전

`:18` `import type { AuthenticatedSession } from "./auth-guards";`
`auth-guards.ts:2` `import { isAdmin as checkIsAdmin } from "./admin";`

**서로 import한다.** `import type`이라 런타임에는 지워지지만,
AD-2의 처방이 "`auth-guards`가 `admin` 위에 앉아 정책을 소유한다"인데
`admin.ts`가 이미 그 계층으로 손을 뻗고 있다.

`AuthenticatedSession`은 세션 형태이지 가드의 소유물이 아니다 —
`app.d.ts`나 `types.ts`로 옮기면 순환이 사라지고 AD-2의 재배치가 가능해진다.

---

## AD-18 🟡 반환 타입 미선언 + 호출마다 재파싱

**반환 타입이 없는 것 셋**: `addApplication`(`:103`), `updateApplication`(`:120`),
`isAdmin`(`:141`). 선언된 것 다섯과 규칙이 다르다.
AD-6이 가능했던 것은 `addApplication`에 계약이 없었기 때문이다
(`mail/templates.md` MT-15와 같은 형태).

**`isAdmin`이 호출마다 env를 재파싱한다**(`:144`). 호출부가 12곳이고
한 요청에 여러 번 불린다(`+layout.server.ts:16` + 라우트 게이트).
`env.ADMINS_EMAILS`는 프로세스 수명 동안 불변이므로 모듈 스코프 1회면 된다 —
AD-3·AD-4의 수정이 앉을 자리다.

---

## AD-11 🟡 `updateApplication`만 동적 import

`:125` `await import("./notion")`. 나머지 여덟은 `:6-15`에서 정적이다. **같은 모듈이다.**
순환 참조도 아니고 지연 이득도 없다.

호출부에도 같은 습관이 있다 — `signup/+page.server.ts:90`이 `addApplication`을
동적으로 가져오면서 같은 파일 `:4`에서 `getApplications`는 정적이다.
`CROSS-CUTTING.md` X-9(레포 전반 16곳) 참조.

---

## 지적하지 않은 것

- **`:52`의 이중 비단언** `memberMap.get(p.memberId!)!` — 바로 앞 `.filter`가 보장하는데
  TS가 좁히지 못한다. 단언이 **정당한** 경우다
- **`isAdmin`의 `dev` 분기**(`:143`) — `dev`는 `$app/environment`에서 오고
  프로덕션 빌드에서 `false`로 정적 치환되어 분기가 제거된다.
  (단 `+layout.server.ts`의 중복 파생은 AD-16으로 올렸다)
- **`resolveActualName`이 Notion을 두 번 부르는 것**(`:71-74`) —
  `getMemberByEmail`이 `name: ""` 플레이스홀더를 돌려주므로(`members.ts:83`)
  두 번째 호출이 필요하다. 결함은 그 플레이스홀더 쪽이다(`members.md` M-4).
  단 그 두 번째 호출(`getMemberById`, `members.ts:91`)도 **무캐시**다 — AD-14와 같은 계열
- **`Promise.all`로 두 DB를 병렬 조회**(`:42-45`) — 병렬성 자체는 올바르다.
  (캐시 비대칭은 AD-14로 올렸다)

---

## 수정 순서

1. **AD-13** — 훅에 관리자 우회. `/admin`이 열린다. 한 줄
2. **AD-1 + `hooks.server.ts:52`** — 이름 충돌 제거 **그리고** `:52`를 감싼다.
   둘 다 해야 AP-9가 닫힌다. `applications.md` AP-9도 함께 갱신
3. **AD-3 + AD-4 + AD-18** — 정규화·검증한 관리자 목록을 모듈 스코프에서 한 번.
   `templates.ts`가 그것을 쓰게 한다. 세 지적이 한 수정이다
4. **AD-15** — `SearchableMember`에서 `email` 제거 또는 마스킹. 서버는 안 쓴다
5. **AD-14 + AD-8** — `getAllPrivateInfo`에 캐시를 붙여 두 조회를 맞추고,
   버린 개수를 알린다
6. **AD-2 + AD-17** — `AuthenticatedSession`을 옮겨 순환을 끊고
   여섯 게이트를 `ensureAdmin`/`requireAdminAction`으로. `auth-guards.md` AG-5와 함께
7. **AD-5** — 실패 처리 규약 하나를 정해 여섯 함수에 적용. 로그는 경계에서 한 번만
8. **AD-6 + AD-7** — `if (!id) throw`, `submittedAt` 반환 제거
9. **AD-9 / AD-10 / AD-16 / AD-11** — 타입·술어 일원화, 정적 import

---

## 개정 이력

| 변경                              | 내용                                                                                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AD-13 신설 🔴**                 | 훅(`hooks.server.ts:55-66`)에 관리자 우회가 없는데 라우트 세 곳에는 있다. 훅이 먼저 돌아 **비회원 관리자는 `/admin`에 도달 불가**. `dev-admin@snu.ac.kr`이 실증 — 관리자 미리보기가 관리자 화면을 못 연다                     |
| **면죄부 철회 → AD-14 신설 🟠**   | 초판이 "하위 두 함수가 각각 캐시된다"고 **거짓 전제로 면죄**했다. `getAllPrivateInfo`(`members.ts:235`)는 무캐시다. 세미나 페이지마다 개인정보 DB 전수 조회. 신선/낡은 조인이 AD-8의 세 번째 원인                             |
| **AD-15 신설 🟠**                 | 전 회원 이메일이 모든 인증 사용자 페이로드에 실린다. 검색이 클라이언트에서 돈다. MT-12보다 큰 노출인데 미지적이었다                                                                                                           |
| **AD-16 · AD-17 · AD-18 신설 🟡** | 관리자 술어 3중 파생 / `admin`↔`auth-guards` 순환 / 반환 타입 3개 미선언 + 12곳 재파싱                                                                                                                                        |
| **AD-1 범위 축소**                | "로그인한 **모든** 사용자" → **비회원만**(`:55` 게이트 안). 내가 인용한 AP-9가 정확히 그렇게 적혀 있었는데 넓혔다                                                                                                             |
| **AD-1 처방 정정**                | "AP-9가 닫힌다"는 **거짓**. `hooks.server.ts:52` `memberRepo.findByEmail` 경로에 try/catch가 전혀 없어 **그쪽이 먼저, 더 넓게** 500을 낸다. 처방 ②의 IX-1 인용도 방향이 반대였고 `admin.ts:15`를 깬다                         |
| **AD-7 부논거 철회**              | "UTC라 KST 도메인과 어긋난다, 세 번째 시간 표현"은 **거짓** — Notion `created_time`도 UTC ISO다. 형식은 동일하다                                                                                                              |
| **AD-5 + AD-12 병합, 결과 정정**  | 쓰기/조회를 나눠 이중 계상했다. 하나로 합치고 `""` 반환을 네 번째로 추가. 그리고 "`Promise.all`이라 전체 실패"는 **거짓** — 두 호출부 모두 `memberDirectoryUnavailable` 대체 경로를 갖는다. **대체 장기이지 차단기가 아니다** |
| **AD-5 피해 구체화**              | `getApplications() → []`가 `signup:47` 가드를 무력화해 중복 신청 → AP-10의 영구 잠김으로 이어진다                                                                                                                             |
| **AD-2 정정**                     | "응답 4가지" → **메커니즘 4, 상태 코드 3**(`fail(401)`과 `json 401`은 같다)                                                                                                                                                   |
| **AD-10 확대**                    | 정의 2개 → **3개**(`admin/+page.svelte:17` 지역 선언)                                                                                                                                                                         |
| 줄번호 정정 2건                   | `members.ts:90`→`:91`, AD-5의 `auth-guards.ts:184`는 현재 경로 아님(`:126`만)                                                                                                                                                 |
