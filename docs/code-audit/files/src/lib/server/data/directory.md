# `src/lib/server/data/directory.ts` (42줄)

**접두사 `LA31-`** · 표시용 통합 회원 디렉터리(S9) — 운영 `members`와 읽기 전용 `legacy-members`를 합친 명단(`getMemberDirectory`)과 id 색인(`getDirectoryIndex`).

## LA31-1 🟡 연결 규칙(`legacyMemberId`)이 두 함수에 따로 구현돼 있다

두 함수가 같은 두 표를 각자 읽고(19-22, 31-34), S9 연결 규칙을 각자 적용한다:

- 명단: 23-26행 — 운영 행의 `legacyMemberId` 집합으로 legacy 행을 **가린다**
- 색인: 36-40행 — legacy를 먼저 넣고 운영 행으로 **덮어쓰며**, `legacyMemberId` 키도 운영 행으로 돌린다

13-15행 주석이 이 둘을 한 규칙("새 행이 옛 행을 가리고, id 조회에서는 둘 다 그 사람")으로 설명하지만
코드는 두 벌이다. 규칙이 바뀌면(예: 한 사람이 legacy 행 둘에 연결, 재가입자 연결 해제) 두 곳을 같이 고쳐야 하고,
한쪽만 고치면 명단과 이름 해석이 서로 다른 사람을 말한다.

두 벌의 비용은 이미 관측됐다 — 아카이브 레이아웃이 한 `Promise.all`에서 둘을 모두 부른다
(`(public)/archive/+layout.server.ts:70-71`) → 같은 두 표를 두 번 가져와 병합을 두 번 한다(`ZR-5`).

**고침**: `loadDirectory(): { list, index }` 하나가 표를 한 번 읽어 두 모양을 만들고, 기존 두 함수는 그 위의
얇은 접근자로 남긴다. 구조만 바뀐다.

## LA31-2 🟡 연결 규칙을 고정하는 테스트가 없다

이 모듈의 존재 이유는 `legacyMemberId`가 **null이 아닐 때**의 동작이다. 그런데 이 함수들을 거치는 테스트의
픽스처는 전부 `legacyMemberId: null`이다(`public/archive.test.ts:78,100`, `archive/snapshot.test.ts:68,90`,
`services/participation.test.ts:168`). `services/approvals.test.ts:257`은 승인 흐름이 연결을 **쓰는지**만 확인하고
디렉터리가 그것을 **어떻게 읽는지**는 보지 않는다.

즉 "재가입자의 legacy 행이 명단에서 사라진다"와 "legacy id로 조회하면 새 행이 나온다" — 주석(13-15)이 약속하는 두
문장이 어느 테스트에도 없다. `LA31-1`의 두 벌이 갈라져도 아무것도 깨지지 않는다.

**고침**: 운영 행 하나가 legacy 행 하나를 가리키는 픽스처로 명단 길이·색인 두 키를 단언하는 단위 테스트 하나.

## 확인했고 지적하지 않은 것

- **탈퇴한 운영 행도 legacy 행을 가리고, 색인에서 이름이 풀린다** — 발표자·조직자 이름은 사료라는
  `SCOPE.md` C-16 결정(`ZR-9` ✅ 설계 기록)과 일관된다. 되살리지 않는다
- **legacy id를 운영 행으로 푸는 것(39)** — 과거 기록에 **현재** 이름·학과가 표시된다. 주석(13-15)이 명시한 의도다
- **명단 순서(26: 운영 → legacy)** — 순서에 기대는 소비자의 문제는 `ZR-11`이 다뤘다. 이 함수는 순서를 약속하지 않는다
- **운영 로직이 legacy를 읽지 않는다는 주석(10-11)** — `getActivitiesOf`(`repos.ts:47-56`)가 legacy id로 매칭하지만
  그것은 회원 **본인** 행의 `legacyMemberId`를 받아서 하는 것이고 `legacy-members`를 읽지 않는다. 주석과 모순 없음
- **두 운영 행이 같은 legacy 행을 가리키는 경우** — 색인은 마지막 행이 이긴다. 연결은 승인 흐름이 이메일 매칭으로
  한 번 쓰고(`atomic_flows.sql:746`) 유일성 제약은 없지만, 이 상황의 올바른 동작 자체가 정의돼 있지 않아 이 파일의
  결함으로 보지 않는다

## 검증 (2026-09-28)

- LA31-1 — 확인. 비용 서술도 맞다: `withCache`(`cache.ts:85-`)에 single-flight가 없어, 캐시가 빈 상태에서
  아카이브 레이아웃의 `Promise.all`(`archive/+layout.server.ts:70-71`)은 `members`·`legacy-members`를 실제로 두 번 읽는다
- LA31-2 — 확인(`legacyMemberId`가 null이 아닌 픽스처는 `approvals.test.ts:257`의 쓰기 단언뿐)
- 누락 점검: 가림 집합의 `filter(Boolean)`, 색인 덮어쓰기 순서(legacy 먼저), 반환 타입 `Member`로 legacy 행이 합쳐지는 점을
  확인. 추가 없음.
