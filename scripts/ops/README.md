# 운영 스크립트 — 무엇이 필요한가

전부 `node scripts/ops/<이름>.mjs`로 바로 돈다. 빌드 단계도, 전역 설치도 없다.
다만 **아무것도 없는 환경에서 전부 도는 것은 아니다** — 무엇을 건드리느냐에 따라
필요한 것이 다르다. 아래가 그 전부다.

아래 표에 있는 것들은 **필요한 것이 없으면 한 줄로 말하고 종료한다.** 스택
트레이스나 66줄짜리 실패 표를 뱉지 않는다. 표 밖의 것들은 그렇지 않다 —
맨 아래를 볼 것.

## 요구사항 표

| 스크립트                           | Node만 | `npm ci` | `.env`/환경변수          | 그 밖에           |
| ---------------------------------- | :----: | :------: | ------------------------ | ----------------- |
| `lib-env.mjs` (공용)               |   ✅   |          |                          |                   |
| `lib-xlsx.mjs` (공용)              |   ✅   |          |                          |                   |
| `ops-env-names.mjs`                |   ✅   |          |                          | `.env` 파일       |
| `ops-notion-inspect.mjs`           |   ✅   |          | `NOTION_API_KEY`+`_DB_*` |                   |
| `ops-notion-seminar-pages.mjs`     |   ✅   |          | 〃                       |                   |
| `ops-render-check.mjs`             |   ✅   |          |                          | **크로미움**+서버 |
| `ops-smoke-all.mjs`                |        |    ○     | Supabase(동적 경로용)    | **서버**          |
| `ops-backup-db.mjs`                |        |    ✅    | Supabase                 |                   |
| `ops-export-members.mjs`           |        |    ✅    | Supabase                 |                   |
| `ops-assets-private.mjs`           |        |    ✅    | Supabase                 |                   |
| `ops-repair-seminar-schedules.mjs` |        |    ✅    | Supabase                 |                   |
| `ops-notion-backfill-seminars.mjs` |        |    ✅    | Supabase + Notion        |                   |
| `ops-migration-audit.mjs`          |        |    ○     | Notion (+Supabase 선택)  |                   |

○ = 있으면 더 보고, 없으면 그만큼만 보고한다.

## 왜 `npm ci`가 필요한가

Supabase를 건드리는 것들은 `@supabase/supabase-js`를 쓴다 — 이미 이 프로젝트의
의존성이므로 **리포에서 한 번 `npm ci`** 하면 끝이다. 전역 설치도, 별도 패키지도
없다. 없으면 "`npm ci` 를 먼저 실행할 것"이라고 말하고 멈춘다.

엑셀 출력은 의존성이 **없다** — `lib-xlsx.mjs`가 OOXML을 직접 쓴다.

## 자격증명

`.env`(리포 루트)를 자동으로 읽는다. **다만 이 리포의 `.env`에는 `NOTION_*`과
앱 인증 값만 있고 `SUPABASE_*`는 없다** — Notion 쪽은 그냥 돌아가지만, Supabase
쪽은 앞에 붙여 주어야 한다:

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SECRET_KEY=<service_role 또는 sb_secret> \
  node scripts/ops/ops-backup-db.mjs
```

Supabase 키는 CLI에서 꺼내는 쪽이 낫다(값이 화면에 찍히지 않게 명령 치환으로):

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SECRET_KEY="$(supabase projects api-keys --project-ref <ref> -o json \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);process.stdout.write(j.find(k=>k.name==='service_role').api_key)})")" \
  node scripts/ops/ops-migration-audit.mjs --skip-notion
```

`.env`에 어떤 이름이 들어 있는지는 **값을 보지 않고** 확인할 수 있다:

```bash
node scripts/ops/ops-env-names.mjs SUPABASE
```

## 개인정보

`ops-backup-db.mjs`와 `ops-export-members.mjs`의 산출물에는 이메일·전화번호·학번이
들어 있다. 저장 위치(`backups/`, `exports/`)는 `.gitignore`에 있고, 두 스크립트 모두
**값을 화면에 찍지 않으며** 기존 파일을 덮어쓰지 않는다.

## 운영 데이터를 바꾸는 것

셋뿐이고, 전부 **미리보기가 기본**이다. 바꾸려면 인자를 명시해야 한다.

| 스크립트                           | 바꾸는 인자 |
| ---------------------------------- | ----------- |
| `ops-repair-seminar-schedules.mjs` | `apply`     |
| `ops-notion-backfill-seminars.mjs` | `apply`     |
| `ops-assets-private.mjs`           | `--apply`   |

표에 있는 나머지는 전부 읽기 전용이다.

## 표에 없는 것들

`scripts/ops/`에는 위 표 밖에도 16개가 더 있다 — `ops-legacy-split`,
`ops-inherit-legacy`, `ops-clean-applications`, `ops-t3-gate`, `ops-check-*`,
`ops-verify-*`, `ops-diag-signup`, `ops-analyze-dash`, `ops-app-row`,
`ops-backfill-seminar-schedule`, `ops-fix-legacy-refresh`,
`ops-strip-probe-check`, `forge-session`.

이들은 **한 번 쓰고 남긴 일회성 스크립트**다. 당시의 한 번을 위해 쓰였고, 그
뒤로 손보지 않았다. 구체적으로:

- `@supabase/supabase-js`를 최상단에서 정적으로 import 한다 — `node_modules`가
  없으면 안내가 아니라 모듈 스택이 나온다.
- 일부는 **운영 데이터를 미리보기 없이 바로 쓴다.** 무엇을 하는지 파일 첫머리를
  읽지 않고 돌리지 말 것.

지금 필요해서 다시 쓰게 되거든, 위 표의 것들처럼 `requireSupabase()`를 쓰도록
고치고 표에 올릴 것.
