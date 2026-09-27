# `src/lib/server/data/schemas/study.ts` (37줄)

**접두사 `LA28-`** · `studies` 테이블 행 스키마 — 주최자·참여자·대기자, 2단계 인계, (폐기된) 일정, 상태.

## LA28-1 🟡 폐기 선언된 `schedule`이 필수 필드라, 모든 쓰기 경로가 계속 빈 배열을 써야 한다

22-28행: "DEPRECATED — … nothing reads it, new rows write []. Drop it in a data migration." 그런데 필드는 기본값 없는
필수(`z.array(...)`)다. 그래서 죽은 필드를 쓰는 곳이 살아 있다 — TS `records-admin.ts:213` `schedule: []`, SQL 승인 흐름
`atomic_flows.sql:876` `'schedule', '[]'::jsonb`, 테스트 픽스처들(`studies-load.test.ts:74`, `snapshot.test.ts:158` 등).
`expectTablesValid`가 기본값 의존을 거부하므로 SQL 쪽은 기본값을 달아도 계속 써야 한다.

결과 둘: (1) 새 스터디 생성 경로를 만드는 사람은 "읽는 곳 없음"이라 적힌 필드를 두 언어로 채워야 한다. (2) 이름이
`Seminar.schedule`(`seminar.ts:99`, 확정 일정 객체 | null)과 같고 모양은 전혀 다르다 — 아카이브 레이아웃처럼 두 테이블을
함께 다루는 코드(`(public)/archive/+layout.server.ts:131-136`는 세미나 쪽)에서 `s.schedule`이 무엇인지는 변수 출처로만 안다.

처방: 주석이 적은 대로 데이터 마이그레이션으로 필드를 걷고(SQL·TS·픽스처에서 동시 제거), 그 전까지는 "폐기"가 아니라
"이행 대기"로 적는다. 구조 변경(마이그레이션은 데이터 변경).

## LA28-2 🟡 "주최자는 정확히 한 명"이라는 불변식을 게이트가 막지 않고, 읽는 쪽은 `[0]`을 주최자로 본다

> **검증 정정**(보충, 등급 유지): 덮어쓰기 지점이 하나 더 있다 — 회원의 인계 수락 `acceptTransfer`
> (`services/studies.ts:276-278`)도 `from = s.organizerIds[0]`을 이력에 남기고 `organizerIds: [memberId]`로 덮어쓴다.
> 두 번째 주최자가 제안한 인계라도 이력의 `from`은 첫 번째 주최자가 된다. 또 "생성 경로도 한 명만 넣는다"는 라우트
> 기준으로만 맞다 — 서비스 `createStudy`(`records-admin.ts:203-206`)는 배열을 받아 `length === 0`만 거부하므로 두 명 이상을
> 그대로 저장한다.

14-15행: "Array by design (extensibility); the current invariant is exactly one organizer." 스키마는 `.min(1)`이다 —
두 명 이상이 통과한다. 읽는 쪽은 "정확히 한 명"을 전제한다:

- `(member)/study/+page.server.ts:48` `nameOf.get(s.organizerIds[0] ?? "")` — 인계 제안자 이름
- `(public)/+page.server.ts:418` `memberNameById.get(s.organizerIds[0])`
- 반면 권한 판정은 `includes`(`study/[id]/+page.server.ts:38`, `settings/withdraw/+page.server.ts:14`, SQL `:1040` `?`)

결과: 주최자가 둘인 행이 들어오면(운영 스크립트, 향후 경로) 권한은 두 명에게 주어지는데 화면은 첫 번째만 주최자로
표시하고, 관리자 인계(`setOrganizer`)는 `from = study.organizerIds[0]`만 이력에 남기고 `organizerIds: [newOrganizerId]`로
**덮어써** 두 번째를 조용히 지운다(`records-admin.ts:272,275`). 생성 경로도 한 명만 넣는다
(`(admin)/admin/studies/+page.server.ts:123`). "확장성을 위한 배열"은 읽는 쪽이 `[0]`을 쓰는 한 확장되지 않는다 — 다중 주최자를 도입하려면 이 소비자들을
전부 고쳐야 한다.

처방: 설계가 정해질 때까지 `.length(1)`로 게이트가 주석의 불변식을 강제한다. 저장된 행이 모두 한 명이면 동작 변경 없음
(이관된 스터디의 `organizerIds`는 legacy id라는 주석이 있다 — `(admin)/admin/studies/+page.server.ts:32-33` — 개수는
실측 필요).

## LA28-3 🟡 상태 집합이 도메인에 따로 선언돼 있다

4행 `StudyStatus = z.enum(["recruiting", "ongoing", "finished"])`와 `domain/studies.ts:5` `STUDY_STATUSES`.
`setStudyStatus(…, status: Study["status"])`(`services/studies.ts:159-161`)가 도메인 입력 타입과 만나는 지점에서 컴파일러가
한 방향을 잡는다. 그래도 목록은 둘이다 — `seminar.ts:2,7`처럼 도메인 배열로 `z.enum`을 만들면 하나가 된다. 구조 변경만.
(`LA12-2`·`LA14-2`·`LA21-1`과 같은 형태.)

## 확인했고 지적하지 않은 것

- **`pendingTransfer`·`transferHistory`(18-21, 29-31행)** — 2단계 인계와 관리자 강제 인계(`byAdmin`)를 구분해 기록한다.
  관리자 인계가 진행 중 제안을 지우는 이유가 서비스에 적혀 있다(`records-admin.ts:250-254`). 모델이 맞다
- **`participantIds`와 `pendingParticipantIds`의 배타성** — 교차 필드 불변식은 서비스 몫(`LA10` 기준)
- **`photos` 키 배열(32행)** — 참조 무결성은 `asset-cleanup.ts`가 맡는다
- `z.infer` 별칭(37행) — 유지 관례

## 검증 (2026-09-28)

- LA28-1 — 확인 (`records-admin.ts:213`, `atomic_flows.sql:876` 일치)
- LA28-2 — 정정 (보충: `acceptTransfer` `studies.ts:276-278`도 덮어쓰고, 서비스 `createStudy`는 다수 주최자를 받는다. 등급 유지)
- LA28-3 — 확인
- 누락 점검: 37행 재독. 추가 없음
