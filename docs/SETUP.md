# Setup & Installation

## Prerequisites

- Node.js 22 이상
- Google OAuth 2.0 client
- 공지 메일 발송용 Google Workspace 계정과 Gmail API refresh token
- AWS S3 data/assets buckets, CloudFront distribution, Vercel OIDC runtime role
- Vercel과 GitHub Actions에 등록할 동일한 `CRON_SECRET`

## Install

```bash
git clone https://github.com/snumps-webpage/webpage.git
cd webpage
npm install
```

## Environment

`.env.example`을 복사해 로컬 `.env`를 만들고 다음 값을 설정한다.

```env
AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ADMIN_REFRESH_TOKEN=
ADMINS_EMAILS=

AWS_REGION=ap-northeast-2
S3_DATA_BUCKET=snumps-data-private
S3_ASSETS_BUCKET=snumps-assets
ASSETS_CDN_URL=https://<cloudfront-domain>
CRON_SECRET=
```

런타임 AWS 접근은 장기 access key 대신 Vercel OIDC 역할을 사용한다. IAM의 정확한 최소 권한은
[`IMPLEMENTATION-SPEC.md`](./spec/IMPLEMENTATION-SPEC.md)의 BE-02 인벤토리를 따른다. Notion 환경변수와
기존 관리자 권한 이메일 목록은 사용하지 않는다. 관리자 권한은 `members.isAdmin`이 단일 원천이다.

## Gmail API

1. Google Cloud project에서 Gmail API를 활성화한다.
2. 발송 계정으로 `gmail.send` scope를 승인하고 refresh token을 발급한다.
3. `ADMIN_REFRESH_TOKEN`을 런타임 secret으로 등록한다.
4. `ADMINS_EMAILS`에는 권한이 아니라 운영 알림 수신 주소만 쉼표로 구분해 넣는다.

전체 회원 공지는 Bcc 배치 전송을 사용한다. 일일 수신자 한도가 낮은 소비자 `gmail.com` 계정이
아니라 Google Workspace 발송 계정을 사용한다. 세미나는 승인 시 `일정 추후 안내`, 최초 공개 시
확정 일정, 공개 후 일정 변경·취소 시 후속 메일을 보낸다. 비공개 저장과 동일 값 재저장에는 보내지 않는다.

## Cron

- 주 실행: `.github/workflows/cron-sync-events.yml`, 매시 17분
- 백업: `vercel.json`, 매일 15:00 UTC
- 양쪽에 동일한 `CRON_SECRET`을 등록한다.
- endpoint는 `Authorization: Bearer <CRON_SECRET>`만 허용하고 query string secret은 받지 않는다.

## Development

```bash
npm run dev
npm run check
npx vitest run
npm run build
```

백엔드 연결 전에는 `?dev_preview=member` 또는 `?dev_preview=admin` 프리뷰로 화면 흐름을 검증한다.
프리뷰가 아닌 프로덕션 데이터 경로는 AWS API가 연결될 때까지 503을 반환한다.
