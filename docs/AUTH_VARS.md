# Authentication & Authorization Variables

## Authorization source

관리자 권한의 단일 원천은 Supabase `members.isAdmin`이다. 세션 이메일은 `private-info.email`로 회원을 찾는 데만
사용한다. 유일한 예외는 부트스트랩이다(`core/admin-bootstrap.ts`): 빈 운영 DB에서 첫 승인을 할 사람을 위해,
**회원 행이 아직 없는** `ADMINS_EMAILS` 명단의 사람은 관리자로 본다. 그 사람의 가입이 승인되면 명단 여부가 회원
행의 `isAdmin`에 스탬프되고, 그 뒤로 명단은 권한 판정에 쓰이지 않는다. 승인 흐름(SQL)에는 주소가 아니라
sha256 해시(`bootstrapAdminEmailHashes`)로 넘겨 주소가 RPC 인자·구문 로그에 남지 않게 한다.

로그인 자체는 SNU Workspace 계정만 허용한다(`core/sign-in.ts`): `@snu.ac.kr` 주소, `email_verified`가 참,
`hd`가 `snu.ac.kr` — 셋 다 맞아야 한다.

## Environment variables

| 변수                                       | 용도                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                              | Auth.js 세션 서명                                                                                 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth와 Gmail token 갱신                                                                   |
| `ADMIN_REFRESH_TOKEN`                      | Gmail API 발송 계정 refresh token                                                                 |
| `ADMINS_EMAILS`                            | 운영 알림 수신 주소(회장단이 없을 때의 폴백 포함), 그리고 회원 행이 생기기 전의 관리자 부트스트랩 |
| `CRON_SECRET`                              | `/api/cron/*`와 `/api/health`의 Bearer 인증 (없으면 모든 호출이 401)                              |

`AUTHORIZED_USERS`와 기존 관리자 이메일 권한 목록은 사용하지 않는다. 새 권한은 관리자 회원
상세 화면의 `setAdmin` 액션으로만 변경하고 감사 로그를 남긴다.
