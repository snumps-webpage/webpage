# 역대 회장단 공개 프로필 — 설계

2026-09-30 · 승인된 결정: 편집은 본인+관리자, 가져오기는 **연동**, 학번은 **입학년도만**, 공개는 **모든 학기** 카드.

## 목적

역대 회장·부회장이 학과·학번·이메일·근황을 **각자 골라** 역대 회장단 페이지에 공개한다.
값은 회원 DB 인적사항을 그대로 쓰거나(연동), 다른 내용을 직접 입력할 수 있다.

## 1. 데이터 — `executive-profiles` 테이블

JSONB 문서 저장소라 `schemas/index.ts` 레지스트리 등록만으로 생긴다(SQL 마이그레이션 없음).
사람당 한 행.

```ts
ProfileField = { source: "hidden" }
             | { source: "member" }                 // 연동: 공개 시점에 회원 DB에서 읽는다
             | { source: "custom"; value: string }  // 직접 입력
BioField     = { source: "hidden" } | { source: "custom"; value: string }

ExecutiveProfile = {
  id, memberId,      // 명부 id — 운영 id, 재가입 전 옛 회원은 legacy id
  department: ProfileField,
  cohort: ProfileField,
  email: ProfileField,
  bio: BioField,
  updatedAt, updatedBy,
}
```

| 필드       | 연동 원천                                         | 직접 입력 검증          | 공개 표기   |
| ---------- | ------------------------------------------------- | ----------------------- | ----------- |
| department | 회원 행 `department`                              | 1~40자                  | 그대로      |
| cohort     | private-info `studentId` 앞 4자리 연도(19xx/20xx) | 2자리 숫자              | `18학번`    |
| email      | private-info `email`                              | 이메일 형식, 100자 이하 | mailto 링크 |
| bio(근황)  | 없음                                              | 1~200자                 | 줄바꿈 유지 |

- 모든 입력은 `stripInvisibles` 후 trim. 직접 입력이 비면 거부(비공개를 고르면 된다).
- **행이 없으면 전부 비공개**(opt-in).
- 전화번호는 범위 밖. 현 회장단의 자동 공개와 `hidePublicPhone` 규칙은 그대로.

### 행 찾기

사람의 프로필은 `memberId ∈ {운영 id, legacyMemberId}`로 찾고, 운영 id 행이 우선이다.
저장할 때 legacy id로 된 행이 있으면 그 행을 고쳐 쓰면서 `memberId`를 운영 id로 바꾼다.
그래서 관리자가 재가입 전에 대리 입력한 프로필이 재가입 뒤에도 이어진다.

### 연동 값 해석

전화번호와 같은 순서로 읽는다. 먼저 운영 private-info(운영 id)를 보고,
없으면 legacy-private-info(`legacyMemberId`, 또는 legacy 전용 행의 id)를 본다.
원천 값이 비었거나 학번에서 연도를 읽을 수 없으면 그 필드는 공개하지 않는다(`null`).

## 2. 공개 — `/about/executives`

- 새 함수 `getPublicExecutiveHistory()`는 `getPublicExecutives()`의 학기 목록에 holder마다 `profile`을 붙인다.
  - `profile`의 형태: `{ department, cohort, publicEmail, bio }`. 각 값은 `string | null`.
  - 모두 `null`이면 `profile: null`.
- **루트 레이아웃은 바꾸지 않는다.** `getPublicExecutives()`는 모든 페이지가 부르므로, 프로필은 역대 회장단 페이지 로드에서만 싣는다.
- 공개 키는 `publicEmail`이다. BE-64 금지 키 `"email"`을 피하려는 것이다. 원본 학번(`studentId`)은 절대 싣지 않는다.
- `status === "withdrawn"`이면 `profile: null`이다.
- 같은 사람은 모든 학기 카드에 같은 프로필로 나온다.
- 카드 표시 순서:
  1. 이름
  2. `학과 · 18학번`
  3. 이메일
  4. 근황

## 3. 편집 — 공용 `ExecutiveProfileEditor.svelte`

- 필드마다 **비공개 / 회원 정보 사용 / 직접 입력**을 고른다.
  - "회원 정보 사용"에는 지금 연동될 값을 미리 보여 준다. 값이 없으면 "회원 정보에 없음"으로 표시한다.
  - 근황은 비공개와 직접 입력 두 가지만 있다.
- 폼 필드 이름은 `<field>.source`와 `<field>.value`다. 파싱과 검증은 `$lib/domain/executive-profile.ts`의 `parseExecutiveProfileForm`이 맡는다(클라이언트에서도 쓸 수 있는 순수 함수).
- **본인 편집은 `/settings/executive-profile`에서 한다.**
  - 회장·부회장 이력이 있는 회원만 들어올 수 있고, 그 밖의 회원에게는 403을 준다.
  - 회원 설정 탭은 이력이 있을 때만 보인다(`settings/+layout.server.ts`).
- **관리자 편집은 `/admin/executives/profiles`에서 한다.**
  - 역대 회장·부회장 전원(명부 기준, legacy 포함)을 목록으로 보여 준다.
  - `?member=<id>`로 편집기를 연다. 로그인하지 않는 옛 회장단도 대리 입력할 수 있다.

## 4. 서버 — `services/executive-profiles.ts`

- `listExecutiveProfileCandidates()`: 관리자 목록. 이름, 맡은 학기와 직위, 프로필 설정 여부를 준다.
- `getProfileEditor(memberId)`: 자격, 현재 설정, 연동 미리보기를 준다. 자격이 없으면 `FORBIDDEN`이다.
- `saveExecutiveProfile(memberId, input, actorId)`: 자격을 확인한 뒤 `mutate`(CAS)로 upsert하고 감사 기록을 남긴다.
  - 감사 액션은 `executive-profile.update`다.
  - detail에는 필드별 출처(`hidden`/`member`/`custom`)와 `byAdmin`만 남기고 **값은 남기지 않는다**.
- 자격은 **회장·부회장 이력**이다. 운영 행의 roles와, 이어진 legacy 행의 roles를 함께 본다.

## 5. 테스트

- **스키마:** 출처 판별 합집합, 행 기본값.
- **폼 파서:**
  - 출처 값 검증
  - 직접 입력 필드별 규칙
  - 빈 직접 입력 거부
  - 보이지 않는 문자 제거
- **공개 해석:**
  - 연동(운영, legacy 대체)
  - 직접 입력
  - 비공개
  - 행 없음
  - 학번 연도 파싱 실패 → `null`
  - 탈퇴 → `null`
  - legacy id로 된 프로필을 재가입 후에도 찾는지
- **BE-64:** 프로필을 채운 픽스처에서 `getPublicExecutiveHistory()`에 금지 키와 원본 학번이 없는지.
- **서비스:**
  - 자격 없는 회원의 저장 거부
  - 본인 저장
  - 관리자 대리 저장(legacy 전용 회원 포함)
  - legacy 행을 운영 id로 옮겨 쓰는지
  - 감사 detail에 값이 없는지
- **라우트 액션:**
  - 본인 페이지는 `locals.member.memberId`로만 저장하고, 폼의 memberId는 무시한다.
  - 관리자 액션은 관리자가 아니면 거부한다.
