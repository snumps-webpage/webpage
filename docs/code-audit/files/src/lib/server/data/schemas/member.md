# `src/lib/server/data/schemas/member.ts` (44줄)

**접두사 `LA21-`** · `members`(및 `legacy-members`) 테이블 행 스키마 — 회원 지위·탈퇴 수명주기·동문·직위·공개 연락처.

## LA21-1 🟠 회원 지위 집합이 같은 파일 안에서도 두 번, 코드 전체에서 여섯 번 적혀 있다 — 한 곳을 빠뜨리면 `members`가 읽히지 않는다

- 4행 `MemberStatus = z.enum(["associate", "regular", "withdrawn"])`
- 16행 `previousStatus: z.enum(["associate", "regular"])` — 같은 파일 4행에서 `MemberStatus.exclude(["withdrawn"])`로
  파생할 수 있는 것을 리터럴로 다시 적었다
- `domain/members.ts:3` `MEMBER_STATUSES`, `:18` `Exclude<MemberStatus, "withdrawn">`, `:154`
  `z.enum(["associate", "regular"])`
- `services/members-admin.ts:44` `status: "associate" | "regular"`
- `guards/zone.ts:26` `status: "associate" | "regular" | "withdrawn"`

결과: 지위를 하나 더하면(예: 휴면) 여섯 곳. 컴파일러는 저장→소비 방향의 일부만 잡는다 — 16행과 `domain/members.ts:154`의
"탈퇴 아닌 지위" 목록은 새 지위를 빠뜨려도 컴파일된다. 빠뜨린 채 배포하면: 탈퇴 신청은 SQL 흐름
`flow_request_withdrawal`이 `'previousStatus', v_m ->> 'status'`로 **현재 지위를 그대로** 적는다
(`atomic_flows.sql:1044-1051`, 거부 조건은 `= 'withdrawn'` 하나뿐 `:1033`). SQL 쓰기는 zod 게이트를 거치지 않으므로
새 지위 회원의 탈퇴 신청 한 번이 16행이 거부하는 행을 **커밋**하고, 그 뒤 `members` 문서 디코드가 실패한다
(`tables.ts:73-81`) — 로그인 해석(`resolve-member.ts`)을 포함해 `members`를 읽는 모든 요청이 500이 된다.
`expectTablesValid`는 테스트가 그 지위를 만들 때만 잡는다.

처방: 16행을 `MemberStatus.exclude(["withdrawn"])`로 바꾸는 것은 즉시 가능하다(동작 변경 없음). 전체는
`seminar.ts:2,7`의 방식(도메인 배열 → `z.enum`)으로 원천을 도메인 하나로 모은다. 같은 형태가 `LA12-2`·`LA14-2`·`LA28-3`.

## LA21-2 🟠 공개 링크가 되는 `project.url`의 보안 규칙이 입력 층에만 있고, 입력 층을 거치지 않는 쓰기 경로가 있다 (검증 추가)

37-38행 `project: z.object({ title: z.string(), url: z.string().optional() }).nullable()`. 이 값은 **공개 페이지의
`href`**가 된다 — 아카이브 레이아웃이 `url: m.project!.url ?? null`로 내보내고(`(public)/archive/+layout.server.ts:198-206`),
`projectIndexItems`가 `href: project.url`로 옮기고(`domain/public-content.ts:143-154`), `PublicIndexList.svelte:41-44`가
`<a href={item.href}>`로 그린다. Svelte는 `href` 값을 이스케이프할 뿐 `javascript:` 스킴을 막지 않는다.

규칙은 입력 스키마에만 있다 — `domain/members.ts:126-135` "Rendered as a public link: http(s) only, never javascript: and
friends"(`/^https?:\/\//i` + `URL.canParse`). 저장 게이트는 아무 문자열이나 받는다. 그런데 입력 스키마를 거치지 않는 쓰기가
있다:

- `flow_approve_application`이 신규 회원 행에 legacy 아카이브의 `project`를 **그대로** 복사한다
  (`atomic_flows.sql:745` `coalesce(v_lp_member -> 'project', 'null'::jsonb)`) — SQL이라 zod 게이트도 거치지 않는다
- `scripts/ops/ops-inherit-legacy.mjs:44` `project: m.project ?? src.project ?? null` — 같은 복사의 소급판
- `legacy-members`는 이 스키마를 공유하므로(`LA16-2`) 아카이브 쪽 재이관이 넣는 값도 같은 게이트만 통과한다

결과: `javascript:` URL을 가진 legacy 행이 하나 있으면, 그 회원의 가입 승인이 그 값을 운영 행에 옮기고 공개 프로젝트
목록이 클릭 가능한 스크립트 링크로 렌더한다(저장형 XSS). 현재 이관 스크립트는 `{ title: "" }`만 쓰고 url을 넣지 않는다
(`20-export-tables.ts:279`) — 그것은 데이터의 성질이고 README 판정 기준상 감면 근거가 아니다. `LA18-1`(두 번째 방어선
부재 → 조용하지 않은 메일 실패)과 같은 형태이지만 결과가 공개 면의 스크립트 실행이라 🟠로 둔다.

처방: 규칙을 한 곳(예: `domain`의 `publicHttpUrl` 스키마)으로 올려 입력 스키마와 저장 스키마가 함께 쓴다 — 저장 게이트에서
`url: z.string().refine(isPublicHttpUrl).optional()`. 저장된 행에 어긋난 값이 있으면 디코드가 실패하므로 먼저 실측
(**동작 변경**). 최소 처방은 렌더 지점(`projectIndexItems`)에서 http(s)가 아니면 `href`를 버리는 것(구조 변경에 가깝다).

## 확인했고 지적하지 않은 것

- **`alumniRevoked` 끈적 플래그(30-31행)** — 주석이 계약을 명시하고, 승격 처리(`members-admin.ts` `setStatus`)가
  따르는지는 서비스 리뷰 몫이다
- **`project.url`만 `optional`(37행)** — 이 스키마군에서 "없음"을 `nullable`이 아니라 `optional`로 표현하는 유일한
  필드다. 도메인 타입(`domain/members.ts:13` `url?: string`)과 일치하고, 이관 원본 모양을 따른 것이다. 일관성 흠이지만
  구분되는 의미 차이가 없어 지적하지 않는다
- **`legacyMemberId: Id.nullable().default(null)`(40행)** — 기본값 null은 "매칭 없음"과 "필드 생기기 전 행"이 같은
  의미라 문제되지 않는다. SQL은 명시적으로 채운다(`atomic_flows.sql:746`)
- **`publicContact`가 유일한 공개 연락 필드(34-35행)** — 공개 로드 노출 표면은 라우트 리뷰(`ZR-*`)가 다뤘다
- **이 스키마를 `legacy-members`가 공유한다** — 그로 인한 결합은 `LA16-2`

## 검증 (2026-09-28)

- LA21-1 — 확인 (인과 사슬을 SQL로 확인: `flow_request_withdrawal`의 거부 조건은 `= 'withdrawn'` 하나(`atomic_flows.sql:1033`)이고 `'previousStatus', v_m ->> 'status'`를 그대로 커밋한다(`:1049`). 이후 `members` 디코드 실패 → 로그인 해석 포함 전 요청 500. 🟠는 이 결과에서 나온다. 목록 중 `domain/members.ts:18`은 `MEMBER_STATUSES`에서 **파생**된 것이라 독립 선언이 아니다 — 리터럴 선언은 여섯이 맞다)
- LA21-2 — 추가 (`project.url` 공개 링크 규칙이 저장 게이트에 없고, SQL 승인 흐름이 legacy 값을 입력 층 없이 복사한다)
- 누락 점검: 44행 재독. `Withdrawal.holdBy`·`holdAt` 쌍 불변식, `publicContact` 무형식은 문서 기준(교차 불변식은 쓰기 쪽, 공개 노출은 `ZR-*`)으로 설명된다
