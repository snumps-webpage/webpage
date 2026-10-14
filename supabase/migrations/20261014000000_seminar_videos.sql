-- ============================================================================
-- 20261014000000_seminar_videos.sql — write out seminars.videos
--
-- Decision : 2026-10-14 — a seminar keeps a list of external video links,
--            each { url (https), title (may be empty) }, at most 10
--            (snumps-webpage/D-000010, D-000017). SeminarSchema reads a
--            missing key as [], but stored rows must not rely on a schema
--            default (expect-tables-valid.ts), so:
--              1. every existing seminar row gets "videos": [] when it lacks
--                 the key (or holds a non-array) — a written list is kept;
--              2. flow_approve_seminar_request writes "videos": [] into the
--                 seminar it creates (otherwise unchanged from
--                 20260928000000_atomic_flows.sql).
-- Run on   : BOTH prod and dev. Order-independent with the code: the new
--            code reads a missing key as []; the old code drops the unknown
--            key when it rewrites the table, so release-prod.sh re-runs
--            step 1 after the deploy (BACKFILLS).
--            Idempotent — touches the document only while a row lacks it.
-- ============================================================================

update app_tables
   set doc = jsonb_set(doc, '{rows}', (
         select coalesce(jsonb_agg(
                  case when jsonb_typeof(s -> 'videos') = 'array' then s
                       else s || jsonb_build_object('videos', '[]'::jsonb) end
                  order by n), '[]'::jsonb)
           from jsonb_array_elements(doc -> 'rows') with ordinality as x(s, n))),
       version = version + 1
 where name = 'seminars'
   and exists (select 1 from jsonb_array_elements(doc -> 'rows') s
                where jsonb_typeof(s -> 'videos') is distinct from 'array');

-- Approve a seminar request — as 20260928000000_atomic_flows.sql, plus the
-- seminar's empty video list.
--   p = { id, seminarId, term }  → { request }  (as it was before the flip)
create or replace function flow_approve_seminar_request(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_id       text := p ->> 'id';
  v_requests jsonb;
  v_req      jsonb;
  v_seminars jsonb;
  v_touched  text[] := array['seminar-requests'];
begin
  perform app_require(p, array['id', 'seminarId', 'term']);
  perform app_lock(array['seminar-requests', 'seminars']);
  v_requests := app_rows('seminar-requests');
  v_req := app_find(v_requests, v_id);
  if v_req is null then raise exception 'NOT_FOUND'; end if;
  if v_req ->> 'status' <> 'pending' then raise exception 'CONFLICT'; end if;

  v_seminars := app_rows('seminars');
  if not exists (select 1 from jsonb_array_elements(v_seminars) s
                  where s ->> 'sourceRequestId' = v_id) then
    perform app_put('seminars', v_seminars || jsonb_build_array(jsonb_build_object(
      'id', p ->> 'seminarId',
      'title', v_req -> 'title',
      -- provisional: publication derives the term from the real schedule
      'semester', p ->> 'term',
      'note', v_req -> 'description',
      'description', v_req -> 'description',
      'presenterIds', coalesce(v_req -> 'presenterIds', '[]'::jsonb),
      'externalPresenters', '',
      'materials', '[]'::jsonb,
      'photos', '[]'::jsonb,
      'posterKey', coalesce(v_req -> 'posterKey', '""'::jsonb),
      'preferredTiming', coalesce(v_req -> 'preferredTiming', '""'::jsonb),
      'kind', case when v_req ->> 'kind' in ('regular', 'irregular')
                   then v_req -> 'kind' else 'null'::jsonb end,
      'durationMinutes', null,
      'prerequisites', coalesce(v_req -> 'prerequisites', '""'::jsonb),
      'videos', '[]'::jsonb,
      'announce', true,
      'publicationStatus', 'unscheduled',
      'schedule', null,
      'announcedAt', null,
      'semesterPinned', false,
      'activityId', null,
      'sourceRequestId', v_id)));
    v_touched := v_touched || array['seminars'];
  end if;

  perform app_put('seminar-requests', app_replace(v_requests, v_id,
    v_req || jsonb_build_object('status', 'approved')));
  return jsonb_build_object('touched', to_jsonb(v_touched), 'request', v_req);
end $$;


-- create or replace keeps the function's grants; restate them anyway so the
-- function never runs for anon/authenticated (as section 99 of atomic_flows).
-- (Guarded: PGlite has no Supabase roles.)
do $$
begin
  revoke all on function flow_approve_seminar_request(jsonb) from public;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on function flow_approve_seminar_request(jsonb) from anon, authenticated;
    grant execute on function flow_approve_seminar_request(jsonb) to service_role;
  end if;
end $$;
