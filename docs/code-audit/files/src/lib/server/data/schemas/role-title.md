# `src/lib/server/data/schemas/role-title.ts` (16줄)

**접두사 `LA24-`** · `role-titles` 테이블 행 스키마 — 관리자가 추가한 커스텀 임원 직위 옵션.

지적 없음.

## 확인했고 지적하지 않은 것

- **주석이 가리키는 기본 직위의 위치(6행)** — `services/executives-admin.ts:19` `DEFAULT_ROLE_TITLES`에 실제로 있다.
  기본 직위와 같은 이름의 커스텀 추가·삭제는 서비스가 거부한다(`executives-admin.ts:49,65`)
- **"옵션 삭제는 과거 배정 기록에 영향 없음"(7-8행)** — 배정은 `member.roles[].title`에 문자열로 복사되므로
  (`member.ts:7-10`) 주석대로다
- **`title` 유일성 미표현** — 행 간 불변식, 서비스 몫
- **`"회장"`·`"부회장"` 문자열이 여러 곳에 하드코딩돼 있다** — `mail/dispatch.ts:48`,
  `(member)/settings/notifications/+page.server.ts:21`, `public/archive.ts:75`, `domain/executive-roster.ts:50`.
  이 파일의 결함이 아니라 `DEFAULT_ROLE_TITLES`를 원천으로 쓰지 않는 소비자들의 것이다. 해당 파일 리뷰로 넘긴다

## 검증 (2026-09-28)

- 지적 없음 — 확인. `executives-admin.ts:19`(`DEFAULT_ROLE_TITLES`)·`:49`·`:65` 인용이 맞다
- 누락 점검: 16행 재독. `title: z.string().min(1)`이 서비스 규칙(`executives-admin.ts:43-48` 비가시 문자 제거·1~20자)보다 헐겁다 — `LA15-1` 2항과 같은 형태지만 이 파일은 동등성을 약속하지 않고 쓰기 경로가 서비스 하나뿐이라 추가하지 않는다. 추가 없음
