# Spec: 외부 메일(.eml) 전체 공지

## 목표

- 외부에서 받은 HTML 메일을 관리자가 `.eml` 파일로 올려, 수신 동의 회원 전체에게 공지로 재발송.
- 사용자: 관리자(`ensureAdmin` 통과자). 수신자: 기존 전체 공지 수신자와 동일(이번 학기 등록 회원·동문 중 수신 동의자, 탈퇴 유예 제외).
- 성공의 모습: Gmail에서 "원본 다운로드" → `/admin/mail/broadcast`에 올리기 → 미리보기 → 전체 발송, 회원 메일함에서 원 메일과 같은 모양(꾸밈·내장 이미지·첨부)으로 보임. 계정·토큰·외부 설정 추가 없음.
- 근거 결정: snumps-webpage/D-000100, D-000104, D-000105, D-000110, D-000121~125, D-000128.

## 기술 스택

- 기존: SvelteKit 2 + Svelte 5, `@sveltejs/adapter-vercel`(nodejs22.x), Supabase(앱 테이블 JSONB 문서 + Storage), Gmail API(`gmail.send` 범위, `ADMIN_REFRESH_TOKEN`), zod, vitest + PGlite.
- 추가 의존성(D-000124). 버전은 공개 후 2주 이상 지난 것 중 최신, 정확한 버전으로 고정:

| 패키지                 | 버전(안)     | 공개일          | 용도                                                              | 라이선스 |
| ---------------------- | ------------ | --------------- | ----------------------------------------------------------------- | -------- |
| `postal-mime`          | 4.0.2        | 2026-09-30      | `.eml` 해석                                                       | MIT-0    |
| `sanitize-html`        | 2.18.0       | 2026-09-30      | HTML 정화                                                         | MIT      |
| `@types/sanitize-html` | 2.16.2 (dev) | 2026-10-04 이전 | 타입                                                              | MIT      |
| `nodemailer`           | 10.0.14      | 2026-10-03      | `lib/mail-composer`로 MIME 조립(전송은 쓰지 않음), 자체 타입 포함 | MIT-0    |

- 출처: `pnpm view <패키지> time` 조회(2026-10-17). `@types/sanitize-html` 2.16.2 공개일은 미확인(수정일 2026-10-04만 확인). 구현 시 재조회.

## 명령

```
pnpm install
pnpm test          # vitest run
pnpm lint          # prettier --check + eslint
pnpm check         # svelte-kit sync + svelte-check
pnpm dev           # 실제 환경 확인(dev 대상)
```

## 프로젝트 구조

| 경로                                            | 역할                                                         |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `src/lib/server/mail/broadcast/parse.ts`        | `.eml` → `{ messageId, subject, html, text, attachments[] }` |
| `src/lib/server/mail/broadcast/sanitize.ts`     | HTML 정화 + 수신 설정 꼬리말(HTML·텍스트)                    |
| `src/lib/server/mail/broadcast/compose.ts`      | 묶음별 raw MIME 조립(Bcc 포함)                               |
| `src/lib/server/mail/broadcast/send.ts`         | 기록 선점 → 묶음 발송 → 기록 갱신 → staging 삭제             |
| `src/lib/server/mail/client.ts`                 | + `dispatchRaw(accessToken, raw)`: Gmail API 업로드 전송     |
| `src/lib/server/mail/dispatch.ts`               | `optedInMemberEmails`·`BATCH_SIZE` export(동작 불변)         |
| `src/lib/server/data/schemas/mail-broadcast.ts` | 발송 기록 행 schema                                          |
| `src/lib/server/data/storage.ts`                | + `readStaged(path)`: staging 파일 전체 읽기                 |
| `src/lib/domain/uploads.ts`                     | + 업로드 목적 `broadcast-eml`                                |
| `src/routes/(admin)/admin/mail/broadcast/`      | 화면·action                                                  |
| `src/lib/server/mail/broadcast/fixtures/*.eml`  | 시험용 고정 메일(개인정보 없는 합성본)                       |

## 설계

### 아키텍처

- 기존 메일 계층에 하위 모듈 `broadcast/`를 추가. 이벤트 디스패처(`emitMailEvent`)는 거치지 않음. 템플릿 렌더링 대상이 아니고 원본 MIME을 그대로 다루기 때문.
- 재사용: 수신자 해석(`optedInMemberEmails`), 묶음 크기(`BATCH_SIZE` 80), 주소 검사(`isSingleAddress`), 토큰(`getAdminAccessToken`), staging 업로드(`createUploadUrl`·`stagedInfo`·`removeStaged`), 앱 테이블(`getTable`·`mutate`).

### 컴포넌트

**업로드 목적 `broadcast-eml`**

- `types`: `message/rfc822`, `application/octet-stream`. OS·브라우저에 따라 `.eml` 형식 표기가 달라서임. 서명 URL은 Content-Type을 강제하지 않으므로 실제 검사는 해석 단계에서 함.
- `maxBytes`: 25_000_000(D-000122, D-000145). 사전 시험에서 24.97MB 메일이 업로드 전송으로 발송됨(로컬 24.7초).
- 경로: `pending/broadcast-eml/<id>-<slug>.eml`. 기존 일일 maintenance가 7일 지난 `pending/`을 정리함.
- 발급 권한: `/api/uploads/presign`의 기본 규칙(관리자 전용, `seminar-poster`만 예외)을 그대로 따름. 이 목적은 예외에 넣지 않음.

**parse.ts**

- `postal-mime`으로 해석.
- `messageId`: 헤더 `Message-ID`(앞뒤 공백·꺾쇠 정규화). 없으면 `sha256:<파일 해시>`.
- `subject`: 앞의 `Fwd:`·`FW:`·`Fw:`·`전달:`를 반복 제거(D-000104). 빈 제목은 거부.
- Gmail 전달 머리말 제거(D-000104): HTML은 `div.gmail_quote` 안의 `div.gmail_attr`(`---------- Forwarded message ---------` 블록)와 그 앞 전달자 메모를 제거하고 인용 본문만 남김. 텍스트는 `---------- Forwarded message ---------` 줄부터 머리말 끝 빈 줄까지와 그 앞 메모를 제거. 표지가 없으면 그대로 둠.
- `attachments`: `postal-mime` 결과 그대로(`filename`, `mimeType`, `disposition`, `contentId`, `content`). `disposition=inline`·`contentId`가 있는 것은 내장 이미지(D-000105).
- 거부(`BroadcastParseError`, 사유 코드): 해석 실패 / 제목 없음 / HTML·텍스트 본문 모두 없음.

**sanitize.ts**

- `sanitize-html` 허용 목록: 메일 서식 태그(`table`·`thead`·`tbody`·`tr`·`td`·`th`·`img`·`a`·`p`·`div`·`span`·`br`·`hr`·`h1`~`h6`·`ul`·`ol`·`li`·`b`·`strong`·`i`·`em`·`u`·`s`·`blockquote`·`pre`·`code`·`font`·`center`·`style`), 서식 속성(`style`·`align`·`valign`·`width`·`height`·`bgcolor`·`color`·`border`·`cellpadding`·`cellspacing`·`colspan`·`rowspan`·`href`·`src`·`alt`·`title`·`target`).
- 제거: `script`·`form`·`input`·`button`·`iframe`·`object`·`embed`·`frame`·`meta[http-equiv]`·`base`, 모든 `on*` 속성(D-000100).
- URL scheme: `href`는 `http`·`https`·`mailto`, `img src`는 `http`·`https`·`cid`. `javascript:`·`data:` 등은 속성째 제거.
- 꼬리말: HTML 끝에 `<hr>` + "이 메일은 SNUMPS 전체 공지로 재발송되었습니다. 수신 설정: <optOutUrl>", 텍스트 끝에 같은 문장. `optOutUrl`은 기존 공지와 같은 `${siteOrigin}/settings/notifications`.
- 텍스트 본문이 없으면 정화된 HTML에서 태그를 걷어 만듦(텍스트 전용 메일 프로그램용).

**compose.ts**

- `nodemailer/lib/mail-composer`로 조립. `from`은 지정하지 않음(Gmail이 발송 계정으로 채움, 현행과 같음). `replyTo` 미설정(D-000123). `to` 없음, `bcc: batch`, `subject`, `html`, `text`, `attachments`(내장 이미지는 `cid` 유지).
- `To: undisclosed-recipients:;`는 Gmail API가 400 `Invalid To header`로 거부함. Bcc만 있는 메일은 통과(사전 시험 2차, D-000143, fix `7187e91`).
- Bcc 헤더는 raw에 남겨야 Gmail API가 수신자로 씀(`keepBcc: true`). 다른 수신자에게 Bcc가 노출되지 않는지는 사전 시험에서 확인하지 못함(발송 계정이 @gmail.com이 아니어서 별칭 시험 불가). 테스트 전략 4에서 서로 다른 두 주소로 확인.
- 기록용 원 Message-ID는 새 메일 헤더에 넣지 않음. 새 메일은 자체 Message-ID를 가짐.

**client.ts `dispatchRaw`**

- `POST https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media`, `Content-Type: message/rfc822`, 본문 = raw MIME. 큰 메일을 JSON base64 본문 없이 보내기 위함.
- 실패 시 상태 코드와 Gmail 오류 사유(`reason`)를 담아 throw. 한도 초과(`rateLimitExceeded`·`dailyLimitExceeded`·`quotaExceeded`, 또는 429)는 별도 오류 종류(`GmailQuotaError`)로 구분.

**발송 기록 테이블 `mail-broadcasts`(D-000125)**

- 앱 테이블 레지스트리(`schemas/index.ts`의 `TABLES`)에 추가하는 JSONB 문서 테이블. 기존 테이블처럼 문서가 없으면 빈 목록으로 읽히므로 SQL 마이그레이션은 필요 없음. 구현 시 PGlite 시험으로 확인하고, 필요하면 마이그레이션을 추가.
- 행: `id`(ulid), `messageId`, `subject`, `sentBy`(관리자 이메일), `startedAt`, `finishedAt|null`, `recipientCount`, `batchesSent`, `batchesFailed`, `status`(`sending`|`sent`|`partial`|`failed`). 본문·수신자 주소는 저장하지 않음.
- 유일성: SQL UNIQUE가 아니라 `mutate` 안의 검사로 보장. `mutate`는 version-CAS 재시도라서, 같은 `messageId`가 이미 있으면(`failed` 제외) 선점 실패 처리. 동시 두 요청 중 하나만 선점함.

### 데이터 흐름

1. 화면에서 파일 선택. 클라이언트가 크기·확장자를 먼저 확인(편의일 뿐, 검사는 서버가 함) → 기존 `/api/uploads/presign`(`purpose=broadcast-eml`)으로 서명 URL 발급 → 브라우저가 staging에 직접 업로드.
2. `?/preview`(form action, 입력은 `s3Key`): `pending/broadcast-eml/` 접두 확인 → `stagedInfo`로 크기 ≤ 25MB 확인 → `readStaged` → parse → sanitize. 응답: 제목, 정화된 HTML(화면에서 `<iframe sandbox srcdoc>`로 표시, 스크립트 불가. 미리보기에서만 `cid:` 이미지를 `data:` URI로 바꿔 보여 줌, 발송본은 `cid` 유지), 첨부 목록(이름·크기·내장 여부), 수신자 수, 같은 `messageId`의 기존 기록.
3. `?/test`: 같은 파일로 조립해 요청한 관리자 본인 주소 1곳에만 발송. 기록은 남기지 않음.
4. `?/send`: 다시 읽기 → 해석 → 정화(미리보기 결과를 클라이언트에서 받지 않음) → `mutate`로 `sending` 행 선점 → 수신자 해석·주소 검사 → 80명 묶음마다 compose + `dispatchRaw` → 행 갱신(`sent`/`partial`/`failed`, 묶음 수, `finishedAt`) → `removeStaged`.
5. 화면 하단에 최근 발송 기록 20건 표시.

### 오류 처리(D-000128)

| 상황                                                | 처리                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| 해석 실패·25MB 초과·제목 없음·본문 없음·잘못된 경로 | 미리보기·발송 단계에서 거부, 사유 표시, 발송 없음                             |
| 같은 `messageId` 기록이 `sent`·`partial`·`sending`  | "이미 발송됨(일시·보낸 사람·상태)" 표시, 발송 버튼 비활성, 서버도 거부        |
| 같은 `messageId` 기록이 `failed`                    | 재발송 허용. 아무에게도 나가지 않았기 때문. 같은 행을 `sending`으로 다시 선점 |
| 일부 묶음 실패                                      | 남은 묶음은 계속 시도, `partial`, 성공·실패 묶음 수 표시. 자동 재시도 없음    |
| `GmailQuotaError`                                   | 남은 묶음 중단, `partial`(성공 0이면 `failed`)                                |
| 토큰 오류 등으로 첫 묶음 전에 실패                  | `failed`                                                                      |
| 주소 형식이 이상한 수신자                           | 빼고 발송, 제외 인원을 결과에 표시(기존 dispatch 규칙과 동일)                 |
| 함수 시간 초과 등으로 `sending`이 남음              | "결과 불명, Gmail 보낸편지함 확인" 표시, 재발송 차단. 정리는 수동             |
| staging 삭제 실패                                   | 로그만 남김. 7일 뒤 maintenance가 정리                                        |

- 발송 횟수 상한 없음(D-000110). 같은 메일 중복만 차단.
- Vercel 함수 실행 시간 한도는 미확인. 25MB 묶음 1개에 로컬 약 25초(사전 시험). 구현 계획에서 공식 한도와 수신 동의 회원 수(읽기 전용, 숫자만)로 `묶음 수 × 25초`를 계산하고, 넘으면 질문(D-000145).

## 코드 스타일

기존 메일 모듈 관례를 따름: 실패는 로그 + 결과 값으로 반환하고 throw로 본 흐름을 깨지 않음, 주석은 결정·감사 ID를 인용하는 한국어 설명, 공개 함수는 JSDoc.

```ts
/** 같은 메일은 한 번만 — `failed`만 다시 선점할 수 있다 (D-000110). */
export async function claimBroadcast(
  row: NewBroadcast,
): Promise<{ ok: true } | { ok: false; existing: MailBroadcast }> {
  let existing: MailBroadcast | undefined;
  await mutate("mail-broadcasts", (rows) => {
    existing = rows.find(
      (r) => r.messageId === row.messageId && r.status !== "failed",
    );
    if (existing) return rows;
    return [...rows.filter((r) => r.messageId !== row.messageId), row];
  });
  return existing ? { ok: false, existing } : { ok: true };
}
```

## 테스트 전략

| 단계                              | 대상                                                   | 방법                                                                                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 사전 시험(버리는 코드, `.tmp/`) | Gmail API 업로드 전송 한도, Bcc 비노출, 함수 실행 시간 | 완료(2026-10-17). 발송 계정 자신에게 Bcc만·업로드 전송으로 20MB 18.5초·25MB 24.7초 성공, 서식·cid·첨부 정상 표시(D-000144). `To: undisclosed-recipients:;`는 거부(D-000143). Bcc 비노출은 4단계로 넘김                 |
| 1 단위(vitest)                    | parse·sanitize·compose                                 | 고정 `.eml`: Gmail 전달본, cid 이미지, 첨부, Message-ID 없음, 깨진 파일 / `script`·`on*`·`javascript:`·`form`·`iframe` 제거, 인라인 스타일·표 유지 / Bcc 헤더, multipart 구조(`mixed`>`related`>`alternative`), 꼬리말 |
| 2 action                          | `/admin/mail/broadcast`                                | 비관리자 거부, 경로 접두 위반 거부, 크기 상한, 중복 차단, `failed` 재발송 허용, 동시 두 발송 중 하나만 선점, `partial`·`failed` 기록, `GmailQuotaError` 중단. Gmail은 `fetch` mock                                     |
| 3 데이터                          | `mail-broadcasts` 테이블                               | PGlite에서 빈 문서 읽기·쓰기, `expect-tables-valid` 통과                                                                                                                                                               |
| 4 실제 환경                       | dev 서버 + 브라우저                                    | 업로드 → 미리보기 → 내게 시험 발송 → Gmail 웹에서 모양 확인(스크린샷), before/after 비교. 서로 다른 두 주소에 Bcc 발송해 서로 보이지 않는지 확인                                                                       |
| 전체                              |                                                        | `pnpm test`·`pnpm lint`·`pnpm check` 통과                                                                                                                                                                              |

- coverage 수치 목표는 두지 않음. 위 시나리오를 빠짐없이 덮는 것이 기준.

## 경계

- Always: 발송 전 서버에서 다시 해석·정화. 모든 전체 발송은 Bcc. 기록 선점 후 발송. 실제 회원 발송은 사용자가 직접 실행.
- Ask first: 25MB 상한 변경, 실행 시간 한도 대응(분할 실행 등), SQL 마이그레이션 추가, 위 표 밖의 의존성, prod 대상 시험 발송.
- Never: 수신자 주소·본문을 기록·로그에 저장, 클라이언트가 보낸 HTML로 발송, 자동 재시도, prod 회원에게 시험 발송.

## 성공 기준

- 고정 `.eml` 5종이 단위 시험에서 기대한 제목·본문·첨부·cid로 해석되고, 위험 요소 시험이 모두 제거를 확인.
- 같은 `.eml`을 두 번 발송 요청하면 두 번째가 거부되고, 동시 요청 시험에서 Gmail 호출이 한 번의 발송분만 일어남.
- dev 실제 환경에서 HTML·내장 이미지·첨부가 있는 메일을 시험 발송하면 Gmail 웹에서 원본과 같은 구성으로 보이고, 받은 메일 헤더에 다른 Bcc 수신자가 없음.
- `pnpm test`·`pnpm lint`·`pnpm check`가 실패 0으로 끝남.

## Open Questions

- 함수 실행 시간: 구현 계획에서 Vercel 공식 한도와 수신 동의 회원 수로 계산, 넘으면 질문(D-000145).
- 관리자 메뉴에서 이 화면으로 가는 진입점: `/admin/mail` 화면 상단 링크로 둘 예정. 위치는 구현 계획 검토 때 확인.
