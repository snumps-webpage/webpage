# `src/lib/domain/public-content.ts` (156줄)

**접두사 `LC13-`** · 공개 아카이브 스냅샷의 레코드 타입(세미나·스터디·활동·갤러리·프로젝트)과, 목록 페이지가 쓰는 색인 항목 투영·검색 필터·학기 표기.

## LC13-1 🟠 저장된 프로젝트 URL을 검사 없이 공개 페이지의 `href`로 넘긴다

> **검증 정정**: 인용 행만 고친다 — `startsWith("http")` 판정은 `PublicIndexList.svelte`의 46행이 아니라 **44-45행**이다.
> 인과와 등급은 확인했다. Svelte 5.56.10은 `href`를 런타임에 거르지 않는다 — 컴파일러의 `regex_js_prefix`(`compiler/phases/patterns.js:26`)는
> 정적 a11y 경고(`2-analyze/.../a11y/index.js:407`)에만 쓰인다. `svelte.config.js`·`hooks.server.ts`에 CSP도 없어 `javascript:` 이동을 막는 층이 없다.
> 덧붙임: 입력 refine은 `/^https?:\/\//i`(대소문자 무시)인데 렌더러의 `startsWith("http")`는 대소문자를 가리므로 `HTTPS://…`는 폼을 통과하고
> 같은 탭·`rel` 없이 열린다 — 처방의 투영 필터가 스킴을 소문자로 판정하면 함께 풀린다.

154행 `href: project.url ?? undefined`. 소비자 `PublicIndexList.svelte:41-47`은 이것을 그대로 `<a href={item.href}>`로 그린다.
`/archive/projects`는 **무인증 공개 페이지**다.

"http(s) 주소"라는 성질은 관리자 입력 스키마에만 있다 — `domain/members.ts:126-135`의 refine("Rendered as a public link:
http(s) only, never javascript: and friends"). 저장 스키마는 `project: z.object({ title: z.string(), url: z.string().optional() })`
(`schemas/member.ts:36-38`)라 아무 문자열이나 통과하고, 스냅샷 생산자(`archive/+layout.server.ts:206`)도 그대로 옮긴다.
Svelte는 `href`의 스킴을 거르지 않는다. 입력 폼을 거치지 않는 쓰기(운영 스크립트, 이주, 향후 경로)가 `javascript:` 값을 남기면
클릭한 방문자의 세션으로 이 오리진에서 스크립트가 돈다. 스킴 없는 값(`example.com`)은 `/archive/example.com` 상대 링크가 되고,
46행의 `startsWith("http")` 판정에서도 빠져 같은 탭에서 404로 간다.

"관리자 폼이 막는다"는 감면 근거가 아니다 — 폼은 쓰기 경로 **하나**의 검사이고, 이 투영은 저장된 **모든** 행을 링크로 만든다.
`LA29-7`(관리자 화면의 `attachmentUrl`)과 같은 메커니즘이고, 여기는 싱크가 공개 존이라 결과가 더 크다.

처방: 투영에서 `https?:`가 아닌 값은 `href`를 두지 않는다(154행 한 줄) — 이 파일만 바뀐다. 근본은 저장 스키마에 같은 refine을
두는 것(`member.ts:37`) — 저장된 행 실측 후 **동작 변경**.

## LC13-2 🟡 같은 학기 안의 세미나를 시각이 아니라 문자열로 정렬한다

110행 `(b.scheduledAt ?? "").localeCompare(a.scheduledAt ?? "", "ko-KR")`. `scheduledAt`은 instant다 —
생산자는 `s.schedule?.startsAt` 또는 활동의 `date.start`를 넣는다(`archive/+layout.server.ts:130-132`). 둘 다 `DateTime`
(`schemas/common.ts:13`, `offset: true`)이라 **오프셋은 아무것이나** 허용된다("stored with the KST offset"은 주석일 뿐 게이트가 아니다).

오프셋이 섞이면 문자열 순서와 시간 순서가 갈린다: `"2025-03-02T10:00:00Z"`(19:00 KST)는 `"2025-03-02T18:00:00+09:00"`보다
**늦은** 시각인데 문자열로는 앞이다(실측). 같은 저장소가 이미 이 문제를 결함으로 다룬 선례가 있다 — `admin-queue-views.ts`의
`byCreatedAtAsc`는 `Date.parse`로 비교하고 `queue-order.test.ts`가 `+09:00`/`+00:00` 역전을 고정한다.
`"ko-KR"` 대조(collation)도 기계 문자열에 쓸 도구가 아니다.

99-105행 주석이 고친 것(키 섞기 → 비전이성)은 옳다. 남은 것은 두 번째 키의 **비교 방법**이다.

처방: `Date.parse` 값으로 비교하고 `null`은 지금처럼 뒤로. 저장값이 모두 `+09:00`이면 결과가 같다 — **현행 데이터 기준 구조 변경**.

## LC13-3 🟡 레코드 타입이 스냅샷 페이로드의 계약이 아니다 — 읽히지 않는 필드를 선언하고, 선언하지 않은 필드가 실려 나간다

| 필드                                        | 생산자 (`archive/+layout.server.ts`)     | 소비자                                                 |
| ------------------------------------------- | ---------------------------------------- | ------------------------------------------------------ |
| `PublicSeminarRecord.durationMinutes` (17)  | 124행 **항상 `null`**                    | 없음                                                   |
| `PublicSeminarRecord.files` (21)            | 137행 `s.materials.map(fileReference)`   | 없음 — 상세 페이지는 자기 로드에서 다시 만든다(LC13-4) |
| `PublicStudyRecord.files` (31)              | 149행 **항상 `[]`**                      | 없음                                                   |
| `PublicFileReference.kind`의 `"slides"` (8) | 생산하는 곳 없음(`pdf`·`image`·`link`만) | —                                                      |
| (선언 없음) `startTimeKnown`                | 133행이 **실어 보낸다**                  | 없음 — 상세 페이지는 자기 로드의 값을 읽는다           |

`startTimeKnown`이 타입 검사를 통과하는 이유는 `.map`의 결과 타입이 콜백 반환값에서 추론된 뒤 구조적으로 대입되어 초과 속성 검사가 걸리지 않기 때문이다(`svelte-check` 0 errors가 그 실측이다).
즉 `archive: PublicArchiveSnapshot` 주석(111행)은 "이 모양만 나간다"를 보장하지 않는다.

> **검증 정정**: 결과 (1)을 좁힌다. 스냅샷의 `files`는 `publicationStatus === "published"`인 세미나(`+layout.server.ts:99-101`)의
> 자료뿐이고, 그 키는 `resolveAssetAccess`가 게스트에게 `"public"`으로 내주며(`asset-access.test.ts:50-66`) 상세 페이지가 어차피 그린다.
> 즉 **공개되지 않을 것이 새는 것은 아니다** — 결과는 아무도 읽지 않는 페이로드가 모든 `/archive` 응답에 실린다는 것과 타입이 계약이 아니라는 것(2)이다.
> 🟡 유지.

결과 둘. (1) 이 레이아웃의 반환값은 `/archive` 하위 모든 페이지의 SSR HTML·`__data.json`에 통째로 직렬화된다
(`ZR-8`의 교훈 — "렌더하지 않는다"는 "게시하지 않는다"가 아니다). 아무도 읽지 않는 `files`가 모든 세미나의 저장 키·URL을
모든 아카이브 방문자에게 보낸다(`ZR-10`의 `id: s3Key`가 여기 실린다). (2) 타입만 보고 새 화면을 만드는 사람은
`durationMinutes`·스터디 `files`가 채워진다고 믿는다.

처방: 읽히지 않는 필드를 타입과 생산자에서 함께 지우고(`"slides"` 포함), 생산자를 `satisfies PublicSeminarRecord`로 묶어
초과 필드를 컴파일 오류로 만든다. 페이로드가 줄어드는 것 외에 화면 변화 없음 — **구조 변경**.

## LC13-4 🟡 세미나 공개 투영이 두 벌이고 이미 갈라졌다 — 타입은 여기 있는데 규칙은 여기 없다

`PublicSeminarRecord`·`PublicFileReference`의 모양은 이 파일이 정하지만, 그 값을 만드는 규칙은 라우트 두 곳에 따로 있다.

| 규칙           | 목록용 스냅샷 `archive/+layout.server.ts`    | 상세 `archive/seminars/[id]/+page.server.ts`·`+page.svelte`                            |
| -------------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| 설명           | 122행 `s.description \|\| s.note`            | `+page.server.ts:36` `seminar.description \|\| request?.description \|\| seminar.note` |
| 파일 종류 판정 | 25-39행 `IMAGE_EXTENSIONS` + `fileReference` | `+page.svelte:15-29` 확장자 목록을 인라인으로 다시 씀                                  |
| 일정           | 130-133행                                    | `+page.server.ts:40,43` — 같은 식                                                      |

설명 규칙이 다르다: 자기 설명이 비어 있고 신청서에 설명이 있는 세미나는 **목록 카드에는 비고(또는 빈칸), 상세에는 신청서 설명**이
나간다. 파일 종류 판정은 지금 같은 결과지만 확장자 목록이 두 벌이라 하나만 고치면 목록과 상세가 같은 파일을 다른 종류로 부른다.

처방: 순수 규칙(설명 우선순위, 확장자 → `kind`)을 이 브라우저 안전 모듈로 옮겨 두 생산자가 쓴다. 설명 규칙을 하나로 정하는 것은
목록 카드의 문구가 바뀌는 **동작 변경**, 파일 판정 통합은 **구조 변경**.

## LC13-5 🟡 `PublicProjectRecord.memberId`는 회원 id가 아니다 — 이름이 막으려는 누설을 초대한다

53행 `memberId: string`. 생산자는 일부러 회원 id를 넣지 **않는다** — `archive/+layout.server.ts:201-202`
"Opaque list key — member row ids stay out of public payloads (D2)", 값은 `` `project-${index}` ``.
149행도 이것을 `id`(목록 키)로만 쓴다.

필드 이름이 값의 뜻과 반대라서, 이 타입을 채우는 새 생산자(예: 프로젝트 상세 페이지)는 이름대로 `m.id`를 넣게 된다 —
D2가 막으려는 바로 그 누설이다. 레이아웃 주석은 그 파일에만 있고 타입에는 없다.

처방: `key`(또는 `listKey`)로 이름을 바꾸고 D2 주석을 타입으로 옮긴다. **구조 변경**. 키의 불안정성은 `ZR-11`이 따로 다룬다.

## LC13-6 🟡 학기 표기 함수 셋 중 하나 (`LC17-1` 참조)

77-84행 `formatArchiveTerm`은 `domain/term.ts:41-44` `termLabel`, 회장단 페이지의 지역 `termLabel`과 같은 일을 하고,
방학 학기를 `"여름학기"`로 부른다(다른 둘은 `"S학기"`, `"여름"`). 셋 중 **형식 밖 입력을 안전하게 다루는 것은 이것뿐**이라
통합의 기준으로 삼을 쪽이다. 78행 정규식은 `SEMESTER_PATTERN`의 캡처 사본 — `LA06-1`·`LC03-2`가 이미 셌다.

## 확인했고 지적하지 않은 것

- **`seminarIndexItems`의 단일 키 정렬(106-111행)** — 학기 먼저, 같은 학기 안에서 날짜. 키를 섞던 예전 비교자의 비전이성을
  `public-content.test.ts:40-91`이 입력 순서 세 가지와 같은 학기 안의 날짜 순서로 고정한다. 비교 **방법**만 LC13-2
- **스냅샷 생산자가 이미 학기로 정렬한 배열을 여기서 다시 정렬한다** (`+layout.server.ts:113,141` vs 107·130행) — 중복 정렬은
  레이아웃 쪽의 불필요한 코드다. 여기의 정렬이 화면 순서를 정하는 쪽이라 이 파일의 결함이 아니다
- **`filterPublicIndex`(86-94행)** — 제목·학기 표기·설명·메타데이터를 `ko-KR` 소문자화 후 부분 일치. 빈 질의는 원본을 돌려준다. 맞다
- **`"장소 기록 없음"`·`"교재 기록 없음"`(120·138행)이 메타데이터 = 검색 대상에 들어간다** — "없음"으로 검색하면 기록 없는
  항목이 나온다. 표시 문구가 그 사실을 말하는 것이라 오답이 아니다
- **빈 메타데이터 문자열**(선수지식 `""` 등) — 소비자가 `filter(Boolean)`으로 거르고 인덱스 키를 쓴다(`PublicIndexList.svelte:54-61`)
- **세미나 `href`의 `encodeURIComponent`(122행)** — 맞다. 스터디에 `href`가 없는 것은 상세 라우트가 없기 때문이다(`archive/studies/`에 `[id]` 없음)
- **`PublicGalleryRecord.date`의 `null` 계약(45행)** — 1970 폴백을 없앤 결정(`ZR-4`, `core/semester.ts:46-51`)과 일치한다

## 검증 (2026-09-28)

- LC13-1 — 정정 (인용 행 46 → 44-45, 등급 🟠 유지. Svelte 런타임 무필터·CSP 부재 실측)
- LC13-2 — 확인 (`"…10:00:00Z"` vs `"…18:00:00+09:00"` 역전 성립, `queue-order.test.ts:30-31` 선례 존재)
- LC13-3 — 정정 (결과 (1)의 "저장 키·URL을 보낸다"를 공개 세미나의 공개 자료로 좁힘 — 누설이 아니라 죽은 페이로드. 🟡 유지)
- LC13-4 — 확인 (`+page.server.ts:36` 설명 규칙, `+page.svelte:15-29` 확장자 사본)
- LC13-5 — 확인
- LC13-6 — 확인 (`LC17-1`과 같은 결함의 참조 항목 — 한 번만 센다)
- 누락 점검: 투영 함수 넷·타입 여섯을 원문만으로 다시 읽었다. `"slides"`가 `admin-records.ts:7` `AdminContentFile`로도 흘러가지만 그쪽 생산자(`upload-validation.ts:23-28`)도 `pdf`·`image`만 낸다 — LC13-3의 처방 범위 안이다. 추가 없음
