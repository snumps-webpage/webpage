# 외부 메일(.eml) 전체 공지 구현 계획

**목표:** 관리자가 Gmail "원본 다운로드" `.eml`을 `/admin/mail/broadcast`에 올려 미리보기·시험 발송 뒤 수신 동의 회원 전체에게 Bcc로 재발송.
**구조:** 메일 계층에 `broadcast/` 모듈(parse·sanitize·compose·store·send)을 더하고, Gmail 업로드 전송 `dispatchRaw`를 `client.ts`에 추가. 업로드는 기존 presign·staging 파이프라인을 새 목적 `broadcast-eml`로 재사용하고, 발송 기록은 앱 테이블 `mail-broadcasts`.
**기술 스택:** SvelteKit 2·Svelte 5, zod, vitest + store-memory, `postal-mime` 4.0.2, `sanitize-html` 2.17.5(D-000172 — 처음 계획한 2.18.0은 Vercel nodejs22.x에서 ERR_REQUIRE_ESM)(+`@types/sanitize-html` 2.16.2), `nodemailer` 10.0.14(`lib/mail-composer`만).
**Spec:** `docs/specs/2026-10-17-eml-broadcast-design.md`

## 전역 제약

- 의존성은 위 4개를 정확한 버전으로 고정(`pnpm add <pkg>@<ver> --save-exact`). 그 밖의 의존성 추가 금지(spec 경계 Ask first).
- 모든 전체 발송은 Bcc만, `To` 헤더 없음(D-000143). `From`·`Reply-To` 미설정(D-000123).
- 묶음 크기는 `dispatch.ts`의 `BATCH_SIZE`(80, 이후 D-000165로 400) 재사용, 수신자는 `optedInMemberEmails` 재사용.
- `.eml` 상한 25_000_000 bytes(D-000145).
- 발송 전 서버가 staging 파일을 다시 읽어 해석·정화. 클라이언트가 보낸 HTML·제목으로 발송하지 않음.
- 수신자 주소·본문을 기록·로그에 남기지 않음. 자동 재시도 없음. 발송 횟수 상한 없음(D-000110).
- 실패는 로그 + 결과 값으로 반환(기존 메일 모듈 관례). 주석은 결정·감사 ID를 인용하는 한국어.
- 테스트는 vitest, `$lib/server/data/store` → `store-memory` mock, Gmail은 `fetch` stub(`vi.stubGlobal`). 실제 Gmail 호출은 Task 10에서만.

## 위험

| 위험                                                                                       | 영향 | 완화                                                                                    |
| ------------------------------------------------------------------------------------------ | ---- | --------------------------------------------------------------------------------------- |
| `postal-mime`이 Node(SSR)에서 `Blob`·`TextDecoder` 의존으로 실패                           | 상   | Task 2 첫 테스트가 Node에서 실제 `.eml` 해석. 실패하면 멈추고 질문                      |
| `nodemailer` mail-composer가 Bcc를 raw에서 지움                                            | 상   | Task 4에서 `keepBcc = true` 후 raw에 `Bcc:` 존재 assertion                              |
| Vercel 실행 시간: 25MB × 2묶음 ≈ 50초. 프로젝트 Fluid 여부 미확인(비Fluid Hobby 최대 60초) | 중   | Task 8에서 route `config.maxDuration = 120`. Task 10 preview 배포 build가 거부하면 질문 |
| Gmail이 Bcc를 다른 수신자에게 노출                                                         | 상   | Task 10에서 서로 다른 두 주소로 확인(사전 시험에서 미확인)                              |
| `.eml`의 `file.type`이 빈 문자열(OS별)                                                     | 중   | 클라이언트가 빈 type을 `message/rfc822`로 바꿔 올림(Task 9)                             |

## Open Questions

- Task 10 실제 환경 시험의 수신 주소 2개(서로 다른 메일함)와, dev DB의 수신 동의 회원을 그 두 주소로만 맞추는 방법(dev 데이터 변경). Task 10 실행 전에 질문.

## 파일 구조

| 파일                                                                      | 책임                                      |
| ------------------------------------------------------------------------- | ----------------------------------------- |
| `src/lib/server/mail/client.ts`                                           | + `dispatchRaw`, `GmailQuotaError`        |
| `src/lib/server/mail/broadcast/parse.ts`                                  | `.eml` → `ParsedMail`                     |
| `src/lib/server/mail/broadcast/sanitize.ts`                               | HTML 정화, 꼬리말, 텍스트 대체본          |
| `src/lib/server/mail/broadcast/compose.ts`                                | 묶음별 raw MIME                           |
| `src/lib/server/mail/broadcast/store.ts`                                  | 발송 기록 선점·종료·조회                  |
| `src/lib/server/mail/broadcast/send.ts`                                   | 미리보기·시험·전체 발송 흐름              |
| `src/lib/server/mail/broadcast/fixtures/*.eml`                            | 합성 고정 메일 5종                        |
| `src/lib/server/data/schemas/mail-broadcast.ts` (+ `index.ts`)            | 기록 행 schema·등록                       |
| `src/lib/server/data/storage.ts`, `storage-memory.ts`                     | + `readStaged`                            |
| `src/lib/server/mail/dispatch.ts`                                         | `optedInMemberEmails`·`BATCH_SIZE` export |
| `src/lib/domain/uploads.ts`, `src/lib/server/services/uploads.ts`         | 목적 `broadcast-eml`                      |
| `src/routes/(admin)/admin/mail/broadcast/+page.server.ts`, `+page.svelte` | 화면·action                               |
| `src/routes/(admin)/admin/mail/+page.svelte`                              | 진입 링크                                 |

의존 그래프: Task 1 → (2, 3, 4 병렬) → 5 → 6 → 7 → 8 → 9 → 10.

---

### Task 1: Gmail 업로드 전송 `dispatchRaw`

**파일:**

- 수정: `src/lib/server/mail/client.ts`
- 테스트: `src/lib/server/mail/client-raw.test.ts`

**Interfaces:**

- 제공: `export class GmailQuotaError extends Error`, `export class GmailSendError extends Error { status: number; reason: string }`, `export async function dispatchRaw(accessToken: string, raw: Buffer): Promise<void>`

**Acceptance criteria:**

- [ ] `POST https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media`, `Authorization: Bearer <token>`, `Content-Type: message/rfc822`, 본문 = `raw` 그대로
- [ ] 2xx는 resolve. 429 또는 `error.errors[0].reason` ∈ {`rateLimitExceeded`, `dailyLimitExceeded`, `quotaExceeded`, `userRateLimitExceeded`}는 `GmailQuotaError`, 그 밖의 비2xx는 `GmailSendError`(status·reason 포함)
- [ ] 오류 본문이 JSON이 아니어도 `GmailSendError`(reason `""`)

**의존:** 없음 **크기:** S

- [ ] 실패하는 테스트: fetch stub으로 URL·헤더·본문 bytes 동일, 200 resolve, 403+`dailyLimitExceeded` → `GmailQuotaError`, 429 → `GmailQuotaError`, 400+`invalidArgument` → `GmailSendError`(status 400, reason `invalidArgument`), 500+비JSON → `GmailSendError`
- [ ] 실패 확인: `npx vitest run src/lib/server/mail/client-raw.test.ts` → FAIL(`dispatchRaw` 없음)
- [ ] 최소 구현

```ts
const QUOTA_REASONS = new Set([
  "rateLimitExceeded",
  "dailyLimitExceeded",
  "quotaExceeded",
  "userRateLimitExceeded",
]);
export async function dispatchRaw(
  accessToken: string,
  raw: Buffer,
): Promise<void> {
  const res = await fetch(UPLOAD_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "message/rfc822",
    },
    body: raw,
  });
  if (res.ok) return;
  const reason = await res.json().then(
    (j) => j?.error?.errors?.[0]?.reason ?? "",
    () => "",
  );
  if (res.status === 429 || QUOTA_REASONS.has(reason))
    throw new GmailQuotaError(reason);
  throw new GmailSendError(res.status, reason);
}
```

- [ ] 통과 확인: 같은 명령 → PASS

### Task 2: `.eml` 해석 `parse.ts`

**파일:**

- 생성: `src/lib/server/mail/broadcast/parse.ts`, `src/lib/server/mail/broadcast/fixtures/{gmail-forward,cid-image,attachment,no-message-id,broken}.eml`
- 테스트: `src/lib/server/mail/broadcast/parse.test.ts`
- 수정: `package.json`, `pnpm-lock.yaml`(`postal-mime@4.0.2` exact)

**Interfaces:**

- 제공:

```ts
export interface MailAttachment { filename: string | null; mimeType: string; disposition: "inline" | "attachment" | null; contentId: string | null; content: Uint8Array }
export interface ParsedMail { messageId: string; subject: string; html: string | null; text: string | null; attachments: MailAttachment[] }
export class BroadcastParseError extends Error { constructor(public code: "unreadable" | "no-subject" | "no-body") }
export async function parseEml(raw: Uint8Array): Promise<ParsedMail>
export function stripForwardPrefix(subject: string): string
```

**Acceptance criteria:**

- [ ] `messageId`: 헤더 값의 꺾쇠·공백 제거. 없으면 `sha256:<raw의 hex sha256>`
- [ ] `subject`: 앞의 `Fwd:`·`FW:`·`Fw:`·`fwd:`·`전달:`를 반복 제거 후 trim, 빈 값이면 `no-subject`
- [ ] Gmail 전달 머리말 제거(spec parse.ts 항목 그대로): HTML은 `div.gmail_quote` 안의 `div.gmail_attr`와 `gmail_quote` 밖 앞부분(전달자 메모)을 제거하고 인용 본문만, 텍스트는 `---------- Forwarded message ---------` 줄 이전과 그 머리말 블록(첫 빈 줄까지) 제거. 표지가 없으면 원문 유지
- [ ] `html`·`text` 둘 다 없거나 빈 문자열이면 `no-body`, 해석 예외는 `unreadable`
- [ ] 고정 메일은 개인정보 없는 합성본(주소는 `example.com`)

**의존:** 없음 **크기:** M

- [ ] 실패하는 테스트: 5개 fixture 각각 — gmail-forward(제목 `Fwd: [학과] 안내` → `[학과] 안내`, HTML에 `Forwarded message` 없음, 인용 본문 남음, 텍스트도 동일), cid-image(첨부 1개 `disposition: "inline"`, `contentId: "img1@x"`), attachment(`disposition: "attachment"`, `filename: "a.pdf"`, bytes 길이 일치), no-message-id(`messageId`가 `sha256:` + 64 hex), broken(`BroadcastParseError` code `unreadable` 또는 `no-body`), `stripForwardPrefix("Fwd: FW: 전달: x")` → `"x"`
- [ ] 실패 확인: `npx vitest run src/lib/server/mail/broadcast/parse.test.ts` → FAIL(모듈 없음)
- [ ] 최소 구현: `PostalMime.parse(raw)` → 필드 매핑. 머리말 제거는 이 파일 안의 문자열 처리로 함(HTML: `<div class="gmail_quote` 시작 위치 앞을 버리고, 그 안의 `<div class="gmail_attr"…>…</div>` 첫 블록을 제거. 텍스트: 표지 줄 이전과 표지부터 첫 빈 줄까지 제거)
- [ ] 통과 확인: 같은 명령 → PASS. Node에서 `postal-mime`이 실패하면 멈추고 보고(위험 1)

### Task 3: HTML 정화 `sanitize.ts`

**파일:**

- 생성: `src/lib/server/mail/broadcast/sanitize.ts`
- 테스트: `src/lib/server/mail/broadcast/sanitize.test.ts`
- 수정: `package.json`, `pnpm-lock.yaml`(`sanitize-html@2.18.0`, dev `@types/sanitize-html@2.16.2`, exact)

**Interfaces:**

- 제공: `export function sanitizeMailHtml(html: string): string`, `export function withFooter(body: { html: string | null; text: string | null }, optOutUrl: string): { html: string | null; text: string }`

**Acceptance criteria:**

- [ ] 허용 태그·속성·scheme은 spec sanitize.ts 항목 목록 그대로(`allowedTags`, `allowedAttributes: { "*": [...] }`, `allowedSchemesByTag: { a: ["http","https","mailto"], img: ["http","https","cid"] }`, `allowedSchemes: []`)
- [ ] `script`·`form`·`input`·`button`·`iframe`·`object`·`embed`·`frame`·`base`·`meta`는 내용째 제거, `on*` 속성 제거, `javascript:`·`data:` URL 속성 제거
- [ ] 인라인 `style`·표 구조·`<style>` 블록 유지
- [ ] `withFooter`: HTML 끝에 `<hr>` + `<p>이 메일은 SNUMPS 전체 공지로 재발송되었습니다. 수신 설정: <a href="{optOutUrl}">{optOutUrl}</a></p>`, 텍스트 끝에 `\n\n-- \n이 메일은 SNUMPS 전체 공지로 재발송되었습니다. 수신 설정: {optOutUrl}`. 텍스트가 없으면 정화된 HTML에서 태그를 걷은 텍스트로 만듦

**의존:** 없음 **크기:** S

- [ ] 실패하는 테스트: 위 항목마다 입력 HTML → 결과 문자열 assertion(`not.toContain("<script")`, `not.toContain("onclick")`, `not.toContain("javascript:")`, `toContain('style="color:red"')`, `toContain("<table")`, `img src="cid:x"` 유지, `img src="data:..."` 제거), `withFooter` HTML·텍스트 꼬리말, 텍스트 null → HTML에서 생성
- [ ] 실패 확인: `npx vitest run src/lib/server/mail/broadcast/sanitize.test.ts` → FAIL
- [ ] 최소 구현: `sanitizeHtml(html, OPTIONS)`; 텍스트 대체본은 `sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })` 후 공백 정리
- [ ] 통과 확인: 같은 명령 → PASS

### Task 4: MIME 조립 `compose.ts`

**파일:**

- 생성: `src/lib/server/mail/broadcast/compose.ts`
- 테스트: `src/lib/server/mail/broadcast/compose.test.ts`
- 수정: `package.json`, `pnpm-lock.yaml`(`nodemailer@10.0.14` exact)

**Interfaces:**

- 사용: Task 2 `MailAttachment`
- 제공: `export async function composeBroadcast(mail: { subject: string; html: string | null; text: string; attachments: MailAttachment[] }, bcc: string[]): Promise<Buffer>`

**Acceptance criteria:**

- [ ] `new MailComposer({ bcc, subject, html, text, attachments })`, `compiled = composer.compile()`, `compiled.keepBcc = true`, `await compiled.build()`
- [ ] raw 헤더에 `Bcc:`(모든 주소), `To:`·`From:`·`Reply-To:` 없음
- [ ] 내장 이미지는 `cid`·`contentDisposition: "inline"` 유지, 첨부는 `filename` 유지. HTML+내장 이미지+첨부일 때 구조는 nodemailer 기본 `multipart/mixed` > `multipart/alternative` > (text, `multipart/related`(html, 내장 이미지)), 첨부(구현 중 실측, RFC 유효 — 표시는 Task 10에서 확인)
- [ ] `bcc`가 비면 throw(호출자 버그)

**의존:** 없음(타입만 Task 2) **크기:** S

- [ ] 실패하는 테스트: compose 결과 문자열에서 헤더 부분 assertion, `multipart/mixed`·`multipart/alternative`·`multipart/related` 순서(위 구조), `Content-ID: <img1@x>`, `filename=a.pdf`(따옴표 유무 무관), 빈 bcc → throw. 결과를 `parseEml`로 되읽어 제목·첨부 수 왕복 확인
- [ ] 실패 확인: `npx vitest run src/lib/server/mail/broadcast/compose.test.ts` → FAIL
- [ ] 최소 구현: 위 시그니처, 첨부 매핑 `{ filename, contentType: mimeType, content: Buffer.from(content), cid: contentId ?? undefined, contentDisposition: disposition ?? "attachment" }`
- [ ] 통과 확인: 같은 명령 → PASS

### Checkpoint: Task 1~4 이후

- [ ] `pnpm test` 실패 0
- [ ] `pnpm check` 오류 0, `pnpm lint` 통과
- [ ] fixture `.eml` → parse → sanitize → compose 왕복이 테스트로 확인됨

### Task 5: 발송 기록 테이블 `mail-broadcasts`

**파일:**

- 생성: `src/lib/server/data/schemas/mail-broadcast.ts`, `src/lib/server/mail/broadcast/store.ts`
- 수정: `src/lib/server/data/schemas/index.ts`(import·`TABLES["mail-broadcasts"]`·`export *`)
- 테스트: `src/lib/server/mail/broadcast/store.test.ts`

**Interfaces:**

- 제공:

```ts
export const BROADCAST_STATUSES = [
  "sending",
  "sent",
  "partial",
  "failed",
] as const;
export const MailBroadcastSchema = z.object({
  id: z.string().min(1),
  messageId: z.string().min(1),
  subject: z.string(),
  sentBy: z.string().min(1),
  startedAt: DateTime,
  finishedAt: DateTime.nullable(),
  recipientCount: z.number().int().min(0),
  batchesSent: z.number().int().min(0),
  batchesFailed: z.number().int().min(0),
  status: z.enum(BROADCAST_STATUSES),
});
export type MailBroadcast = z.infer<typeof MailBroadcastSchema>;
// store.ts
export async function findBroadcast(
  messageId: string,
): Promise<MailBroadcast | null>;
export async function claimBroadcast(
  row: MailBroadcast,
): Promise<{ ok: true } | { ok: false; existing: MailBroadcast }>;
export async function finishBroadcast(
  id: string,
  patch: Pick<
    MailBroadcast,
    "status" | "batchesSent" | "batchesFailed" | "recipientCount" | "finishedAt"
  >,
): Promise<void>;
export async function recentBroadcasts(limit: number): Promise<MailBroadcast[]>;
```

**Acceptance criteria:**

- [ ] `claimBroadcast`는 spec 코드 스타일 snippet 그대로: 같은 `messageId`가 `failed`가 아닌 상태로 있으면 `{ ok: false, existing }`, `failed`만 있으면 그 행을 새 행으로 교체
- [ ] 동시 두 `claimBroadcast`(같은 messageId)를 `Promise.all`로 돌리면 정확히 하나만 `ok: true`
- [ ] `recentBroadcasts`는 `startedAt` 내림차순
- [ ] `expect-tables-valid` 계열 기존 테스트 통과(새 테이블 빈 문서 읽기)

**의존:** 없음 **크기:** S

- [ ] 실패하는 테스트: store-memory에서 위 항목 assertion
- [ ] 실패 확인: `npx vitest run src/lib/server/mail/broadcast/store.test.ts` → FAIL
- [ ] 최소 구현: `getTable`·`mutate("mail-broadcasts", …)`
- [ ] 통과 확인: 같은 명령 + `npx vitest run src/lib/server/data/` → PASS

### Task 6: 발송 흐름 `send.ts` + `readStaged`

**파일:**

- 생성: `src/lib/server/mail/broadcast/send.ts`
- 수정: `src/lib/server/data/storage.ts`(+`readStaged`), `src/lib/server/data/storage-memory.ts`(+`readStaged`), `src/lib/server/mail/dispatch.ts`(`export const BATCH_SIZE`, `export async function optedInMemberEmails`)
- 테스트: `src/lib/server/mail/broadcast/send.test.ts`

**Interfaces:**

- 사용: Task 1 `dispatchRaw`·`GmailQuotaError`, Task 2 `parseEml`·`BroadcastParseError`, Task 3 `sanitizeMailHtml`·`withFooter`, Task 4 `composeBroadcast`, Task 5 store, `getAdminAccessToken`, `isSingleAddress`, `stagedInfo`, `removeStaged`
- 제공:

```ts
export const BROADCAST_PREFIX = "pending/broadcast-eml/";
export const BROADCAST_MAX_BYTES = 25_000_000;
export type BroadcastProblem =
  "bad-key" | "missing" | "too-large" | "unreadable" | "no-subject" | "no-body";
export interface BroadcastPreview {
  messageId: string;
  subject: string;
  html: string | null;
  text: string;
  attachments: { filename: string | null; size: number; inline: boolean }[];
  recipientCount: number;
  existing: MailBroadcast | null;
}
export async function previewBroadcast(
  s3Key: string,
): Promise<
  | { ok: true; preview: BroadcastPreview }
  | { ok: false; problem: BroadcastProblem }
>;
export async function sendBroadcastTest(
  s3Key: string,
  to: string,
): Promise<
  { ok: true } | { ok: false; problem: BroadcastProblem | "send-failed" }
>;
export async function sendBroadcast(
  s3Key: string,
  sentBy: string,
): Promise<
  | { ok: true; row: MailBroadcast; skipped: number }
  | {
      ok: false;
      problem: BroadcastProblem | "duplicate" | "no-recipients";
      existing?: MailBroadcast;
    }
>;
// storage.ts
export async function readStaged(path: string): Promise<Uint8Array | null>;
```

**Acceptance criteria:**

- [ ] 공통 적재: 접두 `BROADCAST_PREFIX` 아니면 `bad-key`, `stagedInfo` null → `missing`, size > 25MB → `too-large`, `readStaged` → parse(오류 코드를 problem으로) → html이면 `sanitizeMailHtml` → `withFooter(optOutUrl = ${SITE_ORIGIN 또는 기본}/settings/notifications)`
- [ ] `previewBroadcast`: html은 미리보기용으로 `cid:<id>`를 해당 첨부의 `data:<mime>;base64,…`로 바꿔 반환(발송본은 그대로), `recipientCount` = 주소 검사를 통과한 `optedInMemberEmails` 수, `existing` = `findBroadcast`
- [ ] `sendBroadcastTest`: `to` 한 주소에만 1통, 기록 없음. `to`가 `isSingleAddress`를 통과하지 못하거나 Gmail 오류면 `{ ok: false, problem: "send-failed" }`(throw하지 않음)
- [ ] `sendBroadcast`: 수신자 0이면 `no-recipients`(선점 안 함) → `claimBroadcast`(`sending`, ulid id, `startedAt` now) 실패면 `duplicate` + existing → 묶음(BATCH_SIZE)마다 compose+`dispatchRaw`; 묶음 실패는 계속, `GmailQuotaError`면 남은 묶음 중단 → `status` = 실패 0이면 `sent`, 성공 0이면 `failed`, 그 외 `partial`; `isSingleAddress`를 통과하지 못한 주소는 빼고 그 수를 결과의 `skipped`로 반환(기록·로그에는 수만, spec 오류 처리 표) → `finishBroadcast` → `removeStaged([s3Key])` 실패는 로그만
- [ ] 토큰 획득 실패는 첫 묶음 전 `failed`로 기록
- [ ] 로그에 주소·본문 없음(`console.error`는 이벤트명·묶음 번호·Gmail reason만)
- [ ] `dispatch.ts` export 추가 외 동작 불변(기존 dispatch 테스트 통과)

**의존:** 1~5 **크기:** M

- [ ] 실패하는 테스트: store-memory·storage-memory(`__stage`)·fetch stub으로 — 170명(80+80+10) 모두 성공 → `sent`·batchesSent 3; 둘째 묶음 400 → `partial`; 첫 묶음 `dailyLimitExceeded` → 남은 묶음 호출 없음·`failed`; 같은 파일 두 번 → 둘째 `duplicate`; `failed` 기록 뒤 재발송 허용; 동시 두 `sendBroadcast` → fetch 발송 호출은 한 번분(묶음 수만큼)만; 접두 위반·25MB 초과·깨진 파일 problem; preview의 `data:` 치환과 발송 raw의 `cid:` 유지; 발송 후 staging 파일 삭제됨
- [ ] 실패 확인: `npx vitest run src/lib/server/mail/broadcast/send.test.ts` → FAIL
- [ ] 최소 구현: 위 시그니처
- [ ] 통과 확인: 같은 명령 + `npx vitest run src/lib/server/mail/` → PASS

### Checkpoint: Task 5~6 이후

- [ ] `pnpm test` 실패 0, `pnpm check` 오류 0, `pnpm lint` 통과
- [ ] 서버 흐름(적재 → 선점 → 묶음 발송 → 기록 → 정리)이 테스트로 끝까지 확인됨

### Task 7: 업로드 목적 `broadcast-eml`

**파일:**

- 수정: `src/lib/domain/uploads.ts`(`UPLOAD_PURPOSES["broadcast-eml"] = { types: ["message/rfc822", "application/octet-stream"], maxBytes: 25_000_000 }`), `src/lib/server/services/uploads.ts`(`PREFIXES["broadcast-eml"] = "broadcast"`, `EXTENSIONS["message/rfc822"] = "eml"`; `application/octet-stream`은 기존대로 `bin`)
- 테스트: `src/lib/domain/uploads.test.ts`, `src/routes/api/uploads/presign/` 기존 테스트 파일에 사례 추가

**Interfaces:**

- 제공: presign `purpose: "broadcast-eml"` → `s3Key`가 `pending/broadcast-eml/`로 시작

**Acceptance criteria:**

- [ ] 관리자 presign 성공, 비관리자 403(seminar-poster 예외에 넣지 않음)
- [ ] 25_000_001 bytes는 `VALIDATION_FAILED`
- [ ] `send.ts`의 `BROADCAST_MAX_BYTES`는 `uploadSpec("broadcast-eml").maxBytes`를 쓰도록 바꿔 값 하나만 둠

**의존:** 6 **크기:** S

- [ ] 실패하는 테스트: `uploadFileProblem("broadcast-eml", { type: "message/rfc822", size: 1 })` → null, `{ type: "message/rfc822", size: 25_000_001 }` → `"size"`, `{ type: "text/plain", size: 1 }` → `"type"`; presign 관리자 → 200·`s3Key`가 `pending/broadcast-eml/`로 시작하고 `.eml`로 끝남, 비관리자 → 403
- [ ] 실패 확인: `npx vitest run src/lib/domain/uploads.test.ts src/routes/api/uploads/` → FAIL
- [ ] 최소 구현: 위 파일 수정
- [ ] 통과 확인: 같은 명령 → PASS, `pnpm check` 오류 0(`PREFIXES` `satisfies` 검사)

### Task 8: 화면 서버 `/admin/mail/broadcast/+page.server.ts`

**파일:**

- 생성: `src/routes/(admin)/admin/mail/broadcast/+page.server.ts`
- 테스트: `src/routes/(admin)/admin/mail/broadcast/broadcast-actions.test.ts`

**Interfaces:**

- 사용: Task 6 `previewBroadcast`·`sendBroadcastTest`·`sendBroadcast`, Task 5 `recentBroadcasts`, `ensureAdmin`, `handleAdminAction`
- 제공:
  - `load` → `{ recent: MailBroadcast[] }`(최근 20건, `ensureAdmin(locals, { silent: true })`)
  - action `preview`(form `s3Key`) → `{ operation: "preview", preview }` 또는 `fail(400, { error: problem })`
  - action `test`(form `s3Key`) → 수신자는 세션 관리자 본인 `session.user.email`, `{ operation: "test-sent" }`
  - action `send`(form `s3Key`) → `{ operation: "sent", row, skipped }` 또는 `fail(409, { error: "duplicate", existing })` / `fail(400, { error: problem })`
  - `export const config = { maxDuration: 120 }`

**Acceptance criteria:**

- [ ] 비관리자는 세 action 모두 거부(기존 `handleAdminAction` 동작)
- [ ] `send`는 폼의 제목·HTML 같은 다른 필드를 읽지 않음(s3Key만)
- [ ] problem 코드별 한국어 메시지는 화면(Task 9)에서 매핑, 서버는 코드만

**의존:** 6, 7 **크기:** S

- [ ] 실패하는 테스트: `review-mail-actions.test.ts` 방식(locals 관리자·비관리자 객체, `$lib/server/mail/broadcast/send` mock)으로 위 항목
- [ ] 실패 확인: `npx vitest run "src/routes/(admin)/admin/mail/broadcast/"` → FAIL
- [ ] 최소 구현 → 같은 명령 PASS

### Task 9: 화면 `+page.svelte`와 진입 링크

**파일:**

- 생성: `src/routes/(admin)/admin/mail/broadcast/+page.svelte`
- 수정: `src/routes/(admin)/admin/mail/+page.svelte`(상단에 `/admin/mail/broadcast` 링크 "외부 메일 전체 공지")

**Interfaces:**

- 사용: `uploadAdminFile(file, "broadcast-eml", operationId)`(`$lib/client/api`), Task 8 actions, `uploadAccept`·`uploadFileProblem`(`$lib/domain/uploads`)

**Acceptance criteria:**

- [ ] 흐름: 파일 선택(`accept=".eml,message/rfc822"`) → `file.type`이 빈 문자열이면 `new File([file], file.name, { type: "message/rfc822" })`로 바꿔 업로드 → `?/preview` 자동 제출 → 제목·수신자 수·첨부 목록·`<iframe sandbox="" srcdoc={preview.html}>`(스크립트·폼·같은 출처 불허) 표시
- [ ] `existing`이 `sent`·`partial`이면 "이미 발송됨(일시·보낸 사람·상태)", `sending`이면 "결과 불명 — Gmail 보낸편지함을 확인하세요", 두 경우 전체 발송 버튼 비활성. `failed`면 "이전 발송이 실패해 다시 보낼 수 있습니다" 안내와 함께 버튼 활성
- [ ] [내게 시험 발송] → 결과 표시. [전체 발송] → `confirm("N명에게 발송합니다")` 뒤 제출, 진행 중 버튼 비활성(더블클릭 방지), 결과(상태·성공/실패 묶음 수·`skipped`가 1 이상이면 "주소 형식 문제로 N명 제외") 표시
- [ ] problem 코드 → 한국어 문구:

| 코드            | 문구                                                      |
| --------------- | --------------------------------------------------------- |
| `bad-key`       | 업로드 경로가 올바르지 않습니다. 파일을 다시 올려 주세요. |
| `missing`       | 올린 파일을 찾지 못했습니다. 다시 올려 주세요.            |
| `too-large`     | 25MB를 넘는 파일은 올릴 수 없습니다.                      |
| `unreadable`    | 메일 파일(.eml)로 읽을 수 없습니다.                       |
| `no-subject`    | 제목이 없는 메일입니다.                                   |
| `no-body`       | 본문이 없는 메일입니다.                                   |
| `duplicate`     | 이미 발송된 메일입니다.                                   |
| `no-recipients` | 받을 회원이 없습니다.                                     |
| `send-failed`   | 시험 발송에 실패했습니다.                                 |

- [ ] 하단 최근 발송 20건 표(제목·보낸 사람·시각·수신자 수·상태)
- [ ] 기존 관리자 화면의 컴포넌트·스타일 관례를 따름(`/admin/mail/+page.svelte` 참고)

**의존:** 8 **크기:** M

- [ ] `pnpm check`·`pnpm lint` 통과, 이 화면의 동작 확인은 Task 10

### Checkpoint: Task 7~9 이후

- [ ] `pnpm test`·`pnpm check`·`pnpm lint`·`pnpm build` 통과

### Task 10: 실제 환경 확인

**파일:** 없음(측정 기록은 `.tmp/eml-broadcast/live-check.md`)

**Acceptance criteria:**

- [ ] dev 서버(`pnpm dev`, dev 대상 DB·staging)에서 관리자 로그인 → fixture가 아닌 실제 Gmail "원본 다운로드" `.eml` 1개(HTML·내장 이미지·첨부 포함) 업로드 → 미리보기에 서식·이미지·첨부 목록 표시(Playwright 스크린샷)
- [ ] [내게 시험 발송] → 받은 메일이 원본과 같은 구성(사용자 확인)
- [ ] Bcc 비노출: 시험 전용 코드 경로 없이, dev DB의 수신 동의 주소를 Open Questions에서 받은 두 주소로만 둔 상태에서 [전체 발송] → 두 메일함 모두 수신, 각 원본 헤더에 다른 주소 없음(사용자 확인)
- [ ] 같은 파일 재업로드 → "이미 발송됨"
- [ ] Vercel preview 배포 build가 `maxDuration: 120`을 받아들임(거부되면 멈추고 질문)
- [ ] prod 회원에게는 보내지 않음

**의존:** 9 **크기:** S

- [ ] `playwright-browser` 스킬로 진행, 결과·스크린샷 경로를 기록

### Task 11: 미리보기 이미지 서명 주소와 최종 검토 수정 (D-000162)

최종 검토(opus)의 Important: 미리보기 응답에 내장 이미지를 `data:` URI로 넣으면 Vercel 함수 응답 한도 4.5MB를 넘어 큰 이미지 메일은 운영에서 미리보기·발송이 막힘. Task 6의 `data:` 치환을 아래로 바꾼다.

**파일:**

- 수정: `src/lib/server/data/storage.ts`, `src/lib/server/data/storage-memory.ts`, `src/lib/server/mail/broadcast/send.ts`, `src/lib/server/mail/broadcast/compose.ts`, `src/routes/(admin)/admin/mail/broadcast/+page.svelte`
- 테스트: `src/lib/server/mail/broadcast/send.test.ts`, `src/lib/server/mail/broadcast/compose.test.ts`, `src/lib/server/data/storage-memory.test.ts`(있으면)

**Interfaces:**

- 제공(storage): `uploadStaged(path: string, bytes: Uint8Array, contentType: string): Promise<void>`(staging 버킷 `upsert: true`), `createSignedStagedUrl(path: string, expiresInSeconds: number): Promise<string>`. memory 구현은 바이트 저장 + `https://memory.test/staged/<path>?exp=<s>`.
- 변경(send): `BroadcastPreview`에 `htmlOmitted: boolean` 추가. `PREVIEW_HTML_BUDGET = 3_000_000`, `PREVIEW_IMAGE_TTL = 600`.

**Acceptance criteria:**

- [ ] `previewBroadcast`: 정화된 HTML에서 실제로 참조되는 `cid:<id>`(Task 6의 경계 일치 규칙 유지)만, `SAFE_MIME` 통과 이미지에 한해 `<s3Key에서 확장자를 뗀 경로>/preview/<1부터 번호>.<mime 확장자>`로 `uploadStaged` → `createSignedStagedUrl(path, 600)` → HTML의 그 `cid:`를 서명 주소로 치환. 참조되지 않거나 MIME이 맞지 않는 첨부는 저장하지 않음. `data:` URI 생성 코드는 제거
- [ ] 치환 후 HTML 길이(UTF-8 바이트)가 3_000_000을 넘으면 `html: null`, `htmlOmitted: true`(텍스트본은 그대로)
- [ ] `sendBroadcast` 정리: `removeStaged`에 `.eml`과 함께 그 `preview/` 아래 객체 전부(`listStaged`로 조회). 삭제 실패는 로그만
- [ ] 저장·서명 실패는 미리보기 실패가 아니라 그 이미지만 `cid:` 그대로 둠(로그에 경로·이름 없이 건수만)
- [ ] compose: `contentDisposition: a.disposition ?? undefined`(헤더가 없는 cid 이미지를 nodemailer가 inline으로 고르게). 테스트: disposition null + contentId 이미지가 raw에서 `Content-Disposition: inline`
- [ ] 화면: `htmlOmitted`면 iframe 대신 텍스트본 + "본문이 커서 미리보기 대신 텍스트로 보여 줍니다. 실제 모양은 [내게 시험 발송]으로 확인하세요." 안내. `PROBLEMS`를 `Record<BroadcastProblem | "duplicate" | "no-recipients" | "send-failed", string>`로 묶음. send의 `SERVICE_UNAVAILABLE` 문구를 "결과를 확인하지 못했습니다. 최근 발송 기록이 '진행 중'이면 Gmail 보낸편지함을 확인하세요."로(버튼은 새 파일 선택 전까지 비활성 유지)
- [ ] 기존 send·compose·화면 동작 회귀 없음

**의존:** 1~9 **크기:** M

- [ ] 실패하는 테스트: 참조된 cid만 저장·서명 치환(img1·img10 경계 포함), 미참조·위험 MIME 미저장, 3MB 초과 htmlOmitted, 발송 후 preview 객체까지 삭제, 서명 실패 시 그 이미지만 cid 유지, compose inline 기본값
- [ ] 실패 확인: `npx vitest run src/lib/server/mail/broadcast/` → FAIL
- [ ] 최소 구현 → 통과 확인, `pnpm check`·`pnpm lint`·`pnpm build`
