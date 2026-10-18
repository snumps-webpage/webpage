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
2. 입력 검사: `subject` trim 후 빈 값이면 `no-subject`, HTML이 정화 후 텍스트·이미지 없이 비면 `no-body`, `removedAttachments`는 원본 첨부 색인 범위 안의 정수 집합이고 초안 본문이 `cid:`로 참조하는 첨부는 뺄 수 없음(`cid:<id>` 뒤 경계는 따옴표·공백·`>`·`)`·따옴표 엔티티이며 미리보기 서명·본문 사진 분류·발송 첨부 판정·이 검사가 같은 규칙을 씀. Jodit이 `url(&quot;cid:…&quot;)`로 다시 써도 참조로 봄, snumps-webpage/D-000211)(그 밖은 `bad-input`, D-000201), 원본에 HTML 파트가 없으면 `bad-input`(D-000202), 입력 HTML 바이트(저장 전·정화 후)가 `PREVIEW_HTML_BUDGET`(3MB) 초과면 `too-large-draft`. 이에 더해 이 초안으로 만들 편집용 미리보기 응답이 `PREVIEW_RESPONSE_BUDGET`(4,000,000바이트, 실제 직렬화 기준)을 넘으면 `too-large-draft`(저장 뒤 다시 열면 편집 불가가 되는 불일치 방지). 저장 때는 서명이 없으므로 `cid:` 참조를 서명 주소 최대 길이 가정(2048자: 한글 경로 퍼센트 인코딩 시 최악 약 1000자의 두 배 여유, snumps-webpage/D-000216-b) 자리표시로 바꾸고 나머지 필드 여유 20,000바이트를 더해 보수적으로 잼(snumps-webpage/D-000212).
3. **서명 주소 → cid 되돌리기**: 그 업로드의 미리보기 이미지 목록(`signPreviewImages`와 같은 결정적 규칙: 참조된 cid·SAFE_MIME·image/*·SVG 제외, 원본 첨부 순서)을 다시 계산해, HTML 전체에서 `https?://`로 시작해 공백·따옴표·`<>()`·백틱·`,`, 그리고 따옴표·`&nbsp;` 엔티티(`&quot;` `&#34;` `&#39;` `&apos;` `&#x22;` `&#x27;`) 앞에서 끝나는 주소(쿼리의 `&amp;`는 주소의 일부, snumps-webpage/D-000211) 중 그 업로드의 `…/preview/<n>.<ext>` 경로(쿼리·토큰 무시)를 가리키는 것을 `cid:<그 이미지의 contentId>`로 바꿈. 바꾸는 범위는 주소 덩어리 전체가 아니라 서명 주소의 실제 형태, 곧 경로 + 서명 쿼리(`?` 뒤 ASCII 토큰 문자 `[A-Za-z0-9._~%-]`의 `키=값`을 `&amp;`로 이은 것, 끝의 `.`은 제외)까지이며, 주소에 바로 붙은 글자(`.` `;` `!` `#frag` `&lt;` 한글 등)는 남김(메모리 백엔드 `?exp=600`, Supabase `?token=<JWT>` 두 형태, 선형 시간, snumps-webpage/D-000216-a). `img src`뿐 아니라 style 속성·`<style>`의 `url()`, `href` 등 어느 위치든 같음(`signPreviewImages`가 모든 위치의 `cid:`를 바꾸므로 되돌리기도 같은 범위, snumps-webpage/D-000207). 다른 업로드의 경로나 알 수 없는 주소는 그대로 두고 정화가 판단.
4. `sanitizeMailHtml`로 정화 → `draft.html` 업로드(`uploadStaged`, upsert) → 행 `mutate` upsert.
5. 반환: `{ ok: true, savedAt }` 또는 `{ ok: false, problem }`.

**적재(`loadBroadcast`) 변경**: 초안 행이 있으면 제목은 초안 제목, HTML은 `draft.html`(다시 정화), 첨부는 `removedAttachments`를 뺀 것. 텍스트본은 편집 HTML에서 `withFooter`가 새로 만듦(원본 text 파트는 쓰지 않음 — 편집과 어긋나므로). 원본 본문이 참조하던 cid 첨부 중 초안 HTML에서 지운 사진만 발송본에서 뺌. 원본이 참조하지 않던 cid 첨부(Content-ID 붙은 일반 파일)는 일반 첨부로 둠(snumps-webpage/D-000200).

**preview 응답 추가 필드**(snumps-webpage/D-000208, D-000209): `editableHtml`(꼬리말 없는 정화 HTML, 미리보기와 같은 서명 주소 치환), `footerHtml`(꼬리말 HTML 조각), `editable`, `notEditableReason`(`"no-html"` | `"too-large"` | `null`), `draft`(있으면 `{ subject, removedAttachments, savedAt, savedBy }`). 본문은 응답에 한 번만 담음: 편집 가능하면 `editableHtml` + `footerHtml`만 주고 `html`은 `null`(화면이 `editableHtml + footerHtml`로 미리보기를 만들며 옛 `html`과 바이트 단위로 같음), 편집 불가면 `html`(꼬리말 포함)만 주고 `editableHtml`·`footerHtml`은 `null`. 예산은 본문 바이트가 아니라 실제 전송 크기로 판정함(snumps-webpage/D-000212): SvelteKit action 응답이 `JSON.stringify({ type, status, data: devalue.stringify(data) })`로 두 번 직렬화되어 태그 많은 본문은 크게 부풀므로, 후보 응답을 `JSON.stringify({ data: devalue.stringify(preview) })`한 UTF-8 바이트가 `PREVIEW_RESPONSE_BUDGET`(4,000,000, Vercel 한도 4.5MB 아래) 이하인지 봄. 순서는 편집 가능 조합 → 편집 불가(`html`, `too-large`) → `html` 생략(`htmlOmitted`) → `text` 자름(`textTruncated`, 이분 탐색). `devalue`는 5.9.1 직접 의존성(snumps-webpage/D-000213). 원본에 HTML 파트가 없으면 `no-html`. 편집 가능 조건에는 응답 크기에 더해 편집용 본문(서명된 꼬리말 없는 본문)의 UTF-8 바이트가 `PREVIEW_HTML_BUDGET`(3MB) 이하여야 한다는 것도 있음: 응답 4MB 기준만으로는 태그 적은 3.3MB 본문이 편집 가능이 되지만 `saveDraft`는 입력 3MB에서 거부하기 때문이며, 넘으면 편집 불가(`too-large`, snumps-webpage/D-000214).

**중복 차단**: 원본 Message-ID 그대로(D-000191). 고친 메일도 같은 원본이면 한 번만.

### 화면

- 미리보기 아래 [편집] 버튼 → `src/lib/client/eml-editor.ts`가 `import("jodit")`로 Jodit을 **iframe 모드**로 띄움(메일의 `<style>`이 관리자 화면에 번지지 않게). 내용은 `editableHtml`(미리보기 iframe은 `editableHtml + footerHtml`).
- 제목 입력칸(초안 제목 또는 원본 제목), 첨부 목록 각 행에 '빼기' 체크(내장 이미지는 목록에 '본문 사진'으로 표시, 빼기는 본문에서 지우는 것으로 안내).
- [저장] → `?/saveDraft`(form: `s3Key`, `subject`, `html`, `removed`) → 성공 시 '저장됨 시각', 미리보기 갱신(`?/preview` 재요청).
- 변경 뒤 저장하지 않은 상태에서 페이지를 떠나면 `beforeunload` 경고. [내게 시험 발송]·[전체 발송]을 누르면 저장하지 않은 변경을 먼저 저장하고(실패하면 발송 중단) 진행.
- 전체 발송이 성공해 발송 결과가 생기면 편집 영역(제목·편집기·빼기 체크·저장 버튼)을 비활성하고 편집기를 읽기 전용으로 둠. 발송 콜백이 잠금을 풀어도 발송 결과가 있으면 다시 잠김(snumps-webpage/D-000216-c).
- 초안 저장 요청이 HTTP 413을 받으면(응답이 JSON이 아닌 경우 포함) "저장하지 못했습니다" 대신 `too-large-draft` 문구 "본문이 너무 커서 저장할 수 없습니다."를 보이고 편집 내용은 유지(snumps-webpage/D-000216-d).
- `editable: false`면 [편집] 대신 이유별 안내(snumps-webpage/D-000209): `no-html` → "HTML 본문이 없는 메일이라 편집할 수 없습니다. 원본 그대로 보낼 수 있습니다.", `too-large` → "본문이 커서 편집할 수 없습니다. 원본 그대로 보낼 수 있습니다."
- 문제 코드 문구 추가: `no-subject`(기존), `no-body`(기존), `too-large-draft`: "본문이 너무 커서 저장할 수 없습니다.", `bad-input`: "편집 내용을 읽을 수 없습니다. 다시 시도해 주세요."

### 오류 처리

| 상황                                         | 처리                                                              |
| -------------------------------------------- | ----------------------------------------------------------------- |
| 빈 제목·빈 본문·잘못된 첨부 색인·크기 초과   | 저장 거부, 코드별 문구, 편집 내용은 화면에 그대로                 |
| 저장 중 서버 오류(SERVICE_UNAVAILABLE)       | "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요." 편집 내용 유지 |
| 서명 주소 만료(10분)로 편집기 사진이 안 보임 | 저장·발송은 경로→cid 되돌리기로 정상. 편집을 다시 열면 새 주소    |
| 편집 HTML에 script 등                        | 저장 때·발송 때 두 번 정화                                        |
| 초안 파일만 있고 행 없음/행만 있고 파일 없음 | 행 없으면 원본 사용, 파일 없으면 원본 본문 + 초안 제목·첨부(로그) |
| 발송 뒤 초안 삭제 실패                       | 로그만, 7일 정리                                                  |

## 코드 스타일

기존 `broadcast/` 모듈 관례(결정 ID 인용 주석, 실패는 결과 값, 로그에 주소·본문·파일 이름 없음).

```ts
/** 그 업로드의 미리보기 사진 주소를 HTML 전체에서 cid로 되돌림 — 다른 주소는 손대지 않음 (D-000194, D-000207). */
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
