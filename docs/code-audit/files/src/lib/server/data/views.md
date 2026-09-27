# `src/lib/server/data/views.ts` (50줄)

**접두사 `LA36-`** · 클라이언트로 나가는 레코드 투영(세미나 신청·스터디 신청·가입 신청) — 원시 행을 반환하지 않고, 레거시 필드명(`speakerIds`/`submittedAt`)을 한곳에 둔다.

## LA36-1 🟠 "모든 경계가 이것을 쓰므로 스프레드로 새지 않는다"는 약속이 깨져 있다 — 가입 신청 수정 페이지

> **검증 정정**: 인용 행번호와 누출 범위를 정확히 한다(등급 🟠 유지).
> (1) `ApplicationSchema`는 `schemas/application.ts:9-19`다(문서의 `:71-81`은 존재하지 않는 행 — 파일은 21줄).
> (2) 지금 브라우저로 가는 필드를 전수 대조했다. 스프레드 페이로드는 `id, name, email, phone, department, studentId,
background, createdAt` + `accepted, submittedAt`. 투영(`applicationView`)과의 차이는 **`createdAt` 하나**이고, 그 값은
> `submittedAt`과 같다. PII 필드(`email`·`phone`·`studentId`·`background`)는 투영에도 전부 있다 — 소비자가 신청자 본인이라
> 투영이 **떨어뜨리려던 PII는 현재 없다.** 즉 오늘 새는 것은 없다.
> (3) 새는 경로의 조건도 좁힌다: `getTable`은 행을 `decode(schema, …)`(`tables.ts:106`)로 zod 파싱하고 `z.object`는
> 모르는 키를 **벗긴다.** 그래서 저장 문서에 끼어든 임의 키는 스프레드로도 새지 않는다. 새는 것은 **`ApplicationSchema`에
> 추가된 필드**뿐이다 — 문서 본문의 서술("스키마에 필드가 추가되면")이 정확히 그 조건이다.
> 등급은 유지한다: 모듈 주석(4-8)이 막겠다고 한 것이 바로 "아직 없는 필드의 스프레드 누출"이고, 부모 레이아웃의 투영을
> 자식이 원시 행으로 **덮어쓰는** 구조는 오늘의 필드 목록과 무관하게 틀렸다(판정 기준: "오염을 일으키는 호출부가 현재 없다"는
> 순환 논증).

4-8행이 약속한다: _"every route boundary uses these, so … internal fields can never leak by spread (review M8)."_

`(applicant)/signup/edit/+page.server.ts:23-27`은 이 투영을 쓰지 않고 **원시 행을 스프레드**한다:

```ts
application: {
  ...application,
  accepted: false,
  submittedAt: application.createdAt,
},
```

- `accepted`·`submittedAt`은 47-48행의 **손 복사**다
- 스프레드이므로 `ApplicationSchema`에 필드가 추가되면(검토 메모, 내부 플래그 등) 그 필드가 **신청자 본인의 브라우저로
  직렬화된다.** 컴포넌트가 읽든 말든 서버 로드 반환값은 SSR HTML에 통째로 실린다(`ZR-8`)
- 이 페이지의 `application` 키는 부모 레이아웃이 투영해 준 같은 키(`(applicant)/+layout.server.ts:16`
  `applicationView(application)`)를 **덮어쓴다** — 레이아웃은 규칙을 지키는데 자식이 그 결과를 원시 행으로 교체한다

지금의 `ApplicationSchema`(`schemas/application.ts:71-81`)에는 신청자 본인이 못 볼 필드가 없다. 그러나 README 판정 기준대로
"오염을 일으키는 필드가 아직 없다"는 감면 근거가 아니다 — 이 모듈이 막겠다고 한 것이 정확히 그 _아직 없는_ 필드다.

**고침**: `application: applicationView(application)`. 페이지가 읽는 필드는 `id`·`phone`·`studentId`·`background`뿐이다
(`signup/edit/+page.svelte:65-76,103`) — 전부 투영에 있다. 페이로드에서 `createdAt`이 빠지는 것 외에 화면 변화 없음.
엄밀히는 **동작 변경**(페이로드 축소)이나 회귀 위험은 낮다.

## LA36-2 🟡 `seminarRequestView`가 `closedAs`를 싣지 않아, 표시 상태 규칙이 호출자에 산다

`closedAs`(`schemas/seminar-request.ts:35-42`)는 "그 신청이 된 세미나가 취소·삭제됐다"를 남기는 필드다. 이 투영은 그것을
빼고 `status`(20)만 싣는다. 그래서 회원 대시보드가 투영을 스프레드한 뒤 `status`를 **덮어써서** "취소됨"을 만든다
(`(public)/+page.server.ts:325-345` — `r.closedAs || cancelledRequestIds.has(r.id) ? "cancelled" : r.status`).

같은 신청의 클라이언트 모양이 두 곳에서 결정된다. 신청 상태를 보여 주는 두 번째 소비자가 생기면 삭제된 세미나의
신청을 "승인됨"으로 보여 준다. (취소된 세미나 판정에는 `seminars` 표가 필요하므로 투영 안으로 전부 옮길 수는 없지만,
`closedAs` 쪽 절반은 행 하나로 판정된다.)

**고침**: `closedAs`를 싣거나, `displayStatus(r, cancelledIds)`를 이 모듈에 두고 대시보드가 부른다. 구조만 바뀐다.

## LA36-3 🟡 읽는 곳이 없는 필드와 낡은 주석

- `accepted: false`(47) — 소비자가 **없다**(`grep accepted` → `(applicant)` 화면 0건, `signup/edit` 서버가 같은 상수를 또 쓸 뿐).
  "테이블에 미처리 행만 있다"는 불변식을 담은 상수인데, 그 불변식은 `admin-queue-views.ts:58-62`에도 따로 적혀 있다
- 6행이 레거시 이름으로 `notionPageId`를 든다 — 이 파일의 어느 투영도 그것을 내보내지 않는다. 그 이름은
  `(admin)/admin/events/connect/+page.server.ts:41`의 폼 필드 대체 키로만 남아 있다

구조만 바뀐다.

## 확인했고 지적하지 않은 것

- **`submittedAt`으로의 개명(22, 34, 48)** — 레거시 UI 이름. 그러나 이 이름이 값이 offset 포함 ISO라는 사실을 가린다 —
  `(member)/study/apply/+page.server.ts:23`이 `b.submittedAt.localeCompare(a.submittedAt)`로 **문자열 정렬**한다.
  `admin-queue-views.ts:66-77`(`byCreatedAtAsc`)이 금지 사유로 적은 바로 그 비교다. 결함은 호출자에 있으므로 여기서는
  기록만 한다 — 그 파일의 리뷰가 받아야 한다
- **`kind`(19)** — 커밋 `a877404`가 넣었다. 저장값 그대로다. (관리자 투영은 넣지 않았다 — `LA29-1`)
- **`attachment`를 `attachmentUrl`로 바꾸지 않음(17)** — 도메인 폼 파서가 `attachment`를 받는다(`domain/seminars.ts:169`). 일관적이다
- **`applicationView`가 PII를 싣는다** — 소비자가 신청자 본인이다(`(applicant)` 존). 관리자 폴링의 죽은 `applications:` 키가
  이 투영을 실어 보내던 문제는 `QA-5`/`XC-9`가 다뤘다
- **세 투영 모두 명시적 필드 선택** — 스프레드 없이 필드를 나열한다. 파일 자체는 자기 약속을 지킨다

## 검증 (2026-09-28)

- LA36-1 — 정정(행번호 `:71-81`→`:9-19`; 현재 초과 필드는 `createdAt` 하나로 PII 누출 없음, zod strip으로 누출 조건은
  "스키마에 추가된 필드"로 한정; 등급 🟠 유지)
- LA36-2 — 확인(`(public)/+page.server.ts:325-345`의 `status` 덮어쓰기)
- LA36-3 — 확인(`accepted` 소비자 0건, `notionPageId`는 `admin/events/connect/+page.server.ts:41` 폼 키뿐)
- 누락 점검: 세 투영의 경계 사용처 전수(`seminarRequestView` 2곳, `studyRequestView` 1곳, `applicationView` 1곳 + 우회 1곳
  `signup/edit`)와 `seminar-requests`·`study-requests`·`applications`를 직접 읽는 라우트를 훑었다. 추가 없음
  (`archive/seminars/[id]`의 원시 **세미나** 행 스프레드는 이 모듈의 범위 밖이다).
