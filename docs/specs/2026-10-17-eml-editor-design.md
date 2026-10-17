# Spec: 외부 메일(.eml) 전체 공지 편집기

## 목표

- 관리자가 올린 `.eml`을 보내기 전에 메일 사이트처럼 고칠 수 있게 함: 제목, 본문(WYSIWYG), 첨부 빼기(D-000189).
- 사용자: 관리자. 기존 `/admin/mail/broadcast` 흐름(업로드 → 미리보기 → 시험 → 전체 발송, `docs/specs/2026-10-17-eml-broadcast-design.md`)에 편집 단계를 더함.
- 성공의 모습: 외부 기관 메일의 표·인라인 스타일·내장 이미지·링크가 편집 뒤에도 그대로이고, 고친 부분만 바뀐 메일이 회원에게 나감.
- 근거 결정: snumps-webpage/D-000154, D-000189~194.

## 기술 스택

- 기존 스택 그대로(SvelteKit 2·Svelte 5, Supabase staging, Gmail 업로드 전송).
- 추가 의존성: `jodit` **4.17.1**(MIT, 2026-09-30 공개 — 공개 2주 지난 최신, D-000193). 편집 화면에서만 동적 `import("jodit")`.
- 근거: `.tmp/eml-editor-spike/report.md`(후보 7개 실측). 실제 메일 기준 Jodit 4.18.3 무편집: 표 칸 17/17, 이미지 3/3, 링크 7/7, style 97.4%(정규화 100%), 화면 차이 0%.

## 명령

```
pnpm test          # vitest run
pnpm lint
pnpm check
pnpm build
node scripts/measure/editor-preservation.mjs   # 보존 회귀 시험(Task 7에서 추가)
```

## 프로젝트 구조

| 경로                                                                 | 역할                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/lib/server/data/schemas/mail-broadcast-draft.ts` (+ `index.ts`) | 초안 행 schema·등록                                              |
| `src/lib/server/mail/broadcast/draft.ts`                             | 초안 저장·읽기·삭제, 서명 주소→cid 되돌리기                      |
| `src/lib/server/mail/broadcast/send.ts`                              | 초안 우선 적재, 편집용 본문(꼬리말 없음) 제공, 발송 뒤 초안 정리 |
| `src/routes/(admin)/admin/mail/broadcast/+page.server.ts`            | action `saveDraft`, preview 응답에 편집용 본문                   |
| `src/routes/(admin)/admin/mail/broadcast/+page.svelte`               | [편집] 영역, Jodit, 제목 칸, 첨부 빼기, [저장], 이탈 경고        |
| `src/lib/client/eml-editor.ts`                                       | Jodit 동적 로드·설정·내보내기(화면 코드와 분리)                  |
| `scripts/measure/editor-preservation.mjs` + fixture                  | 보존 회귀 시험(spike를 저장소로 옮긴 것)                         |

## 설계

### 데이터

- **본문 저장 위치**: staging `pending/broadcast-eml/<업로드 id>/draft.html`. 앱 테이블은 표 전체가 JSONB 문서 하나라 큰 HTML을 넣지 않음. `<업로드 id>` = `.eml` 키에서 확장자를 뗀 경로의 마지막 부분(미리보기 `previewBase`와 같은 기준).
- **앱 테이블 `mail-broadcast-drafts`** 행: `id`(업로드 id), `s3Key`, `messageId`, `subject`, `removedAttachments`(빼는 첨부의 색인 목록 — `parsed.attachments` 순서 기준), `savedBy`(관리자 이메일), `savedAt`.
- 초안 본문은 **꼬리말 없는** 정화된 HTML. 꼬리말은 시험·발송 때 서버가 붙임(편집 대상 아님).
- 초안은 업로드 한 건마다 하나(D-000192). 동시 편집 전용 처리는 없음, 저장은 기존 `mutate` CAS.
- 발송(`sendBroadcast`) 뒤 초안 행·`draft.html` 삭제. 미발송분은 staging 7일 정리가 파일을, 앱 테이블 행은 같은 7일 기준으로 maintenance가 정리(행만, Task 4).

### 서버

**`saveDraft(s3Key, { subject, html, removedAttachments }, savedBy)`**

1. `loadBroadcast`와 같은 키·크기 검사, 원본 해석(첨부 목록·messageId 필요).
2. 입력 검사: `subject` trim 후 빈 값이면 `no-subject`, HTML이 정화 후 텍스트·이미지 없이 비면 `no-body`, `removedAttachments`는 원본 첨부 색인 범위 안의 정수 집합(그 밖은 `bad-input`), HTML 바이트가 `PREVIEW_HTML_BUDGET`(3MB) 초과면 `too-large-draft`.
3. **서명 주소 → cid 되돌리기**: 그 업로드의 미리보기 이미지 목록(`signPreviewImages`와 같은 결정적 규칙: 참조된 cid·SAFE_MIME·image/*·SVG 제외, 원본 첨부 순서)을 다시 계산해, `img src`가 그 업로드의 `…/preview/<n>.<ext>` 경로(쿼리·토큰 무시)를 가리키면 `cid:<그 이미지의 contentId>`로 바꿈. 다른 업로드의 경로나 알 수 없는 주소는 그대로 두고 정화가 판단.
4. `sanitizeMailHtml`로 정화 → `draft.html` 업로드(`uploadStaged`, upsert) → 행 `mutate` upsert.
5. 반환: `{ ok: true, savedAt }` 또는 `{ ok: false, problem }`.

**적재(`loadBroadcast`) 변경**: 초안 행이 있으면 제목은 초안 제목, HTML은 `draft.html`(다시 정화), 첨부는 `removedAttachments`를 뺀 것. 텍스트본은 편집 HTML에서 `withFooter`가 새로 만듦(원본 text 파트는 쓰지 않음 — 편집과 어긋나므로). 초안 HTML에서 참조하지 않는 cid 첨부(지운 사진)는 발송본에 넣지 않음.

**preview 응답 추가 필드**: `editableHtml`(꼬리말 없는 정화 HTML, 미리보기와 같은 서명 주소 치환, 3MB 초과면 `null` + `editable: false`), `draft`(있으면 `{ subject, removedAttachments, savedAt, savedBy }`).

**중복 차단**: 원본 Message-ID 그대로(D-000191). 고친 메일도 같은 원본이면 한 번만.

### 화면

- 미리보기 아래 [편집] 버튼 → `src/lib/client/eml-editor.ts`가 `import("jodit")`로 Jodit을 **iframe 모드**로 띄움(메일의 `<style>`이 관리자 화면에 번지지 않게). 내용은 `editableHtml`.
- 제목 입력칸(초안 제목 또는 원본 제목), 첨부 목록 각 행에 '빼기' 체크(내장 이미지는 목록에 '본문 사진'으로 표시, 빼기는 본문에서 지우는 것으로 안내).
- [저장] → `?/saveDraft`(form: `s3Key`, `subject`, `html`, `removed`) → 성공 시 '저장됨 시각', 미리보기 갱신(`?/preview` 재요청).
- 변경 뒤 저장하지 않은 상태에서 페이지를 떠나면 `beforeunload` 경고. [내게 시험 발송]·[전체 발송]을 누르면 저장하지 않은 변경을 먼저 저장하고(실패하면 발송 중단) 진행.
- `editable: false`면 [편집] 대신 "본문이 커서 편집할 수 없습니다. 원본 그대로 보낼 수 있습니다." 안내.
- 문제 코드 문구 추가: `no-subject`(기존), `no-body`(기존), `too-large-draft`: "본문이 너무 커서 저장할 수 없습니다.", `bad-input`: "편집 내용을 읽을 수 없습니다. 다시 시도해 주세요."

### 오류 처리

| 상황                                         | 처리                                                              |
| -------------------------------------------- | ----------------------------------------------------------------- |
| 빈 제목·빈 본문·잘못된 첨부 색인·3MB 초과    | 저장 거부, 코드별 문구, 편집 내용은 화면에 그대로                 |
| 저장 중 서버 오류(SERVICE_UNAVAILABLE)       | "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요." 편집 내용 유지 |
| 서명 주소 만료(10분)로 편집기 사진이 안 보임 | 저장·발송은 경로→cid 되돌리기로 정상. 편집을 다시 열면 새 주소    |
| 편집 HTML에 script 등                        | 저장 때·발송 때 두 번 정화                                        |
| 초안 파일만 있고 행 없음/행만 있고 파일 없음 | 행 없으면 원본 사용, 파일 없으면 원본 본문 + 초안 제목·첨부(로그) |
| 발송 뒤 초안 삭제 실패                       | 로그만, 7일 정리                                                  |

## 코드 스타일

기존 `broadcast/` 모듈 관례(결정 ID 인용 주석, 실패는 결과 값, 로그에 주소·본문·파일 이름 없음).

```ts
/** 그 업로드의 미리보기 사진 주소를 cid로 되돌림 — 다른 주소는 손대지 않음 (D-000194). */
export function restoreCids(
  html: string,
  base: string,
  images: PreviewImage[],
): string;
```

## 테스트 전략

| 단계        | 대상                          | 방법                                                                                                                                                                                                                                   |
| ----------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 위험 우선 | Jodit 4.17.1 iframe 모드 보존 | spike 측정을 4.17.1·iframe으로 재실행, 4.18.3과 같은 수치인지(다르면 질문)                                                                                                                                                             |
| 1 단위      | draft.ts·send.ts              | 서명 주소→cid(다른 업로드 경로·쿼리 토큰·알 수 없는 주소), 초안 저장·읽기·삭제, 첨부 빼기, 지운 사진 cid 제외, 편집 HTML 재정화(script 제거), 3MB 예산, 초안 우선 preview·test·send, 꼬리말 한 번만, 중복 차단 유지, 발송 뒤 초안 정리 |
| 2 action    | `saveDraft`                   | 비관리자 거부, 빈 제목·본문, 색인 범위, 키 경로, s3Key 외 필드 검사                                                                                                                                                                    |
| 3 회귀      | 보존 시험                     | spike를 `scripts/measure/editor-preservation.mjs`로 옮김(합성 fixture만, 실제 메일 제외), 기준치 이하이면 실패                                                                                                                         |
| 4 실제      | Preview·로컬                  | Preview 우회 로그인 → 편집 → 저장 → 미리보기 반영(발송 안 함), 로컬 Playwright로 편집기 로드·저장·이탈 경고                                                                                                                            |
| 전체        |                               | `pnpm test`·`check`·`lint`·`build`                                                                                                                                                                                                     |

## 경계

- Always: 저장·발송 때 서버 정화, 원본 Message-ID 중복 차단, 초안 본문은 staging 파일.
- Ask first: Jodit 버전 변경, 첨부 추가·새 사진 업로드, 앱 테이블에 HTML 저장, 실제 회원 발송.
- Never: 클라이언트 HTML을 정화 없이 발송, 꼬리말 편집 허용, 로그에 본문·주소.

## 성공 기준

- Jodit 4.17.1 iframe에서 합성 fixture 보존 수치가 spike(4.18.3)와 같음.
- 편집 뒤 저장한 초안으로 시험 발송하면 고친 부분만 바뀌고 표·스타일·내장 이미지·링크·꼬리말 1회가 유지(단위 시험의 raw MIME 검사).
- 서명 주소가 섞인 HTML을 저장하면 발송 raw에 서명 주소가 없고 `cid:`만 있음.
- 전체 검사 통과.

## Open Questions

- 없음(Jodit 4.17.1 보존 수치가 다르면 그때 질문).
