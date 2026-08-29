# 데이터 이주 스크립트 (Notion → Supabase)

`docs/spec/SUPABASE-MIGRATION-SPEC.md` T9 / §8 M-1~5 구현.
전부 로컬에서 `npx tsx`로 실행하는 독립 스크립트다 — src/를 import하지 않는다.

## 실행 순서

```bash
npx tsx scripts/migration/00-dump.ts           # 1. 전 Notion DB 원본 덤프 (로컬 + backups 버킷)
npx tsx scripts/migration/10-assets.ts         # 2. 파일 자산 → assets 버킷 (+ backups 미러, manifest)
npx tsx scripts/migration/20-export-tables.ts  # 3. §9 변환 규칙 적용 → app_tables UPSERT (version=1)
npx tsx scripts/migration/30-verify.ts         # 4. 행 수·dangling 0·자산 대조 — 실패 시 exit 1
```

- 순서 고정: 10은 00의 덤프를, 20은 00의 덤프와 10의 manifest를, 30은 전부를 전제한다.
- `--dump <dir>`로 특정 덤프 디렉터리를 지정할 수 있다 (기본: `out/`의 최신 `dump-*`).
- 전 스크립트 **멱등**: 자산은 sha256 일치 시 스킵, 익스포트는 전체 재생성,
  id는 `out/id-map.json`으로 고정(재실행해도 같은 Notion 레코드는 같은 id).
- `20`은 app_tables의 `version > 1`(운영 중 쓰기 흔적) 행을 발견하면 중단한다 —
  라이브 데이터를 정말 덮어쓰려면 `--force`.
- `20`의 구조 검증은 근사치다. 권위 있는 Zod 게이트는 앱 스키마 —
  `pnpm exec vitest run src/lib/server/data` 로 별도 확인할 것.

## 필요한 env

`.env`(리포 루트)가 있으면 자동으로 읽는다 (이미 설정된 process.env 우선).

| 변수                                                                                                                                                                                                                                    | 용도                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `SUPABASE_URL` / `SUPABASE_SECRET_KEY`                                                                                                                                                                                                  | **prod** 프로젝트 (`sb_secret_...`) — 전 스크립트              |
| `SUPABASE_ASSETS_BUCKET` / `SUPABASE_BACKUPS_BUCKET`                                                                                                                                                                                    | 기본 `assets` / `backups`                                      |
| `NOTION_API_KEY`                                                                                                                                                                                                                        | 00·10 (원본 조회 — 10은 서명 URL 재발급을 위해 신규 조회 필수) |
| `NOTION_DB_MEMBERS` `NOTION_DB_PRIVATE_INFO` `NOTION_DB_ACTIVITIES` `NOTION_DB_EVENTS` `NOTION_DB_ATTENDANCE_QUEUE` `NOTION_DB_APPLICATIONS` `NOTION_DB_SEMINARS` `NOTION_DB_SEMINAR_REQUESTS` `NOTION_DB_SETTINGS` `NOTION_DB_STUDIES` | 덤프 대상 (없는 env는 건너뛰고 보고)                           |
| `ADMINS_EMAILS`                                                                                                                                                                                                                         | 20 — isAdmin 대조 (콤마 구분 이메일 목록)                      |

자격증명 규율 (M-1): prod `sb_secret` 키는 실행자에게 한정 전달하고 **이주 완료 후 회전**한다.

## PII 취급 주의

- `out/` 산출물(덤프·assets-manifest·tables·id-map)에는 이메일·전화번호·배경 지식·인물 사진 등
  **개인정보가 그대로** 들어 있다.
- `scripts/migration/out/` 은 `.gitignore` 대상 — **절대 커밋 금지**.
- backups 버킷의 `notion-dump/` `assets-mirror/` 는 private 버킷이어야 한다 (§4-1).
- 이주 완료 후 로컬 `out/` 사본은 파기하거나 오프라인 보관처로 옮길 것.

## 산출물 (`out/` — gitignored)

| 경로                             | 내용                                                      |
| -------------------------------- | --------------------------------------------------------- |
| `out/dump-<timestamp>/<db>.json` | Notion 원본 덤프 (M-2, backups 버킷에도 동일 사본)        |
| `out/assets-manifest.json`       | `{ notionUrlHash → { key, sha256, bytes, contentType } }` |
| `out/id-map.json`                | Notion page id → 신규 앱 id (생성·재사용)                 |
| `out/tables/<name>.json`         | 업로드한 봉투 사본 (수동 검수·Zod 게이트용)               |
