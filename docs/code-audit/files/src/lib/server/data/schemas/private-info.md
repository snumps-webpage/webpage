# `src/lib/server/data/schemas/private-info.ts` (22줄)

**접두사 `LA22-`** · `private-info`(및 `legacy-private-info`) 테이블 행 스키마 — 🔒 PII, 로그인 매칭 키(이메일) 보유.

## LA22-1 🟡 로그인 매칭 키의 정규화가 저장 시점이 아니라 읽는 곳마다 따로 있다

> **검증 정정**(사실 한 곳, 등급 유지): "저장값은 대소문자를 보존한 채 저장되고(쓰기 경로 `atomic_flows.sql:758`
> `v_app -> 'email'` 그대로)"는 경로에 따라 다르다. 신청 저장이 이미 **쓰기 시점에 정규화**한다 —
> `submitApplication`의 `email: norm(input.email)`(`services/membership.ts:18,43`, `trim+lower`). 승인 흐름은 그
> 값을 옮기므로 신규 가입으로 생긴 `private-info` 행은 소문자다. 대소문자가 섞인 값이 들어오는 경로는 관리자 편집
> (`members-admin.ts:118-128` `updatePrivateInfo` ← `privateInfoUpdateSchema`, `domain/members.ts:96-100`은 `trim`만)과
> 이관 데이터다. 즉 처방의 "쓰기 시점 정규화"는 한 경로에 이미 있고 나머지 경로에 없다 — 규칙이 여섯 곳 + 쓰기 한 곳에
> 흩어져 있다는 결론은 더 강해진다.

8-9행: "login matching key (unique when present)", `email: z.string().email().or(z.literal(""))`. 저장값은 대소문자를
보존한 채 저장되고(쓰기 경로 `atomic_flows.sql:758` `v_app -> 'email'` 그대로), 비교하는 곳이 각자 정규화한다:

| 위치                                         | 정규화                            |
| -------------------------------------------- | --------------------------------- |
| `guards/resolve-member.ts:23,26` (로그인)    | 입력 `trim+lower`, 저장값 `lower` |
| `guards/resolve-member.ts:71,74` (신청 여부) | 입력 `trim+lower`, 저장값 `lower` |
| `services/membership.ts:18`                  | `norm = trim+lower`               |
| `mail/dispatch.ts:84` (수신자 중복 제거)     | 저장값 `lower`                    |
| `atomic_flows.sql:692,700` (승인 매칭)       | 양쪽 `lower(trim(…))`             |
| `atomic_flows.sql:724` (아카이브 매칭)       | 양쪽 `lower(trim(…))`             |

`.email()`이 공백을 거부하므로 저장값의 `trim` 유무는 지금 결과를 바꾸지 않는다 — 이것은 스키마가 보장하는 논리적
사실이라 유효한 등가다. 남는 것은 **여섯 곳이 같은 규칙을 각자 들고 있다**는 것이다. 새 비교 지점이 `lower`를 빠뜨리면
대문자가 섞인 이메일의 회원은 그 경로에서만 "없는 사람"이 된다. 주석이 말하는 유일성("unique when present")도 대소문자
무시 기준인지 아닌지 어디에도 적혀 있지 않다 — SQL 매칭은 무시하고, 저장은 구분한다.

처방: 쓰기 시점에 정규화해 저장값을 소문자로 고정하고(TS 쓰기·SQL 흐름 모두, 기존 행 이행 포함) 비교는 입력 쪽만
정규화한다. **동작 변경**(저장값이 바뀐다 — 메일 발송 주소 표기 포함). 최소 처방은 정규화 함수를 하나로 모으는 것.

## LA22-2 🟡 `studentId` 주석이 기본값의 역할을 잘못 설명한다

> **검증 정정**(주장 축소, 등급 유지): 주석이 "틀린" 것은 아니다. "형식 강제는 폼/액션 계층에서 하고, 스키마는 …
> 빈 문자열을 허용한다"는 **형식 정규식을 두지 않은 이유**를 말하고, 그것은 사실이다(정규식이 있으면 빈 값이 막힌다).
> 결함은 `.default("")`의 역할(키 부재 보정)을 **설명하지 않는 누락**이다 — 제목의 "잘못 설명한다"는 "설명하지 않는다"로
> 읽어야 한다. 결과 문단(기본값을 걷을 시점을 판단할 근거가 없다)은 그대로 성립한다.

12-14행: "스키마는 legacy 이관·테스트 픽스처를 위해 빈 문자열을 허용한다" + `z.string().default("")`. 빈 문자열 허용은
`z.string()`만으로 이미 성립한다. `.default("")`가 하는 일은 다르다 — **키가 없는** 행(S9 이전 행)을 빈 값으로 읽는 것이다.
주석은 존재하지 않는 제약(빈 값 금지)을 푸는 이유를 대고, 실제 기제(키 부재 보정)는 설명하지 않는다.

결과: 기본값을 걷어 낼 수 있는 시점(모든 행에 키가 생긴 뒤)을 판단할 근거가 주석에 없다. `seminar.ts:88-96`이 같은 종류의
기본값을 걷어 낸 절차(마이그레이션으로 한 번 적고 기본값 제거)와 대조된다. 주석 수정만.

## LA22-3 🟠 주석이 단언하는 "매칭 키 유일성"을 관리자 편집 경로가 지키지 않고, 로그인은 첫 일치 행을 고른다 (검증 추가)

8행 "login matching key (unique when present)". 이 불변식을 강제하는 곳을 쓰기 경로별로 찾았다:

- 신규 가입 승인 — `flow_approve_application`이 같은 이메일(`lower(trim)`)의 행이 있으면 **그 회원을 재사용**한다
  (`atomic_flows.sql:699-704`). 중복을 만들지 않는다
- 관리자 편집 — `(admin)/admin/members/[id]/+page.server.ts:186-205` → `updatePrivateInfo`(`members-admin.ts:118-128`)는
  `{ ...rows[idx], ...patch }`로 **다른 행과의 충돌을 보지 않고** 이메일을 덮어쓴다. `privateInfoUpdateSchema`
  (`domain/members.ts:201-205`)는 형식과 `@snu.ac.kr`만 본다

그리고 읽는 쪽은 유일성을 전제한다 — `resolveMember`는 `infos.find((i) => i.email.toLowerCase() === normalized)`
(`guards/resolve-member.ts:26`)로 **배열에서 먼저 나오는 행**을 로그인 주체로 삼는다.

결과: 관리자가 회원 B의 이메일을 A의 주소로(대소문자만 달라도) 고치면, A의 로그인은 두 행 중 배열 앞쪽을 고른다 —
B의 행이 앞이면 **A가 B로 로그인한다**(B의 개인정보 화면, B의 capability, B가 관리자면 관리자 존). B는 자기 주소가 어느
행에도 없어 로그인하지 못한다. 오류도 경고도 없다.

귀속: 행 간 불변식은 쓰기 쪽 몫이라는 이 문서 묶음의 기준(`LA10`)대로 결함의 자리는 `members-admin.ts`(아직 리뷰 문서가
없다)다. 이 스키마 주석이 불변식의 **유일한 기록**이라 여기 적는다. 처방: `updatePrivateInfo`가 `lower(trim)` 기준으로 다른
`memberId`의 행과 충돌하면 `CONFLICT`. **동작 변경**(지금 통과하는 충돌 편집이 거부된다).

## 확인했고 지적하지 않은 것

- **`email`의 `""` 허용(9행)** — 이메일 없는 옛 회원(주석 8행). 로그인 매칭은 빈 문자열과 일치할 수 없다
  (`resolve-member.ts:23`의 입력은 OAuth 이메일). 옳다
- **`mailPrefs` 단일 키(15-16행)** — "종류가 늘면 키를 더한다(이행 아님)" — 새 키에 `.default`를 달면 된다는 뜻이고
  맞는 설계다
- **`hidePublicPhone` 기본값 false(17-18행)** — SQL이 명시적으로 `false`를 쓴다(`atomic_flows.sql:763`). 기본 공개가
  정책이라 "없음"과 `false`의 의미가 같다
- **`phone` 형식 무검증** — `legacy-private-info`에 하이픈 없는 번호와 빈 값이 실제로 있다(실측 메모). 저장 게이트가
  형식을 강제하면 아카이브가 읽히지 않는다. 형식 강제를 입력 계층에 둔 것은 옳다
- **이 스키마를 `legacy-private-info`가 공유한다** — 결합 문제는 `LA16-2`

## 검증 (2026-09-28)

- LA22-1 — 정정 (신청 경로는 이미 쓰기 시점에 소문자화한다 `membership.ts:43` — 혼합 대소문자는 관리자 편집·이관 경로로만 들어온다. 등급 유지)
- LA22-2 — 정정 (주석은 틀리지 않고 `.default`를 설명하지 않을 뿐이다. 등급 유지)
- LA22-3 — 추가 (유일성 불변식이 관리자 편집 경로에서 강제되지 않고, `resolveMember`의 첫 일치 선택과 만나 다른 회원으로 로그인된다)
- 누락 점검: 22행 재독. `mailPrefs`·`hidePublicPhone`·`phone`은 문서의 판단에 동의한다
