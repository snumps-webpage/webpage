-- ============================================================================
-- The assets bucket is private (decision C-22): assets are served only through
-- the app's /media/<key> proxy, which decides access per request. The first
-- migration (20260901000000_documents.sql) created the bucket public, and its
-- `on conflict (id) do nothing` never corrects an existing bucket — so an
-- environment built from the migrations was born public until someone ran
-- scripts/ops/ops-assets-private.mjs (audit LA42-1). This file carries the
-- decision; the script stays as the check (it also verifies signed URLs).
--
-- Safe to re-run. On an environment still serving assets publicly
-- (ASSETS_ACCESS=public), remove that setting before applying — see
-- docs/OPERATOR-TODO.md §3-1.
-- ============================================================================

update storage.buckets set public = false where id = 'assets';
