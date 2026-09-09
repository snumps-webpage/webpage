# `src/lib/server/mail/templates.ts`

149줄 · export 함수 5개 · 알림 메일 본문 생성 및 발송
검토 2026-08-25 · 기준 `cd916f6` · **검증 에이전트 1회 반영 (개정판)**

> 초판은 MT-1의 **두 기둥 중 하나가 거짓**이었다 — 관리자 대시보드는 출석 큐를
> 독립적으로 조회한다. 나머지 하나도 **피해를 잘못 짚었다.** §개정 이력 참조.

> 판정 기준은 `README.md` §판정 기준. "지금 출처가 안전하다"는 감면 근거가 아니다.

---

## 요약

| # | 지적 | 분류 | 심각도 |
|---|---|---|---|
| **MT-1** | **다섯 함수 전부 실패를 삼킨다 — 승인 메일이 실패하면 신규 회원이 채팅방에 영영 못 들어간다** | 오류 처리 | 🔴 |
| MT-11 | 본문이 코드가 보장하지 않는 사실을 단언한다 | 정합성 | 🟠 |
| MT-6 | 노션 URL이 이 줄에만 하드코딩돼 있다 — 같은 문장의 카톡 링크 둘은 상수다 | 하드코딩 | 🟠 |
| MT-2 | 함수 5개의 골격이 동일하다 | 중복 | 🟠 |
| MT-4 | 수신자가 없을 때도 OAuth 토큰을 먼저 받는다 — 순서가 뒤집혔다 | 정확성 | 🟠 |
| MT-8 | `ADMINS_EMAILS` 파서가 두 벌이고 **이미 갈라졌다** + 형식 검증 없음 | 중복 | 🟠 |
| MT-14 | 발송하지 않는 세 경우에 아무 흔적도 남지 않는다 | 오류 처리 | 🟡 |
| MT-12 | 관리자 전원의 주소가 서로에게 노출된다 (`To:` — `Bcc:`여야) | 노출 | 🟡 |
| MT-3 | 본문에 공통 조각이 없다 — 파일 이름이 `templates.ts`인데 템플릿이 없다 | 확장성 | 🟡 |
| MT-13 | 발송이 전부 사용자 요청 경로에서 `await`된다 | 성능 | 🟡 |
| MT-10 | 같은 `status`를 두 표현식이 따로 분기한다 | 정합성 | 🟡 |
| MT-15 | 다섯 함수 모두 반환 타입 미선언 | 타입 | 🟡 |
| MT-7 | 로그 형식이 4:1로 갈리고, 하나만 수신자 이메일을 남긴다 | 운영 | 🟡 |
| MT-5 | 같은 타입의 위치 인자가 연달아 있다 | 설계 | 🟡 |
| MT-9 | 검증 없는 문자열이 `To:` 헤더로 간다 (결함 위치는 `client.ts` — A-18) | 안전성 | 🟡 |

**호출부 전수**:

| 함수 | 호출부 |
|---|---|
| `sendSignupNotification` | `signup/+page.server.ts:101` |
| `sendAttendanceNotification` | `events/[id]/[type]/+page.server.ts:84` |
| `sendSeminarStatusNotification` | `admin/+page.server.ts:257`, `:290` |
| `sendSeminarApplicationNotification` | `seminar/apply/+page.server.ts:80` |
| `sendWelcomeEmail` | `admin/+page.server.ts:98` |

---

## MT-1 🔴 다섯 함수 전부 실패를 삼킨다

모든 함수가 같은 형태로 끝난다 (`:38-40`, `:63-65`, `:90-92`, `:117-119`, `:143-148`):

```ts
} catch (e) {
  console.error("Signup notification error:", e);
}
```

반환 타입이 없고(MT-15) 추론은 `Promise<void>`다. 잡은 `e`는 로그로만 쓰이고 버려진다.
호출부는 `await send...()`를 하지만 **볼 것이 없다.**

실패는 흔하다 — `client.ts:88`이 Gmail API 4xx/5xx에,
`:24`가 자격 증명 부재에, `:40`이 토큰 갱신 실패에 던진다. 전부 여기서 삼켜진다.

### 되돌릴 수 없는 손실: `admin/+page.server.ts:98`

```ts
await markApplicationAsAccepted(id);
await sendWelcomeEmail(app.email, app.name);      // 실패해도 조용
return { success: true };
```

`handleAdminAction`(`auth-guards.ts:135-189`)은 **던져진** 오류만 `fail(500)`으로 바꾼다.
`sendWelcomeEmail`은 던지지 않으므로 `:169`가 `{ success: true }`를 반환한다.
관리자는 "승인 완료"를 본다. 재승인은 `admin:76`
`if (app.accepted) throw new Error("Application already accepted")`에 막히고,
**재발송 경로는 코드에 없다**(`sendWelcomeEmail` 호출부 1곳).

> **초판 정정.** 초판은 피해를 "회원이 승인된 사실을 모른다"로 적었다. **틀렸다** —
> `+page.server.ts:239`가 `isMember: !!member`를 내려주고 `+page.svelte:154`가
> 그것으로 화면을 가른다. 로그인하면 알게 된다.

**진짜 손실은 카카오톡 채팅방 링크다.** 전수 확인:

```
$ grep -rn "CHATROOM_" --include=*.ts --include=*.svelte src/
src/lib/constants.ts:60,61              ← 정의
src/lib/server/mail/templates.ts:6,137,138   ← 유일한 사용처
```

**어떤 화면에도 없다.** 승인 메일이 채팅방으로 가는 **유일한 통로**이고,
그것이 조용히 사라지면 신규 회원은 가입은 됐는데 동아리 활동에 접근할 수 없다.
관리자는 그런 일이 있었다는 것도 모른다.

초판은 이 사실을 **MT-6에서 같은 문단을 인용하며 손에 쥐고 있었으면서** 쓰지 않았다.

### 논리적으로 무엇이 빠졌나

메일 실패가 승인을 되돌려야 한다는 것이 아니다 — 그건 정책 판단이다.
**호출부가 그 판단을 할 수 없다는 것이 결함이다.** 정보(`e`)가 존재하는데 파괴된다.

```ts
export async function sendWelcomeEmail(...): Promise<{ sent: boolean; error?: unknown }>
```

호출부가 "무시한다"를 **선택**할 수 있어야 한다. 지금은 선택지가 없다.
최소한 실패 사실이 `success` 응답에 실려야 관리자가 링크를 수동으로 전달할 수 있다.

> **초판 두 번째 기둥 철회.** 초판은 `events/[id]/[type]:84`의
> `sendAttendanceNotification`을 "관리자에게 알리는 **유일한 수단**"이라 하고
> "아무도 모른다"고 썼다. **거짓이다.** 대시보드가 큐를 독립 조회한다 —
> `admin/+page.server.ts:55-58`이 `getAttendanceQueue(skipCache)`를 부르고
> `admin/+page.svelte:307`이 `출석 승인 대기 ({attendanceQueue.length})`로 띄운다.
> 남는 것은 "푸시 알림이 사라져 발견이 관리자가 대시보드를 여는 시점으로 늦춰진다"뿐이다.
> `events.md` SE-3·SE-16을 끌어온 것도 무효다 — SE-3은 `recordAttendance`의
> 중복 가드가 낡은 캐시를 읽는 이야기이고 대시보드 표시와 무관하다.

---

## MT-11 🟠 본문이 코드가 보장하지 않는 사실을 단언한다

`:60`:

```
입실 및 퇴장 시간이 모두 기록되었으니, 관리자 페이지에서 확인 후 승인해주세요.
```

`events.ts:160-164`:

```ts
if (notionId) {
  // Immediately update end time for complete record
  updateAttendanceRecordInNotion(notionId, { endTime: nowKST }).catch(console.error);
  //  ^ await 없음, 오류는 삼킴
```

**퇴장 시간 쓰기는 fire-and-forget이다.** 실패해도 아무도 모르고,
호출부(`events/[id]/[type]:84`)는 그 직후 이 메일을 보낸다.

**메일이 관리자에게 거짓을 말한다.** "모두 기록되었으니 확인 후 승인"이라고 했는데
Notion에는 `EndTime`이 비어 있을 수 있고, 관리자는 그 문장을 믿고 확인 없이 승인한다.

`events.md` SE-4의 다른 면이다 — 그쪽은 **반환 객체**가 `endTime`을 있다고 말하고,
이쪽은 **관리자에게 보내는 메일**이 그렇게 말한다. 같은 미확인 쓰기를 두 곳이 사실로 옮긴다.

본문이 도메인 상태를 단언하려면 그 상태를 **읽고** 써야 한다.
읽을 수 없으면 단언하지 않는 것이 맞다.

---

## MT-6 🟠 노션 URL이 여기에만 있다

`:136-140`:

```
동아리 카카오톡 채팅방은 다음과 같습니다.
- 공지방 : ${CHATROOM_NOTICE_LINK}
- 잡담방 : ${CHATROOM_CHAT_LINK}

… 동아리의 모든 자료와 가이드라인은 공식 노션(https://snumps.notion.site)에서 확인할 수 있습니다.
```

**같은 문단 안에서 링크 셋 중 둘만 상수다.** 카톡 링크 둘은 `constants.ts:60-61`에서 오고
노션 URL만 문자열 리터럴 안에 박혀 있다. 규칙이 없다.

전수 확인:

```
$ grep -rn "notion.site" --include=*.ts --include=*.svelte src/
src/lib/server/mail/templates.ts:140
```

**코드베이스 전체에서 이 한 곳뿐이고, 그것도 한국어 산문 한가운데다.**

> **이주 문서 인용에 대한 주의.** 노션 이주 계획서(`docs/migration/`)는
> **이 브랜치에 없다** — `origin/docs/notion-migration-plan`에 있다.
> `chore/code-audit`에서 그 경로를 찾으면 안 나온다. 인용 시 브랜치를 명시할 것.
> 이주 작업이 링크를 옮길 때 이 줄이 검색에 걸리게 하려면
> `constants.ts`로 옮기는 것이 선행되어야 한다.

---

## MT-2 🟠 골격 5중 복제

```
try {
  const accessToken = await getAdminAccessToken();     // :24 :51 :78 :103 :130
  const adminEmails = getAdminEmails();                // :25 :52  —  :104  —
  if (adminEmails.length === 0) return;                // :26 :53  —  :105  —
  const subject = …; const body = …;
  await dispatchEmail(accessToken, <수신자>, subject, body);   // :37 :62 :89 :116 :142
} catch (e) {                                          // :38 :63 :90 :117 :143
  console.error("…", e);                               // :39 :64 :91 :118 :144
}
```

**실질 차이는 subject/body 문자열과 수신자 결정뿐이다.**

비용은 줄 수가 아니라 변경 지점이다 — MT-1(반환값), MT-4(순서), MT-7(로그 형식),
MT-14(무발송 로그), MT-15(반환 타입)가 **전부 다섯 곳을 고쳐야 한다.**

**제안**: 발송을 하나로 접고 각 함수는 내용만 만든다.

```ts
type Notification = { to: string[] | "admins"; subject: string; body: string };
async function send(n: Notification): Promise<{ sent: boolean; error?: unknown }> { … }

export const sendWelcomeEmail = (email: string, name: string) =>
  send({ to: [email], subject: subj("가입이 승인되었습니다!"), body: welcome(name) });
```

---

## MT-4 🟠 수신자가 없을 때도 토큰을 먼저 받는다

`:24-26` (그리고 `:51-53`, `:103-105`):

```ts
const accessToken = await getAdminAccessToken();   // ① 네트워크 가능
const adminEmails = getAdminEmails();              // ② 순수 함수
if (adminEmails.length === 0) return;              // ③ 아무것도 안 함
```

**검사 순서가 뒤집혀 있다.** ②③은 `env` 파싱뿐이고 ①은 OAuth 왕복이다
(`client.ts:27-36`). 모듈 스코프 캐시(`client.ts:7-8,15-17`)가 있지만
Vercel 서버리스(`svelte.config.js:1` `adapter-vercel`)에서 **콜드 인스턴스는 실제 요청**이다.

두 가지 결과:

1. `ADMINS_EMAILS`가 비면 **아무것도 안 할 일에 토큰을 받는다**
2. 자격 증명까지 없으면 `client.ts:24`가
   `throw new Error("Missing admin email credentials in .env")`를 던지고
   MT-1의 catch가 그것을 남긴다. **진짜 원인은 "수신자가 없다"인데
   로그에는 자격 증명 문제로 남는다** — 두 설정이 동시에 어긋나야 하므로
   빈도는 낮지만, 진단이 어긋나는 것은 순서 두 줄로 사라진다

---

## MT-8 🟠 `ADMINS_EMAILS` 파서가 두 벌이고 이미 갈라졌다

`templates.ts:12-17`:

```ts
return (env.ADMINS_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean);
```

`admin.ts:144-145`:

```ts
const admins = (env.ADMINS_EMAILS || "").split(",").map((e) => e.trim());
return admins.includes(email);
```

**같은 설정을 두 곳이 각자 파싱하고, `.filter(Boolean)`이 한쪽에만 있다.**
`ADMINS_EMAILS`에 후행 쉼표가 있으면 `admin.ts` 쪽 배열에 `""`가 들어간다 —
`isAdmin("")`이 참이 되지는 않지만(호출부가 email 존재를 먼저 본다)
**두 파서가 이미 다른 결과를 낸다**는 것이 사실이다. 가정 하나만 어긋나면 권한 판정이 갈린다.

검증도 없다. `filter(Boolean)`만 통과하면 `@`가 없어도, 공백이 섞여도
그대로 `dispatchEmail`을 거쳐 `To:` 헤더에 들어간다(MT-9).
Gmail API가 전체 발송을 거부하고, 실패는 MT-1이 삼킨다 —
**설정 오타 하나가 조용한 전면 무발송이 된다.**

파싱 결과를 한 곳(`constants.ts` 또는 `admin.ts`)에서 만들어 양쪽이 그것만 쓰게 한다.
A-15(`admin.ts`)에서 어느 쪽을 정본으로 할지 결정한다.

---

## MT-14 🟡 발송하지 않는 세 경우에 흔적이 없다

| 경우 | 위치 | 남는 것 |
|---|---|---|
| 관리자 수신자 0명 | `:26`, `:53`, `:105` `return;` | **없음** |
| `recipientEmail`이 빈 문자열 | `:89`, `:142` — 검사 자체가 없다 | Gmail 400 → MT-1이 삼킴 |
| 발송 실패 | catch | `console.error` (있음) |

첫 번째가 특히 나쁘다 — `ADMINS_EMAILS` 미설정이면 **모든 관리자 알림이
아무 소리 없이 사라진다.** `console.warn` 한 줄이면 배포 직후에 드러난다.

두 번째: `sendSeminarStatusNotification`과 `sendWelcomeEmail`은
`recipientEmail`을 검사하지 않는다. `getPropertyValue`는 없는 속성에 `""`를 준다
(`notion/utils.ts:30`). 호출부가 막고 있지만(`admin:256`, `:289` `if (info?.email)`)
**그것은 호출부의 성질이지 함수의 성질이 아니다** — MT-9와 같은 논리다.
`getAdminEmails`에는 (부실하게나마) 있는 가드가 나머지 두 경로에는 없다.

---

## MT-12 🟡 관리자 전원의 주소가 서로에게 노출된다

`client.ts:60`:

```ts
`To: ${recipients.join(", ")}`,
```

관리자 알림 3종(`sendSignupNotification`, `sendAttendanceNotification`,
`sendSeminarApplicationNotification`)이 `getAdminEmails()`의 배열 전체를 `To:`에 넣는다.
**모든 관리자가 매 알림마다 서로의 주소를 본다.** 다수 수신자 알림의 표준은 `Bcc:`다.

MT-7이 로그에 남는 이메일 하나를 개인정보로 지적하는데, 메시지 자체의 노출이 더 크다.

`client.ts` 수정이 필요하므로 A-18과 함께. 이 파일은 `to`/`bcc` 구분을 넘길 수단이 없다.

---

## MT-3 🟡 본문에 공통 조각이 없다

MT-2가 **제어 흐름**의 중복이라면 이것은 **내용**의 문제다. 수정은 같은 리팩터링에 딸린다.

파일 이름과 헤더 주석(`:2-3` "Defines specific notification types and their content")이
템플릿 계층을 약속하는데 실제로는 인라인 문자열 리터럴 5개다. 반복되는 요소:

| 요소 | 반복 |
|---|---|
| `[SNUMPS]` 제목 접두사 | 5회 (`:28` `:55` `:79` `:107` `:131`) |
| `안녕하세요, 관리자님.` | 3회 (`:29` `:56` `:108`) |
| `관리자 페이지에서 확인 후 …해주세요.` | 3회 (`:35` `:60` `:114`) |
| 맺음말 | `:87`만 `감사합니다.` — 나머지 넷은 없음 |

**확장 축은 "알림 종류"인데 구조가 그 축을 표현하지 않는다.**
접두사를 바꾸면 다섯 곳이다. 템플릿 엔진은 과잉이고,
`subj(t)` / `adminGreeting()` / `sign()` 정도의 함수 셋이면 충분하다.

---

## MT-13 🟡 발송이 사용자 요청 경로에서 `await`된다

호출부 여섯 곳 전부 `await`다 — `signup:101`, `events/[id]/[type]:84`,
`seminar/apply:80`, `admin:98`, `admin:257`, `:290`.

폼 제출 응답이 **OAuth 왕복 + Gmail API 호출**이 끝날 때까지 막힌다.
콜드 인스턴스면 두 번의 외부 왕복이다.

MT-1의 수정(결과 반환)과 방향이 반대로 보이지만 그렇지 않다 —
결과를 반환하되 호출부가 `await`할지 큐에 넣을지 **선택**할 수 있으면 된다.
지금은 선택지가 없다는 점이 MT-1과 같은 뿌리다.

---

## MT-10 🟡 같은 값을 두 표현식이 따로 분기한다

`:80`과 `:85`:

```ts
const statusText = status === "approved" ? "승인" : "반려";
…
${status === "approved" ? "자세한 일정의 확인 부탁드립니다." : "아쉽게도 이번 세미나는 개설이 어렵게 되었습니다."}
```

**하나의 결정이 두 곳에 있다.** 값이 늘면(예: `"pending"`) `:80`은 "반려"를,
`:85`는 반려 문구를 낸다 — 컴파일러가 잡지 않고 **조용히 틀린 메일이 나간다.**

```ts
const copy = {
  approved: { label: "승인", detail: "자세한 일정의 확인 부탁드립니다." },
  rejected: { label: "반려", detail: "아쉽게도 이번 세미나는 개설이 어렵게 되었습니다." },
}[status];
```

`Record<Status, …>`로 두면 값이 늘 때 컴파일 오류가 난다.

---

## MT-15 🟡 반환 타입 미선언

다섯 export 어디에도 반환 타입 주석이 없다(`:22`, `:46-49`, `:71-76`, `:98-101`, `:125-128`).
추론이 `Promise<void>`가 되는 것은 catch가 아무것도 반환하지 않기 때문이다.

MT-1의 처방이 **반환 타입 계약**이므로, 선언이 없다는 것은 별개의 흠이 아니라
같은 결함의 일부다 — 계약이 없으니 계약을 어길 수도 없었다.

---

## MT-7 🟡 로그 형식이 4:1로 갈린다

| 위치 | 형식 |
|---|---|
| `:39` `:64` `:91` `:118` | `"<종류> notification error:"` |
| `:144-147` | `` `[Mail] Failed to send welcome email to ${recipientEmail}:` `` |

접두사(`[Mail]`)도 하나만 있고 **수신자 이메일을 로그에 넣는 것도 이 하나뿐**이다.
로그는 Vercel에 남는다. 다섯 곳이 같아야 한다 — 남기든 안 남기든.

---

## MT-5 🟡 같은 타입의 위치 인자가 연달아 있다

```ts
sendSeminarStatusNotification(recipientEmail, recipientName, seminarTitle, status)
sendWelcomeEmail(recipientEmail, recipientName)
sendAttendanceNotification(userName, eventName)
sendSeminarApplicationNotification(applicantName, seminarTitle)
```

`string` 인자가 2~3개 연달아 있고 타입이 순서를 강제하지 않는다.
`admin:257`·`:290`의 4인자 호출에서 앞 셋이 바뀌어도 컴파일된다.

규약도 함수마다 다르다 — 앞의 둘은 `(이메일, 이름)`, 뒤의 둘은 `(이름, 대상)`이다.
최소한 첫 인자 규약은 통일되어야 한다.

---

## MT-9 🟡 검증 없는 문자열이 `To:` 헤더로 간다 → A-18

`client.ts:59-65`에서 `Subject`는 base64로 감싸지만 **`To:`는 원문이다.**
수신자에 `\r\n`이 있으면 헤더 주입(`Bcc:` 추가 등)이 된다.

앱 경로의 출처는 전부 Google 세션에서 온다 —
`signup/+page.server.ts:94` `email: user.email`, `auth.ts:22`가 `@snu.ac.kr` 강제.
쓰기 경로는 `createMember`(`notion/members.ts:32` `[NOTION_PROPS.EMAIL]: { email: data.email }`)
하나뿐이고 `updatePrivateInfo`(`:259-262`)는 `phone`·`background`만 받는다.

**그러나 앱 경로가 안전하다는 것은 출처의 성질이지 함수의 성질이 아니다.**
Notion DB를 직접 편집하면 우회되고, **막아야 할 검증이 실제로 무력화돼 있다**:

```
notion/schema.ts:21   email: z.string().email()      ← 스키마는 있다
notion/utils.ts:15-22 safeParse 실패 시 → return data as T   ← 통과시킨다
notion/applications.ts:45-67                          ← 아예 검증을 안 부른다
```

**검증이 값을 보고도 통과시킨다.** 결함의 위치는 `client.ts:60`이므로 **A-18로 넘긴다.**
이 파일의 몫은 MT-8(형식 검증)과 MT-14(빈 수신자)다.

---

## 지적하지 않은 것

- **평문 메일(HTML 아님)** — `client.ts:62`가 `text/plain`을 설정하고 본문은 빈 줄(`:63`)
  뒤에 온다. 본문 내용으로는 헤더를 위조할 수 없다. 의도된 단순함
- **본문 한국어 하드코딩** — 다국어 요구가 없다. i18n은 과잉
- **`getAdminAccessToken`을 매 함수가 부르는 것** — `client.ts:15-17`이 캐시로 처리한다.
  계층이 맞다 (캐시 자체의 문제는 A-18)
- **`sendSeminarStatusNotification`만 개인에게 보내는 것** — 용도가 그렇다

---

## 수정 순서

1. **MT-1 + MT-15 + MT-2** — 반환 타입에 결과를 실어 호출부가 선택하게.
   **하나의 리팩터링이다.** 특히 `admin:98` — 실패 시 채팅방 링크를 수동 전달할 수 있어야 한다
2. **MT-11** — `:60`의 단언 제거 또는 `EndTime` 쓰기를 `await`으로 (`events.md` SE-4와 함께)
3. **MT-6** — 노션 URL을 `constants.ts`로. 이주 작업의 선행 조건
4. **MT-8** — 파서 일원화. A-15에서 정본 결정
5. **MT-4 / MT-14** — 검사 순서 두 줄 + 무발송 로그
6. **MT-3 / MT-10 / MT-7 / MT-5 / MT-13** — 1번 리팩터링에 딸려 정리
7. **MT-12 / MT-9** — A-18 `client.ts`. `Bcc` 분리와 `To:` 검증

---

## 개정 이력

| 변경 | 내용 |
|---|---|
| **MT-1 두 번째 기둥 철회** | "`sendAttendanceNotification`이 관리자에게 알리는 **유일한 수단**, 아무도 모른다"는 **거짓**. `admin/+page.server.ts:55-58`이 큐를 독립 조회하고 `+page.svelte:307`이 띄운다. `events.md` SE-3·SE-16 연결도 무효 |
| **MT-1 피해 교체** | "회원이 승인을 모른다"는 거짓 — `+page.server.ts:239` `isMember`가 알려준다. **진짜 손실은 카톡 링크**로, `grep CHATROOM_` 결과 화면 어디에도 없고 이 메일이 유일한 통로다. 초판은 MT-6에서 같은 문단을 인용하며 이 사실을 손에 쥐고 있었다 |
| **MT-11 신설 🟠** | `:60`이 "입실·퇴장 모두 기록되었다"고 단언하는데 `events.ts:162`는 fire-and-forget이다. 관리자에게 거짓을 말한다 |
| **MT-8 승격 🟡→🟠** | `admin.ts:144`에 **두 번째 파서**가 있고 `.filter(Boolean)`이 없어 **이미 갈라졌다**. 추측이 아니라 실재 |
| **MT-12 · MT-13 · MT-14 · MT-15 신설 🟡** | `To:` 전원 노출 / 요청 경로 `await` / 무발송 무로그 · 빈 수신자 미검사 / 반환 타입 미선언 |
| **MT-6 인용 정정** | `docs/migration/`은 **이 브랜치에 없다** — `origin/docs/notion-migration-plan`이다. 초판이 브랜치를 안 밝혀 존재하지 않는 경로처럼 보였다 |
| **MT-9 축소 + 근거 보강** | 34줄 → 포인터. 대신 **검증이 무력화된 실증** 추가 — `schema.ts:21`에 `.email()`이 있는데 `utils.ts:15-22`가 실패 시 원본을 통과시키고 `applications.ts:45-67`은 검증을 안 부른다 |
| **MT-3 강등 🟠→🟡** | MT-2와 같은 리팩터링에 딸린다. 두 곳에 🟠는 이중 계상 |
| MT-8 ① 흡수 | "매번 파싱한다"는 단독 결함이 아니다. ②에 흡수 |
| 줄번호 정정 3건 | MT-2의 `console.error` 행 `:38…`→`:39…`(catch와 혼동, MT-7과 자기모순), MT-6 `:137`→`:136`, MT-9 `signup:35`→`:94` |
| MT-9 쓰기 경로 보완 | `updatePrivateInfo`만 봤다. 실제로 email을 쓰는 것은 `createMember`(`members.ts:32`) |
