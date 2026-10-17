# .eml 전체 공지 편집기 구현 계획

**목표:** `/admin/mail/broadcast`에서 올린 `.eml`의 제목·본문(Jodit WYSIWYG)·첨부 빼기를 고쳐 초안으로 저장하고, 시험·전체 발송이 그 초안을 쓰게 함.
**구조:** 초안 본문은 staging `draft.html`, 메타는 앱 테이블 `mail-broadcast-drafts`. 서버가 저장·발송 때 두 번 정화하고 미리보기 서명 주소를 `cid:`로 되돌림. 화면은 Jodit을 iframe 모드로 동적 로드.
**기술 스택:** 기존 + `jodit` 4.17.1(exact).
**Spec:** `docs/specs/2026-10-17-eml-editor-design.md`

## 전역 제약

- 의존성은 `jodit@4.17.1`(exact) 하나만 추가(D-000193). 그 밖 추가 금지.
- 편집기·초안 본문에는 꼬리말이 없음. 꼬리말은 시험·발송 때 서버가 1회(`withFooter`).
- 초안 저장과 발송 직전 모두 `sanitizeMailHtml`. 클라이언트 HTML을 정화 없이 쓰지 않음.
- 중복 차단은 원본 Message-ID(D-000191). 초안은 업로드 한 건마다 하나(D-000192).
- 편집 HTML 상한 `PREVIEW_HTML_BUDGET`(3,000,000 UTF-8 바이트) 재사용.
- 로그에 주소·본문·파일 이름 금지. 문제 코드만 반환하고 문구는 화면이 매핑.
- 테스트: vitest, store-memory·storage-memory, Gmail은 fetch stub. 실제 Gmail·Preview는 Task 7에서만.

## 위험

| 위험                                                        | 영향 | 완화                                                                 |
| ----------------------------------------------------------- | ---- | -------------------------------------------------------------------- |
| Jodit 4.17.1(고정)·iframe 모드가 4.18.3 spike와 보존이 다름 | 상   | Task 1이 먼저 측정, 기준 미달이면 멈추고 질문                        |
| Jodit이 서명 주소 `src`를 바꿈(쿼리 정리 등)                | 중   | Task 2 되돌리기가 경로만 비교(쿼리 무시), Task 1에서 `src` 보존 확인 |
| 저장 요청이 Vercel 4.5MB 초과                               | 중   | 3MB 예산, 초과 시 편집 불가                                          |
| Jodit SSR import 실패                                       | 중   | 클라이언트에서만 `import("jodit")`(`onMount`), build로 확인          |

## Open Questions

- 없음(Task 1 수치가 다르면 그때 질문).

## 파일 구조

| 파일                                                                                | 책임                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| `scripts/measure/editor-preservation.mjs`, `scripts/measure/editor-fixtures/*.html` | 보존 회귀 시험(합성 HTML만)                       |
| `src/lib/server/data/schemas/mail-broadcast-draft.ts` (+ `index.ts`)                | 초안 행 schema·등록                               |
| `src/lib/server/mail/broadcast/draft.ts`                                            | 초안 읽기·저장·삭제, `restoreCids`                |
| `src/lib/server/mail/broadcast/send.ts`                                             | 초안 우선 적재, `editableHtml`, 발송 뒤 초안 정리 |
| `src/lib/server/services/maintenance.ts`                                            | 7일 지난 초안 행 정리                             |
| `src/routes/(admin)/admin/mail/broadcast/+page.server.ts`                           | action `saveDraft`                                |
| `src/lib/client/eml-editor.ts`                                                      | Jodit 로드·설정·값 읽기                           |
| `src/routes/(admin)/admin/mail/broadcast/+page.svelte`                              | 편집 영역 UI                                      |

의존: 1 → 2 → 3 → (4, 5 병렬) → 6 → 7.

---

### Task 1: Jodit 고정 버전 설치와 보존 회귀 시험

**파일:**

- 수정: `package.json`, `pnpm-lock.yaml`(`jodit@4.17.1` exact)
- 생성: `scripts/measure/editor-preservation.mjs`, `scripts/measure/editor-fixtures/{table-styles,cid-image,links}.html`(합성, 실제 메일 아님)
- 수정: `scripts/measure/README.md`(사용법 한 절)

**Interfaces:**

- 제공: `node scripts/measure/editor-preservation.mjs [--html <파일>]` → fixture마다 (a) 무편집 (b) 한 단어 편집 결과를 표로 출력, 기준(표·칸 수 동일, `img src` 보존 100%, `a href` 보존 100%, 정규화 style 보존 ≥ 99%, 화면 픽셀 차이 ≤ 1%) 미달이면 exit 1

**Acceptance criteria:**

- [ ] `.tmp/eml-editor-spike/`의 측정 방식(`metrics.js`·Playwright·픽셀 비교)을 저장소로 옮기되 Jodit만, **iframe 모드**(`iframe: true`)와 고정 버전 4.17.1 사용
- [ ] 합성 fixture 3종 모두 기준 통과. `--html .tmp/eml-broadcast/sample.eml`에서 만든 HTML(로컬 전용, 저장소에 넣지 않음)로도 spike 4.18.3 수치(표 17/17, img 3/3, href 7/7, 정규화 style 100%, 화면 0%)와 같음
- [ ] 다르면 구현을 멈추고 수치와 함께 보고(메인이 질문)
- [ ] Playwright Python(`python3`, `-I` 금지) 또는 Node Playwright — 저장소에 새 의존성을 추가하지 않는 쪽(Python, 사용자 site-packages)

**의존:** 없음 **크기:** M

- [ ] 실행 → 기준 통과 출력 확인. `jodit` 버전을 일부러 바꾸지 않고, fixture 하나의 `style`을 지우는 편집기 설정(예: `cleanHTML.removeEmptyElements` 등 아닌 명시적 `allowTags` 제한)으로 1회 기준 미달(exit 1)을 확인해 시험이 실패를 잡는지 확인

### Task 2: 초안 저장소와 사진 주소 되돌리기

**파일:**

- 생성: `src/lib/server/data/schemas/mail-broadcast-draft.ts`, `src/lib/server/mail/broadcast/draft.ts`
- 수정: `src/lib/server/data/schemas/index.ts`, `docs/schema.md`(목록 한 줄)
- 테스트: `src/lib/server/mail/broadcast/draft.test.ts`

**Interfaces:**

- 제공:

```ts
export const MailBroadcastDraftSchema = z.object({
  id: z.string().min(1),
  s3Key: z.string().min(1),
  messageId: z.string().min(1),
  subject: z.string().min(1),
  removedAttachments: z.array(z.number().int().min(0)),
  savedBy: z.string().min(1),
  savedAt: DateTime,
});
export type MailBroadcastDraft = z.infer<typeof MailBroadcastDraftSchema>;
// draft.ts
export const draftId = (s3Key: string) => string; // 확장자 뗀 키의 마지막 부분
export const draftHtmlPath = (s3Key: string) => string; // `<확장자 뗀 키>/draft.html`
export async function readDraft(
  s3Key: string,
): Promise<{ row: MailBroadcastDraft; html: string | null } | null>;
export async function writeDraft(
  row: MailBroadcastDraft,
  html: string,
): Promise<void>; // 파일 먼저(upsert), 그다음 행
export async function deleteDraft(s3Key: string): Promise<void>; // 실패는 로그만
export interface PreviewImage {
  n: number;
  ext: string;
  contentId: string;
}
export function restoreCids(
  html: string,
  s3Key: string,
  images: PreviewImage[],
): string;
```

**Acceptance criteria:**

- [ ] `restoreCids`: `img src`가 `<확장자 뗀 키>/preview/<n>.<ext>`로 끝나는 경로(URL이면 pathname 기준, 쿼리·토큰 무시, 퍼센트 인코딩 해석 후 비교)이면 `cid:<그 n의 contentId>`로 바꿈. 다른 업로드의 경로, 알 수 없는 n, 다른 확장자, 일반 외부 이미지는 그대로
- [ ] `writeDraft`는 `uploadStaged(draftHtmlPath, utf8, "text/html")` 뒤 `mutate("mail-broadcast-drafts")`로 같은 id 행을 교체
- [ ] `readDraft`: 행 없으면 null, 행만 있고 파일 없으면 `html: null`(로그 1줄, 경로 없이)
- [ ] `deleteDraft`: 행 제거 + 파일 `removeStaged`, 각각 실패는 로그만

**의존:** 1 **크기:** S

- [ ] 실패하는 테스트(위 항목, store-memory·storage-memory) → 실패 확인 → 구현 → 통과

### Task 3: 발송 흐름의 초안 사용

**파일:**

- 수정: `src/lib/server/mail/broadcast/send.ts`
- 테스트: `src/lib/server/mail/broadcast/send.test.ts`(추가)

**Interfaces:**

- 사용: Task 2 전부
- 제공:

```ts
export type DraftProblem =
  "no-subject" | "no-body" | "too-large-draft" | "bad-input";
export async function saveDraft(
  s3Key: string,
  input: { subject: string; html: string; removedAttachments: number[] },
  savedBy: string,
): Promise<
  | { ok: true; savedAt: string }
  | { ok: false; problem: BroadcastProblem | DraftProblem }
>;
// BroadcastPreview에 추가: editableHtml: string | null; editable: boolean; draft: { subject: string; removedAttachments: number[]; savedAt: string; savedBy: string } | null
```

**Acceptance criteria:**

- [ ] 미리보기 이미지 목록 계산을 `previewImages(parsed, html)`(순수 함수, `PreviewImage[]` 반환)로 분리해 `signPreviewImages`와 `saveDraft`가 같은 규칙을 씀(참조된 cid, SAFE_MIME, `image/*`, SVG 제외, 원본 첨부 순서, 번호 1부터)
- [ ] `saveDraft`: `loadBroadcast`와 같은 키 검사 → 원본 해석 → 입력 검사(spec 순서: 제목 trim 빈 값 `no-subject` / `removedAttachments` 정수·범위·중복 아님 아니면 `bad-input` / HTML 바이트 > 3MB `too-large-draft`) → `restoreCids` → `sanitizeMailHtml` → 정화 결과에 텍스트도 `img`도 없으면 `no-body` → `writeDraft`
- [ ] `loadBroadcast`: 초안이 있으면 제목 = 초안 제목, html = 초안 html(다시 `sanitizeMailHtml`, 파일 없으면 원본 html), 첨부 = 원본 첨부에서 `removedAttachments` 제외 + **초안 html이 참조하지 않는 cid 첨부 제외**, 텍스트본 = `withFooter({ html, text: null })`(원본 text 파트 미사용). 초안 없으면 기존 동작 그대로
- [ ] `LoadedBroadcast`에 꼬리말 없는 `bareHtml` 추가. `previewBroadcast`가 `editableHtml`(= `bareHtml` + 미리보기 서명 주소 치환, 3MB 초과면 null·`editable: false`)과 `draft`를 반환
- [ ] `sendBroadcastTest`·`sendBroadcast`는 초안 반영본으로 조립(코드 경로는 `loadBroadcast` 공유). 중복 차단은 원본 messageId
- [ ] `sendBroadcast` 정리에 `deleteDraft(s3Key)` 추가(기존 `removeStaged`와 같이, 실패는 로그만)
- [ ] 단위 시험: 서명 주소가 섞인 초안 → 발송 raw에 서명 주소 없음·`cid:` 유지, 꼬리말 정확히 1회, 지운 사진의 cid 첨부 미포함, `removedAttachments` 첨부 미포함, `<script>` 넣은 초안 → 저장본·발송본에 없음, 3MB 예산, 빈 제목·본문·잘못된 색인 거부, 초안 없을 때 기존 시험 전부 통과

**의존:** 2 **크기:** M

- [ ] 실패하는 테스트 → 실패 확인 → 구현 → `npx vitest run src/lib/server/mail/` 통과

### Task 4: 미발송 초안 행 정리

**파일:**

- 수정: `src/lib/server/services/maintenance.ts`
- 테스트: 기존 maintenance 테스트 파일에 사례 추가

**Acceptance criteria:**

- [ ] `runMaintenance`가 `savedAt`이 `STAGING_TTL_MS`(7일)보다 오래된 `mail-broadcast-drafts` 행을 지움(파일은 기존 staging 정리가 맡음). 결과 `counts`에 `draftsRemoved`
- [ ] 7일 안 행은 남김, 행이 없으면 쓰기 없음

**의존:** 2 **크기:** XS

- [ ] 실패하는 테스트 → 구현 → 통과

### Task 5: `saveDraft` action

**파일:**

- 수정: `src/routes/(admin)/admin/mail/broadcast/+page.server.ts`
- 테스트: `broadcast-actions.test.ts`(추가)

**Acceptance criteria:**

- [ ] action `saveDraft`(form: `s3Key`, `subject`, `html`, `removed` = 쉼표로 구분한 정수): `handleAdminAction` 안에서 `saveDraft(s3Key, …, session.user.email)`, 성공 `{ operation: "draft-saved", savedAt }`, 실패 `fail(400, { error: problem })`
- [ ] 폼 값은 문자열만(`typeof === "string"`), `removed` 파싱 실패는 서비스에 `bad-input`이 되도록 그대로 넘기지 말고 action에서 `fail(400, { error: "bad-input" })`
- [ ] 비관리자 거부, 서비스 mock 미호출

**의존:** 3 **크기:** S

- [ ] 실패하는 테스트 → 구현 → 통과

### Task 6: 편집 화면

**파일:**

- 생성: `src/lib/client/eml-editor.ts`
- 수정: `src/routes/(admin)/admin/mail/broadcast/+page.svelte`, `package.json`은 Task 1에서 끝남

**Interfaces:**

- 제공(`eml-editor.ts`): `export async function mountEmlEditor(el: HTMLElement, html: string, onChange: () => void): Promise<{ getHtml(): string; destroy(): void }>` — `import("jodit")` + CSS, `iframe: true`, 보존 설정은 Task 1에서 통과한 설정 그대로

**Acceptance criteria:**

- [ ] `preview.editable`이면 [편집] 버튼, 누르면 편집 영역(제목 입력, Jodit, 첨부 목록 '빼기' 체크 — 내장 이미지 행은 체크 대신 "본문에서 지우면 빠집니다" 안내, [저장])
- [ ] 초안이 있으면 제목·빼기 상태·'저장됨 <시각>'을 초안으로 채움
- [ ] [저장] → `?/saveDraft` → 성공 시 `?/preview` 다시 요청해 미리보기 갱신, 실패 시 문구(spec 표) + 편집 내용 유지
- [ ] 저장하지 않은 변경이 있으면 `beforeunload` 경고. [내게 시험 발송]·[전체 발송]은 먼저 저장(실패하면 발송 안 함), 전체 발송 confirm은 기존 enhance 콜백 방식 유지
- [ ] `preview.editable === false`면 "본문이 커서 편집할 수 없습니다. 원본 그대로 보낼 수 있습니다."
- [ ] 새 파일 선택 시 편집기 `destroy`, 상태 초기화
- [ ] Jodit은 `onMount`/버튼 클릭 뒤에만 import(SSR에서 import 안 함), `pnpm build` 통과

**의존:** 5 **크기:** M

- [ ] `pnpm check`·`pnpm lint`·`pnpm build` 통과, 동작은 Task 7

### Checkpoint: Task 1~6 이후

- [ ] `npx vitest run --maxWorkers=4` 실패 0, `pnpm check`·`lint`·`build` 통과
- [ ] `node scripts/measure/editor-preservation.mjs` 통과

### Task 7: 실제 환경 확인

**Acceptance criteria:**

- [ ] 로컬: `DATA_BACKEND=memory` dev 서버 또는 `scripts/measure/` 실측 도구로 관리자 화면에서 편집기 로드 → 한 단어 고침 → 저장 → 미리보기 반영 → 새로고침 뒤 초안 유지 → 이탈 경고(Playwright, `dialog` 처리)
- [ ] Preview: 재배포 후 우회 로그인으로 `sample.eml` 편집·저장·미리보기 반영(사용자 확인, 발송은 누르지 않음)
- [ ] Vercel 로그에 오류·본문·주소 없음

**의존:** 6 **크기:** S
