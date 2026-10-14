# 세미나 기록 보강 구현 계획 (영상 필드 · 승인 시각 3건 보정 · 노션 본문 보강)

**목표:** 세미나에 영상 링크 목록을 두고, 승인 시각이 일정으로 박힌 3건과 노션 본문에만 있던 영상·선수지식·소요시간을 운영자가 안전하게 바로잡을 수 있게 한다.
**구조:** 저장은 기존 JSONB 문서 저장소의 `seminars` 행에 `videos` 배열을 더하는 것. 저장 행은 스키마 기본값에 기대면 안 되므로(expect-tables-valid.ts) 마이그레이션 `20261014000000_seminar_videos.sql`이 기존 행에 `videos: []`를 쓰고 승인 흐름이 새 행에 쓰게 한다. release-prod.sh의 EXPECTED_MIGRATIONS·BACKFILLS·확인 쿼리에 반영(D-000017). 기록 수정 흐름은 patch 병합이라 그대로. 운영 스크립트 둘은 `ops-add-member`와 같은 모양: 순수 함수·SQL 생성은 `lib-*.mjs`(PGlite 테스트), 대화형 CLI는 Supabase CLI 로그인으로 `db query --linked --project-ref`. 둘 다 미리보기 기본, 적용은 ref 입력 확인 후, 메일 없음.
**기술 스택:** SvelteKit 2 / Svelte 5 / zod v3(schema)·v4(domain) / vitest + PGlite / Supabase CLI / Notion REST API(읽기 전용)
**결정:** snumps-webpage/D-000002, D-000003, D-000007, D-000009~D-000012, D-000015, D-000017

## 전역 제약

- 개인정보(이름·이메일·전화·학번)를 스크립트·테스트 출력에 찍지 않는다. 세미나 제목은 공개 정보라 표시 가능.
- 운영 DB 쓰기는 사용자가 스크립트로 실행한다. Claude는 dev·PGlite까지만 실행.
- 메일을 보내는 서비스 계층을 스크립트가 거치지 않는다(SQL 흐름 직접 호출).
- 영상 URL은 `https://`만, 2,048자 이하. 제목은 80자 이하, 비어도 됨. 세미나당 최대 10개.
- 새 동작은 기존 화면·데이터를 바꾸지 않는다: `videos`가 없는 행은 빈 목록으로 읽는다.
- 커밋은 게이트(vitest·svelte-check·eslint·prettier, 필요 시 build) 통과 후.

## 위험

| 위험                                                           | 영향 | 완화                                                                                                                         |
| -------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| 배포 중 옛 코드가 `seminars` 표를 다시 쓰며 `videos` 키를 지움 | 중   | 보강 스크립트는 배포 뒤 실행(사용자 안내), 스크립트가 적용 후 재조회로 확인                                                  |
| `flow_update_seminar_record`에는 zod 관문이 없음               | 상   | 스크립트·서비스가 `SeminarSchema.partial()`과 같은 규칙으로 먼저 검증(서비스는 기존대로)                                     |
| 노션 제목+학기 짝짓기 실패·중복                                | 중   | 중복·불일치는 건드리지 않고 보고만(기존 백필 규칙)                                                                           |
| 3건 검출 규칙이 다른 행을 잡음                                 | 상   | 규칙을 좁게(신청 경유 + published + schedule null + 활동·이벤트 시각 동일) 하고 미리보기에 제목·현재 시각을 보여 사람이 확인 |

## Open Questions

없음 — 위 결정으로 확정. 수치(10개·80자·2,048자)는 기존 입력 규칙(외부 첨부 URL 2,048자)과 노션 원본(쪽당 최대 3개)에 맞춘 상한.

## 파일 구조

| 파일                                                                                         | 책임                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/data/schemas/seminar.ts`                                                     | `SeminarVideo`, `SeminarSchema.videos` (기본 `[]`)                                                                                                                                             |
| `supabase/migrations/20261014000000_seminar_videos.sql` (신규)                               | 기존 행 `videos: []` 백필(재실행 안전), 승인 흐름이 `videos: []`를 씀                                                                                                                          |
| `scripts/ops/release-prod.sh`                                                                | EXPECTED_MIGRATIONS·BACKFILLS에 새 마이그레이션, 확인 쿼리 `sem_no_videos = 0`                                                                                                                 |
| `src/lib/domain/seminar-videos.ts` (신규)                                                    | 폼 → 영상 목록 파싱·검증(클라이언트·서버 공용 규칙)                                                                                                                                            |
| `src/lib/server/services/records-admin.ts`                                                   | create/update가 `videos`를 받음                                                                                                                                                                |
| `src/routes/(admin)/admin/seminars/+page.server.ts`                                          | 폼의 영상 행을 파싱해 서비스로, load가 `videos` 제공                                                                                                                                           |
| `src/lib/components/admin/AdminSeminarRecordEditor.svelte`                                   | 영상 행 추가·삭제 UI                                                                                                                                                                           |
| `src/lib/server/public/archive.ts`, `src/routes/(public)/archive/seminars/[id]/+page.svelte` | 공개 상세에 영상 목록                                                                                                                                                                          |
| `scripts/ops/lib-fix-approval-dates.mjs` (신규)                                              | 대상 검출 SQL, 입력 → schedule, 적용 SQL                                                                                                                                                       |
| `scripts/ops/ops-fix-approval-dates.mjs` (신규)                                              | 대화형 CLI                                                                                                                                                                                     |
| `scripts/ops/lib-notion-body.mjs` (신규)                                                     | 노션 블록 → 후보(영상·선수지식·소요시간), 적용 SQL                                                                                                                                             |
| `scripts/ops/ops-notion-backfill-body.mjs` (신규)                                            | 노션 읽기 + 후보 하나씩 채택 CLI                                                                                                                                                               |
| 테스트                                                                                       | `src/lib/domain/seminar-videos.test.ts`, `src/lib/server/services/seminar-videos.test.ts`, `src/lib/server/data/ops-fix-approval-dates.test.ts`, `src/lib/server/data/ops-notion-body.test.ts` |

## Tasks

### Task 1: 영상 필드 저장·검증·관리자 액션 (backend slice)

**파일:** 수정 `schemas/seminar.ts`, `services/records-admin.ts`, `admin/seminars/+page.server.ts` / 생성 `domain/seminar-videos.ts` / 테스트 `domain/seminar-videos.test.ts`, `services/seminar-videos.test.ts`
**Interfaces 제공:**

- `SeminarVideoSchema = z.object({ url: z.string().url().startsWith("https://").max(2048), title: z.string().max(80) })`, `SeminarSchema.videos: z.array(SeminarVideoSchema).max(10).default([])`
- `parseSeminarVideosForm(fd: FormData): {success:true,data:{url,title}[]} | {success:false, issue:string}` — `videoUrl`/`videoTitle`를 `getAll`로 짝지어 읽고, URL·제목이 모두 빈 행은 버림, 보이지 않는 문자 제거·trim
  **Acceptance criteria:**
- [ ] `videos`가 없는 저장 행은 `[]`로 읽힌다
- [ ] 관리자 update/create가 영상 목록을 저장하고, 폼에 영상 칸이 없으면(`videosSent` 표식 없음) 기존 값을 건드리지 않는다
- [ ] http·잘못된 URL·81자 제목·11개는 400 VALIDATION_FAILED, 아무것도 쓰지 않음
      **의존:** 없음 **크기:** M
- [ ] 실패 테스트: 파서(빈 행 무시, https만, 개수·길이), 서비스 왕복(updateSeminar → getTable), 액션(update 폼 → 저장 / 표식 없으면 유지 / 잘못된 값 400)
- [ ] 실패 확인 → 최소 구현 → 통과 확인

### Task 2: 영상 편집 UI와 공개 상세 표시

**파일:** 수정 `AdminSeminarRecordEditor.svelte`, admin load, `public/archive.ts`(getPublicSeminar에 `videos`), `archive/seminars/[id]/+page.svelte`
**Acceptance criteria:**

- [ ] 편집기에 기존 영상 행이 채워져 나오고 행 추가·삭제 가능, 폼에 `videosSent=1` 표식
- [ ] 공개 상세에 영상이 있으면 "영상" 항목으로 링크 목록(제목 없으면 "영상 N"), `rel="noopener noreferrer"`, 새 탭
- [ ] BE-64 공개 응답 감사 통과(새 금지 키 없음)
      **의존:** Task 1 **크기:** S
- [ ] 실패 테스트: getPublicSeminar가 `videos`를 싣는다
- [ ] 구현 → 통과, 실측 서버·브라우저로 편집→저장→공개 상세 확인(1280·390px)

### Checkpoint: Task 1~2 이후

- [ ] 전체 테스트·svelte-check·eslint·prettier·build 통과
- [ ] 브라우저 실측: 편집기에서 영상 2개 저장 → 상세에 2개

### Task 3: 승인 시각 3건 보정 스크립트

**파일:** 생성 `scripts/ops/lib-fix-approval-dates.mjs`, `scripts/ops/ops-fix-approval-dates.mjs` / 테스트 `src/lib/server/data/ops-fix-approval-dates.test.ts`
**Interfaces 제공:**

- `targetsSql()` → 행: `{ id, title, activityId, wrongStart }` — 조건: `sourceRequestId` 있음, `publicationStatus='published'`, `schedule` null, 연결 활동의 `date.start` = 그 세미나 출석 이벤트의 `date.start`
- `scheduleFrom({ date: "YYYY-MM-DD", start: "HH:MM"|"", end: "HH:MM"|"", location })` → `{ startsAt, startTime, endsAt, location }` (KST, 시작 빈칸이면 `startTime:null`·자정·종료 무시, 종료는 시작보다 뒤)
- `applySql(id, schedule, now)` → `select flow_update_seminar_schedule(<jsonb>)` (입력은 base64 jsonb로)
  **Acceptance criteria:**
- [ ] 검출은 그 조건의 행만(이주분·일정 있는 행·미공개 행 제외)
- [ ] 적용 후 세미나 schedule·활동 date·이벤트 date가 입력값, 다른 세미나·활동·이벤트는 그대로
- [ ] 잘못된 날짜·시각·장소 빈칸은 입력 단계에서 다시 묻고 SQL을 만들지 않음
- [ ] CLI: `--target dev|prod`(기본 dev), `--dry-run`, 세미나마다 입력 → 전체 미리보기 → prod면 ref 입력 확인 → 적용 → 재조회 출력
      **의존:** 없음 **크기:** M
- [ ] 실패 테스트(PGlite, 같은 마이그레이션): 위 기준 → 구현 → 통과

### Task 4: 노션 본문 보강 스크립트 (영상·선수지식·소요시간)

**파일:** 생성 `scripts/ops/lib-notion-body.mjs`, `scripts/ops/ops-notion-backfill-body.mjs` / 테스트 `src/lib/server/data/ops-notion-body.test.ts`
**Interfaces 제공:**

- `candidatesFrom(blocks: {type,text,links:{href,text}[]}[])` → `{ videos:{url,title}[], prerequisites:{value,kind:"label"|"sentence"}[], duration:{minutes:number|null,text,kind}[] }`
  - 영상: 본문 텍스트·href의 YouTube URL(중복 제거), 제목 후보는 링크 글자가 URL과 다를 때 그 글자
  - `선수 지식: 값` → kind label, 문장 속 표기는 그 문장(kind sentence)
  - 소요시간: 문장에서 `N분`/`N시간` → 분, 실패면 null
- `patchSql(id, patch)` → `flow_update_seminar_record` 호출(빈 칸만: 이미 값이 있는 필드는 patch에서 제외 — 적용 직전 재조회로 확인)
  **Acceptance criteria:**
- [ ] 제목+학기로 짝짓기, 중복·불일치는 보고만
- [ ] 후보마다 채택(y)·수정(e)·건너뜀(n), 수정값은 Task 1 규칙으로 검증
- [ ] 이미 값이 있는 필드는 후보로 내지 않음
- [ ] 노션은 읽기만, 메일 없음, 미리보기 기본·ref 확인
      **의존:** Task 1(영상 저장 규칙) **크기:** M
- [ ] 실패 테스트: 후보 추출(블록 픽스처), patch 적용(PGlite) → 구현 → 통과

### Checkpoint: Task 3~4 이후

- [ ] 전체 게이트 통과, dev 대상 `--dry-run` 실행으로 출력 확인(운영 DB는 사용자)
