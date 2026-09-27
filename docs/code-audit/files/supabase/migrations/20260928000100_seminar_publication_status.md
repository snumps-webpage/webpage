# `supabase/migrations/20260928000100_seminar_publication_status.sql` (25줄)

**접두사 `LA44-`** · 데이터 보정 한 문장. `publicationStatus` 키가 없는 세미나 행에 `"published"`를 명시해, `SeminarSchema`에서 뺀 zod 기본값의 이주 규칙을 데이터에 한 번 적는다(2026-09-27 결정). 코드 배포 전 선행 조건이다(`ATOMIC-FLOWS.md:99-100`).

## LA44-1 🟡 값이 `null`인 키를 "있음"으로 친다 — 같은 규칙의 SQL 판정과 어긋난다

18행 `r ? 'publicationStatus'`와 25행 `not r ? 'publicationStatus'`는 **키의 존재**를 본다.
`{"publicationStatus": null}`인 행은 "있음"으로 판정돼 그대로 남고, TS는 그 행을 거부한다
(`schemas/seminar.ts:97` — 기본값도 `nullable`도 없다).

같은 이주 규칙의 SQL 쪽 표현은 반대로 읽는다 — `app_seminar_status`
(`20260928000000_atomic_flows.sql:166`)와 `flow_delete_seminar`(같은 파일 215행)는 `->>`로 읽으므로
`null`도 "없음"이 되어 `published`로 간주한다. 한 규칙("필드가 생기기 전의 행은 공개된 세미나")을
두 파일이 서로 다른 입력 집합에 적용한다.

그런 행을 TS가 쓴 적은 없다 — 옛 zod 기본값도 `undefined`에만 작동했으므로 `null`은 예전에도
디코드 실패였다. 그래서 동작상 차이는 손으로 넣은 데이터에서만 나지만, 판정 기준은 "지금 데이터"가 아니다.
이 파일은 보정이 **끝났다는 보증**으로 쓰이므로(배포 순서의 선행 조건), 보정 뒤에도 TS가 읽지 못하는
행이 남을 수 있다는 것은 그 보증의 구멍이다.

처방: 조건을 `jsonb_typeof(r -> 'publicationStatus') is distinct from 'string'`으로(없음·`null` 모두 보정),
혹은 `null`을 의도적으로 제외한다면 그 이유를 머리 주석에 적는다. `LA43-5`의 처방(SQL 쪽 기본값 규칙
제거)과 함께 가면 규칙이 이 파일 한 곳에만 남는다. **동작 변경은 `null` 행에 대해서만.**

## 확인했고 지적하지 않은 것

- **재실행 안전** — 24-25행의 `exists`가 보정할 행이 없으면 `update` 자체를 건너뛰므로 두 번째 실행은
  `version`도 올리지 않는다. `publication-status-backfill.test.ts:43-54`가 정확히 이것을 고정한다
- **행 순서 보존** — `with ordinality … order by n`(20-21행). 순서를 바꾸면 TS 쪽 표시 순서가 흔들린다
- **나머지 필드 불변** — `r || jsonb_build_object(...)`는 키 하나만 더한다(테스트 40행이 제목 보존을 확인)
- **`version = version + 1`**(22행) — 보정과 동시에 도는 옛 코드의 `mutate`가 CAS에 지고 새 문서를 다시 읽게
  한다. 버전을 올리지 않으면 옛 코드가 보정 전 스냅숏으로 표를 덮을 수 있다. 옳다
- **세미나 문서가 없거나 비어 있으면 아무것도 하지 않는다** — `where name = 'seminars'`에 행이 없으면 0행,
  빈 `rows`면 `exists`가 거짓(테스트 56-59행)
- **규칙 자체**(9-12행) — 옛 기본값 `.default("published")`와 같다. 이 필드가 생긴 뒤 TS가 쓴 행은 기본값이
  `mutate` 때마다 디스크에 새겨졌으므로 키가 없는 행은 필드 이전의 것뿐이다(`schemas/seminar.ts:86-95`)
- **적용 순서** — 파일명이 `…000000_atomic_flows.sql` 뒤에 정렬되지만 서로 의존하지 않는다. 의존하는 것은
  새 코드이고, 머리 주석(6-8행)과 `ATOMIC-FLOWS.md:99-100`·`OPERATOR-TODO.md` 2-2절이 "적용 → 배포"를 적는다
- **백업 덤프에서 되살린 옛 행** — 복원 경로는 자동화돼 있지 않고(`ops-backup-db.mjs:17` "읽기만 한다"),
  이 파일이 재실행 안전하므로 복원 뒤 다시 돌리면 된다

## 검증 (2026-09-28)

- LA44-1 — 확인. `?`는 키 존재만 보고, `SeminarPublicationStatus`는 `nullable`도 기본값도 없으며(`schemas/seminar.ts:97`), SQL 쪽 `app_seminar_status`(`atomic_flows.sql:166`)와 215행은 `->>`로 읽어 `null`을 `published`로 친다 — 두 입력 집합이 다르다는 주장 그대로다. 처방의 `jsonb_typeof(...) is distinct from 'string'`은 숫자 등 다른 타입도 `published`로 덮으므로, 채택한다면 "문자열이 아니면 모두 보정"이 의도임을 주석에 적을 것
- 누락 점검: `rows`가 없거나 빈 문서, 재실행, 순서 보존, 동시 실행하는 옛 코드의 CAS를 다시 확인했다. 추가 없음
