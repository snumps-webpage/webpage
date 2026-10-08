# SNUMPS 복구 및 게시 전 검토 — 2026-10-08

## 복구 범위

최신 원격 `codex/club-workflow-review-20261004`의 `ea46a04`, `8758795`를 복구했습니다. 현재 main `6d82016707a75a57816bc77c0b9c66e33eef6d6e` 위의 누적 회원 업무 전환입니다. 원본 `ui-branch`의 미커밋 변경과 10월 2일 M1 작업 디렉터리는 수정하지 않았습니다. 10월 2일 ZIP을 최신 결과로 사용하지 않았습니다.

공개 홈 `GuestLanding.svelte`는 main과 바이트 단위로 같습니다. 회원 메뉴와 화면은 실제 스터디·세미나·출석·계정·운영자 업무를 연결합니다. 세미나 공개 자료는 파일별 링크를 표시합니다. 누락된 원자료를 새로 만들거나 운영 자료를 가져오지 않았습니다.

## 새로 실행한 검사

Node 24.11.1, lockfile에 지정된 pnpm 11.26.0으로 격리 사본에서 실행했습니다.

- 전체 Prettier 및 ESLint 통과
- 전체 Vitest: 165개 파일 / 1,791개 테스트 통과, 1개 파일 / 2개 테스트 생략
- Svelte/TypeScript: 1,052개 파일, 오류 0 / 경고 0
- production build 통과, `git diff --check` 통과
- 저장소 HTTP scenarios 102/102, audit-fixes 46/46 통과
- 독립 읽기 전용 보안 검토: 차단 이슈 없음. 관리자 게이트, 회원 capability, 소유권, 대시보드 개인정보 투영, 출석 입력 위조와 원고 복원 경계를 확인했습니다. 관련 6개 파일 / 212개 테스트 통과는 전체 테스트와 중복됩니다.

HTTP 검사는 저장소의 `scripts/measure/start.sh` 격리 복사본과 메모리/PGlite 백엔드, 합성 세션·회원 자료만 사용했습니다. 운영 로그인·쓰기·메일 발송을 수행하지 않았습니다.

## 실제 브라우저 검토

10월 4일 보고서에서 실행하지 못한 브라우저 검토를 이번에 로컬 Chromium으로 수행했습니다. 아래 이미지는 실제 브라우저 스크린샷이며 모든 자료와 인물은 합성 fixture입니다.

- 공개 홈: 데스크톱 및 390×844 모바일, 기존 홈 컴포넌트 보존
- 스터디: 빈 목록, 모집 목록, 상세, 신청 성공 → 승인 대기 → 신청 취소
- 세미나 제안 및 관리자 세미나 운영: 데스크톱/모바일 렌더링
- 모바일 문서 가로 넘침 없음, Tab으로 링크 초점 이동, 메뉴 닫힘 상태 확인

닫힌 메뉴가 `.mobile-only { display: block !important; }`에 의해 표시되어 본문 클릭을 막는 회귀를 발견했습니다. 숨김 선택자가 해당 utility보다 우선하도록 `6cce409`에서 수정하고 실제 신청·취소 동작을 재확인했습니다. 수정 후 타입 검사와 production build도 다시 통과했습니다.

스크린샷: [공개 홈](screenshots-2026-10-08/public-home-mobile.png), [스터디 목록](screenshots-2026-10-08/study-list-mobile.png), [상세](screenshots-2026-10-08/study-detail-mobile.png), [승인 대기](screenshots-2026-10-08/study-pending-mobile.png), [세미나 제안](screenshots-2026-10-08/seminar-proposal-mobile.png), [관리자 세미나](screenshots-2026-10-08/admin-seminars-mobile.png).

## 검증 한계

운영 OAuth 및 실제 계정별 권한, Supabase RLS/Storage, 실제 메일 전달, 실제 PDF 자료 확보는 실행하지 않았습니다. 화면 읽기와 모든 154개 변경 파일의 브라우저 수용 검사를 완료했다고 주장하지 않습니다. 세미나 제안·검토·일정·출석 계약은 합성 HTTP/자동 테스트로 검증했고, 브라우저에서는 렌더링과 스터디 신청·취소를 직접 확인했습니다.

이 결과는 draft PR 검토용이며 병합·운영 배포를 하지 않습니다. 원격 CI는 게시 후 정확한 PR head SHA로 별도 확인합니다.
