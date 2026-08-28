# 운영자 작업 목록 (Operator TODO)

> **이 문서의 성격**: 코드가 아니라 **사람(운영자)이 직접 해야 하는 셋업·운영 작업**의 살아있는 목록.
> 구현이 진행되며 새 작업이 생기면 여기에 추가되고, 완료하면 체크한다.
> 각 작업은 "왜 필요한지 + 정확히 어떻게 하는지"를 함께 적는다.

## 상태 요약

| # | 작업 | 상태 | 막고 있는 것 |
|---|---|---|---|
| 1 | AWS 계정 생성 | ⬜ 미완 | M3 이후 전부 (인프라 없이는 데이터 이주 불가) |
| 2 | Terraform 설치·적용 | ⬜ 미완 (1 선행) | 〃 |
| 3 | Vercel OIDC 활성화 | ⬜ 미완 (2 선행) | 런타임의 AWS 접근 |
| 4 | `CRON_SECRET` 생성·등록 | ⬜ 미완 | 크론 동작 (현재 fail-closed로 501) |
| 5 | Gmail 발신 계정 확인 | ⬜ 미완 | 전 회원 공지 메일 (M4) |

---

## 1. AWS 계정 생성

**왜**: 데이터 저장소(S3)·CDN(CloudFront)·감사 로그가 전부 AWS 위에 만들어진다.

1. https://aws.amazon.com → 계정 생성. **동아리 공용 이메일**(예: snumps0@gmail.com) 사용 권장 — 개인 계정에 묶지 말 것.
2. 결제 수단 등록 필요 (예상 비용 월 $1~3, 예산 알림 $10 — 자동 설정됨).
3. 루트 계정에 **MFA 설정** (콘솔 → IAM → 루트 사용자 MFA). 루트는 이후 사용하지 않는다.
4. **관리용 IAM 사용자 생성**: 콘솔 → IAM → Users → Create user
   - 이름: `snumps-terraform` / "Provide user access to the AWS Management Console" 체크 해제
   - 권한: `AdministratorAccess` 정책 연결 (Terraform 실행용 — 인프라 구축 후 축소 가능)
   - 생성 후 **Security credentials 탭 → Create access key → CLI** 선택 → Access key ID / Secret 저장 (한 번만 표시됨)

## 2. Terraform 설치·적용

**왜**: 버킷·권한·CDN·예산 알림 8~10개 리소스를 콘솔 클릭이 아니라 코드(`infra/`)로 만든다.
재현 가능하고, 리뷰 가능하고, 실수한 설정을 코드 수정으로 고칠 수 있다.

```bash
# ① 설치 (Arch Linux)
sudo pacman -S terraform        # 또는 opentofu

# ② 자격증명 — 1-4에서 만든 키를 환경변수로 (셸 히스토리 주의)
export AWS_ACCESS_KEY_ID=<snumps-terraform 키>
export AWS_SECRET_ACCESS_KEY=<시크릿>
export AWS_REGION=ap-northeast-2

# ③ 적용
cd infra
terraform init                  # 프로바이더 다운로드 (최초 1회)
terraform plan                  # 만들어질 리소스 미리보기 — 여기서 멈추고 검토
terraform apply                 # "yes" 입력 시 실제 생성. 수 분 소요 (CloudFront가 느림)

# ④ 출력 확인
terraform output assets_cdn_domain   # → ASSETS_CDN_URL 값으로 사용
```

- 상태 파일(`terraform.tfstate`)이 `infra/`에 생긴다. **커밋 금지**(.gitignore 처리됨), 분실 금지 —
  이후 원격 상태(S3 backend)로 옮길 예정, 그 전까지 로컬 보관.
- OIDC 미설정 상태로 처음 apply하면 **키 방식 폴백**(`snumps-runtime` IAM 유저)이 만들어진다.
  이 유저의 액세스 키를 발급해 Vercel env에 넣으면 OIDC 전에도 동작한다. 3번 완료 후 재적용하면 역할로 전환됨.

## 3. Vercel OIDC 활성화 (권장 인증 — 장기 비밀 없음)

**왜**: Vercel 함수가 AWS에 접근할 때 영구 액세스 키 대신 단기 토큰을 쓴다. 키 유출 위험 제거.

1. Vercel 대시보드 → `snumps` 프로젝트 → Settings → **OpenID Connect** → Enable
2. 표시되는 **Issuer URL**(예: `https://oidc.vercel.com/<team>`)과 **팀 slug** 기록
3. `infra/`에서 변수 지정 후 재적용:
   ```bash
   terraform apply -var vercel_oidc_issuer="https://oidc.vercel.com/<team>" -var vercel_team_slug="<team>"
   ```
4. 출력된 역할 ARN을 Vercel env에 등록: `AWS_ROLE_ARN=arn:aws:iam::<계정>:role/snumps-runtime`
5. 이제 `AWS_ACCESS_KEY_ID`/`SECRET`는 Vercel env에서 제거 가능

## 4. `CRON_SECRET` 생성·등록

**왜**: `/api/cron/sync-events`가 인증 없이 호출되는 걸 막는다. **현재 코드는 미설정 시 501을 반환**(fail-closed)하므로, 등록 전까지 크론이 동작하지 않는다.

```bash
openssl rand -base64 32          # 생성된 값을 아래 두 곳에 동일하게 등록
```

1. **Vercel** → 프로젝트 Settings → Environment Variables → `CRON_SECRET` (Production)
2. **GitHub** → `snumps-webpage/webpage` → Settings → Secrets and variables → Actions →
   New repository secret → 이름 `CRON_SECRET`

> GitHub Actions 스케줄(`.github/workflows/cron-sync-events.yml`)은 **main에 머지된 후에만** 돈다.

## 5. Gmail 발신 계정 확인

**왜**: 전 회원 공지(M4)는 하루 수신자 한도가 관건 — 소비자 gmail.com은 **일 500명**(공지 2회로 소진),
Google Workspace는 일 2,000명.

- 현재 발신에 쓰는 계정이 Workspace인지 확인. 소비자 계정이면: 공지 발송 빈도를 하루 1회로 제한하거나 Workspace 전환 검토.
- 확인 결과를 이 문서에 기록할 것.

---

## 완료된 작업

(없음)

## 이후 추가될 작업 (예고)

- **M3 데이터 이주 직전**: 프로덕션 Vercel env 사본 전달 (`NOTION_DB_EVENTS`·`NOTION_DB_ATTENDANCE_QUEUE` 실측용), Notion 원본 백업 실행 입회
- **M3**: 정합성 이상 데이터 처리 결정 (주인 없는 개인정보 5건 등 — 동아리 확인 필요)
- **M8 컷오버**: Notion 읽기 전용 전환 시점 결정, `robots.txt` 개방 승인
