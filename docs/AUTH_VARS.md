# Authentication & Authorization Variables

## Authorization source

관리자 권한의 단일 원천은 AWS의 `members.isAdmin`이다. 이메일 allowlist 또는 환경변수로
관리자 권한을 부여하지 않는다. 세션 이메일은 `private-info.email`로 회원을 찾는 데만 사용한다.

## Environment variables

| 변수                                       | 용도                                                      |
| ------------------------------------------ | --------------------------------------------------------- |
| `AUTH_SECRET`                              | Auth.js 세션 서명                                         |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth와 Gmail token 갱신                           |
| `ADMIN_REFRESH_TOKEN`                      | Gmail API 발송 계정 refresh token                         |
| `ADMINS_EMAILS`                            | 신규 신청·출석 등 운영 알림 수신 주소. 관리자 권한과 무관 |
| `CRON_SECRET`                              | `/api/cron/sync-events` Bearer 인증                       |

`AUTHORIZED_USERS`와 기존 관리자 이메일 권한 목록은 사용하지 않는다. 새 권한은 관리자 회원
상세 화면의 `setAdmin` 액션으로만 변경하고 감사 로그를 남긴다.
