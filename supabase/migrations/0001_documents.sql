-- ============================================================================
-- 0001_documents.sql — AWS → Supabase 이행 T1
--
-- Purpose : version-CAS JSONB document store (app_tables / app_queues),
--           append-only audit_log, RLS lockdown, and the three Storage buckets.
-- Run via : Supabase SQL editor (dashboard) or CLI (`supabase db push`)
--           on BOTH the prod AND the dev project.
-- Spec    : docs/spec/SUPABASE-MIGRATION-SPEC.md §2-2 (tables/RLS/trigger)
--           and §4-1 (buckets). Idempotent — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Document tables (§2-2)
-- ---------------------------------------------------------------------------

create table if not exists app_tables (
  name    text primary key,
  version bigint not null default 1,
  doc     jsonb  not null              -- { schemaVersion, rows } envelope as-is (no gzip — API-SPEC §1-3 revised)
);

create table if not exists app_queues (
  event_id text primary key,
  version  bigint not null default 1,
  doc      jsonb  not null
);

create table if not exists audit_log (  -- §3. INSERT-only
  id        text primary key,
  at        timestamptz not null default now(),
  actor     text not null,
  action    text not null,
  target_tb text not null,
  target_id text not null,
  detail    jsonb
);

-- ---------------------------------------------------------------------------
-- 2. RLS — enabled on all three tables with ZERO policies. This is DELIBERATE:
--    no policies means deny-all for the anon/authenticated (publishable-key)
--    roles, i.e. the public API surface of these tables is zero. The server is
--    the single access path and uses the sb_secret_... key, which bypasses RLS.
--    Do NOT add policies here.
-- ---------------------------------------------------------------------------

alter table app_tables enable row level security;
alter table app_queues enable row level security;
alter table audit_log  enable row level security;

-- ---------------------------------------------------------------------------
-- 3. audit_log append-only enforcement.
--    A BEFORE UPDATE/DELETE trigger raises on any mutation attempt, protecting
--    destruction evidence even from the secret key (RLS bypass does not bypass
--    triggers) — the equivalent of the old one-object-per-entry semantics.
-- ---------------------------------------------------------------------------

create or replace function audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only: % is not allowed', tg_op;
end;
$$;

drop trigger if exists audit_log_immutable on audit_log;
create trigger audit_log_immutable
  before update or delete on audit_log
  for each row execute function audit_log_immutable();

-- ---------------------------------------------------------------------------
-- 4. Storage buckets (§4-1) — created in SQL to minimize console clicking.
--    assets  : public read (promoted assets + sharp derivatives) — public
--              serving comes solely from public=true.
--    staging : private (upload staging, S6 — no public serving pre-promotion).
--    backups : private (S3 — contains PII; never co-locate with public).
--    Storage RLS note: the server's secret key bypasses storage policies, so
--    NO storage policies are created — deliberate, same rationale as §2 above.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values
  ('assets',  'assets',  true),
  ('staging', 'staging', false),
  ('backups', 'backups', false)
on conflict (id) do nothing;
