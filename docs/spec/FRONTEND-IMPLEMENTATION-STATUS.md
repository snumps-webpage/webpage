# 프런트엔드 구현 및 원격 명세 동기화 기록

기준일: 2026-08-28
로컬 브랜치: `feature-api-spec` (`0371f81` 기반)
검토한 원격: `origin/docs/feature-api-spec` (`9d73869`)

## 1. 원격에서 추가된 명세 변경

| 커밋      | 내용                                            | 반영 방식                                                             |
| --------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| `72d2f2e` | 구현 계층 검토에서 발견된 30개 결함 수정        | 당시 API v0.8·구현 v2.1에 재적용했고, 현재 v0.9·v2.2에서도 유지       |
| `270fc2b` | 탈퇴 후 자동 익명화 구현 보류                   | 로컬 결정과 일치. 유예 종료일만 계산하고 후속 데이터 처리는 계속 보류 |
| `9d73869` | GitHub Actions 시간당 크론 + Vercel 일 1회 백업 | workflow와 `vercel.json`에 반영                                       |

원격 커밋을 그대로 merge/cherry-pick하지 않았다. 로컬에는 프런트엔드 구현과 후속 제품 결정이
대규모로 존재하고 원격의 반복 스터디 일정·단순 공개 연락처 모델이 이를 되돌리기 때문이다.

## 2. 프런트엔드 구현 현황

- 가입 신청·수정·대기·철회, 프로필·메일 설정·탈퇴 유예와 철회
- DB 기반 회원 지위·학기별 직책·관리자 권한·회장단 공개 연락처 관리
- 정기/비정기 세미나 신청, pending 신청 수정·철회, 승인→일정 저장→공개 흐름
- 승인 시 `일정 추후 안내`, 최초 공개 시 확정 일정, 공개 후 일정 변경·취소 시 전 회원 공지
- 스터디 신청·참여·주최자 전달, 입력 없는 수동 회차 생성, 회차별 출석 체크
- 가입·세미나·스터디·출석·탈퇴 유예를 모은 관리자 작업함과 기록 편집
- 공개 회원·임원·세미나·스터디·활동·갤러리·프로젝트 아카이브

현재 서버 동작은 개발 프리뷰 fixture로 검증한다. 실제 AWS 데이터 계층, 세션 hydration,
메일·감사 로그·업로드 승격·크론 구현은 백엔드 작업 범위이며 프로덕션 경로는 의도적으로 503을 반환한다.

## 3. API schema 점검 결과

원격 브랜치에는 OpenAPI/Swagger 또는 생성된 클라이언트가 없다. 계약의 단일 원천은
`API-SPEC.md`의 SvelteKit page load·form action·REST 서술이며, BE-10에서 11개 S3 테이블의
Zod 스키마를 만들도록 계획만 되어 있다.

| 계약                     | 실행 시점 schema                                           | 상태                                           |
| ------------------------ | ---------------------------------------------------------- | ---------------------------------------------- |
| REST 오류 `{ error }`    | `restErrorEnvelopeSchema`                                  | 구현                                           |
| 관리자 폴링 공통 봉투    | `queueResponseEnvelopeSchema`                              | 구현; 세 endpoint가 공유                       |
| 업로드 presign 요청·응답 | `presignRequestSchema`, `presignSuccessSchema`             | 구현; 실제 endpoint는 백엔드 대기              |
| 폼 입력                  | `src/lib/domain/*`의 도메인별 Zod schema                   | 프리뷰 구현 범위 완료                          |
| page load/action 출력    | 도메인 인터페이스 + SvelteKit 생성 `PageData`/`ActionData` | 프리뷰 구현 범위 완료                          |
| S3 테이블 11종           | BE-10 `src/lib/server/data/schemas/*`                      | 미구현; 백엔드 담당                            |
| 공개 DTO의 raw row 차단  | projection 함수와 fixture 테스트                           | 프리뷰 구현, 실제 S3 schema 파생은 백엔드 대기 |

REST는 endpoint 수가 적고 SvelteKit form action이 주된 쓰기 경계이므로 지금 별도 OpenAPI를
추가하지 않는다. REST wire schema는 `src/lib/domain/api.ts`, 저장 테이블 schema는 향후
`src/lib/server/data/schemas/*`가 각각 단일 원천이다.

## 4. 원격 수정 중 반영한 사항

- S3 조건부 쓰기의 412·409·If-Match 경합 404 재시도, 일반 5회·출석 큐 10회
- runtime IAM의 `ListBucket`, pending asset Delete, KMS 권한과 업로드 `HeadObject` 검증
- `adapter-vercel` 6.3.2 이상 요구; 현재 lockfile 6.3.4
- REST/API route 자체 인증, 미매칭 route 404 위임, withdrawn 신청자 재진입 차단
- `/members`에서 withdrawn 제외
- 가입 승인으로 생성되는 member/private-info의 `sourceRequestId`
- 출석 큐 action 입력을 `(eventId, queueId)`로 고정
- `/admin` 탈퇴 유예 인박스
- `effectiveStatus` lazy 만료 판정과 이중 크론 스케줄러
- 컷오버 전 관리자 편집 UI 완성, 업로드 실측 검증, Gmail Workspace 한도 확인

## 5. 원격보다 후속 결정을 우선한 사항

- 스터디 반복 schedule과 크론 자동 회차 생성은 제거한다. 주최자가 모임 시점에 수동 회차를 만든다.
- `sourceRequestId`는 실제 원 신청 ULID만 저장한다. 사용자 쓰기 재시도는 별도 UUIDv7 `operationId`다.
- 공개 연락처는 문자열이 아니라 `granted/revoked` 상태와 phone/email을 가진 구조체다.
- 세미나는 승인 즉시 공개하지 않는다. `unscheduled → scheduled → published` 경계를 둔다.
- 비공개 일정 저장은 메일을 보내지 않고, 최초 공개·공개 후 일정 변경·취소에는 후속 메일을 보낸다.
- 탈퇴 유예 후 ID·활동 이력·임원 이력·공개 DTO 처리와 재가입 연결은 임원진 결정 전 구현하지 않는다.
- 이전 Notion 호환 route와 fallback은 복원하지 않는다. 데이터 컷오버의 롤백은 배포·백업 절차가 담당한다.

## 6. 실제 API 연결 전 필수 확인

1. 백엔드 Zod table schema가 API v0.9의 `PublicContact`, seminar publication 상태,
   수동 study session의 `operationId`를 그대로 표현하는지 확인한다.
2. 관리자 큐 세 endpoint가 동일 봉투와 오래된 pending 우선 정렬을 반환하는지 확인한다.
3. 출석 큐 4개 action이 `eventId`와 `queueId`를 모두 받는지 확인한다.
4. presign 응답이 `src/lib/domain/api.ts` schema와 일치하고 등록 시 `HeadObject`를 수행하는지 확인한다.
5. 승인·최초 공개·공개 후 실제 일정 변경·취소에만 메일을 보내고, 비공개 저장·동일 값 재저장·재시도에는 중복 발송하지 않는지 통합 테스트한다.
6. AWS API가 준비되면 fixture를 제거하고, 프로덕션 503을 실제 repository 호출로 한 번에 교체한다.
