# supabase/ — 마이그레이션 적용 가이드

이 디렉터리는 Supabase 프로젝트에 적용하는 SQL 마이그레이션을 담는다.
(명세: `docs/spec/SUPABASE-MIGRATION-SPEC.md` §2-2·§4-1, 작업 T1)

## 2-프로젝트 모델

무료 플랜의 프로젝트 2개를 **prod / dev**로 나눠 쓴다.

| 프로젝트 | 용도 |
|---|---|
| prod | 실서비스 데이터 + Storage |
| dev  | 로컬 개발용 — 동일 스키마 + 시드(`scripts/seed-dev.ts`) |

**모든 마이그레이션은 두 프로젝트 모두에 실행한다.** 파일은 멱등이므로
재실행해도 안전하다.

## 적용 방법 A — 대시보드 SQL Editor (권장, 가장 간단)

1. Supabase 대시보드 → 해당 프로젝트 → **SQL Editor**
2. `migrations/0001_documents.sql` 내용 전체를 붙여넣고 **Run**
3. prod·dev 두 프로젝트에 각각 반복

## 적용 방법 B — Supabase CLI

```bash
supabase link --project-ref <프로젝트-ref>   # 프로젝트별 1회
supabase db push                              # supabase/migrations/ 적용
```

## 적용 후 확인

- Table Editor에 `app_tables`·`app_queues`·`audit_log` 3개 (RLS enabled, 정책 0 — 의도된 deny-all)
- Storage에 `assets`(public)·`staging`(private)·`backups`(private) 버킷 3개
- dev 프로젝트라면 이어서 시드 실행: `npx tsx scripts/seed-dev.ts`
  (`SUPABASE_URL`·`SUPABASE_SECRET_KEY` env 필요)

전체 운영 체크리스트(프로젝트 생성, cron, 백업, pause 런북 등)는
`docs/OPERATOR-TODO.md`를 따른다.
