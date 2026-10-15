-- ============================================================================
-- 20261015000000_activity_study_link.sql — activities.studyId
--
-- Decision : 2026-10-14 — an activity can belong to a study: activities gain
--            a nullable `studyId` (docs/plans/2026-10-14-member-activity.md,
--            Task 1). ActivitySchema requires the key and stored rows must
--            not rely on a schema default (expect-tables-valid.ts), so:
--              1. every existing activity row lacking the key gets the
--                 studyId of the attendance event hung off it (the first in
--                 the events document with a non-null studyId), else null —
--                 a written value is kept;
--              2. flow_create_study_session writes the session's study and
--                 flow_publish_seminar writes null into the activity it
--                 creates (otherwise unchanged from
--                 20260928000000_atomic_flows.sql);
--              3. flow_set_activity_study links an activity to a study or
--                 unlinks it. Which activity types may be linked is the
--                 caller's rule, not this function's;
--              4. flow_delete_study also refuses while an activity is
--                 linked to the study (snumps-webpage/D-000059).
-- Run on   : BOTH prod and dev. Order-independent with the code: the old
--            code drops the unknown key when it rewrites the table, so
--            release-prod.sh re-runs step 1 after the deploy (BACKFILLS).
--            Idempotent — touches the document only while a row lacks it.
-- ============================================================================

update app_tables
   set doc = jsonb_set(doc, '{rows}', (
         select coalesce(jsonb_agg(
                  case when a ? 'studyId' then a
                       else a || jsonb_build_object('studyId', (
                              select e -> 'studyId'
                                from app_tables t,
                                     jsonb_array_elements(t.doc -> 'rows') with ordinality as y(e, m)
                               where t.name = 'events'
                                 and e ->> 'activityId' = a ->> 'id'
                                 and jsonb_typeof(e -> 'studyId') = 'string'
                               order by m
                               limit 1)) end
                  order by n), '[]'::jsonb)
           from jsonb_array_elements(doc -> 'rows') with ordinality as x(a, n))),
       version = version + 1
 where name = 'activities'
   and exists (select 1 from jsonb_array_elements(doc -> 'rows') a
                where not a ? 'studyId');

-- Publish a seminar — as 20260928000000_atomic_flows.sql, plus the null study
-- on the activity it creates.
create or replace function flow_publish_seminar(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_id       text := p ->> 'id';
  v_anchor   text := 'seminar:' || (p ->> 'id');
  v_seminars jsonb;
  v_sem      jsonb;
  v_sched    jsonb;
  v_date     jsonb;
  v_acts     jsonb;
  v_act      jsonb;
  v_events   jsonb;
  v_event    jsonb;
  v_claimed  boolean := false;
  v_touched  text[] := array['seminars'];
begin
  perform app_require(p, array['id', 'now', 'activityId', 'eventId', 'pathId', 'attendCode']);
  perform app_lock(array['activities', 'events', 'seminars']);
  v_seminars := app_rows('seminars');
  v_sem := app_find(v_seminars, v_id);
  if v_sem is null then raise exception 'NOT_FOUND'; end if;
  v_sched := app_nullable(v_sem -> 'schedule');
  -- a legacy published row that lost its schedule cannot be published again
  if app_seminar_status(v_sem) not in ('scheduled', 'published') or v_sched is null then
    raise exception 'CONFLICT';
  end if;

  if app_seminar_status(v_sem) = 'scheduled' then
    v_sem := v_sem || jsonb_build_object(
      'publicationStatus', 'published',
      'semester', case when app_may_derive_semester(v_sem)
                       then app_term_of(v_sched ->> 'startsAt')
                       else v_sem ->> 'semester' end);
  end if;
  v_date := jsonb_build_object(
    'start', v_sched -> 'startsAt',
    'end', coalesce(v_sched -> 'endsAt', 'null'::jsonb));

  -- The seminar's own link wins: migrated seminars are published with an
  -- activityId and no anchor, and looking up by anchor alone created a second
  -- activity and event on every "공지 재발송" (audit LA43-1).
  v_acts := app_rows('activities');
  v_act := app_find(v_acts, v_sem ->> 'activityId');
  if v_act is null then
    select a into v_act from jsonb_array_elements(v_acts) a
     where a ->> 'sourceRequestId' = v_anchor limit 1;
  end if;
  if v_act is null then
    -- presenters are participants of their own seminar
    v_act := jsonb_build_object(
      'id', p ->> 'activityId',
      'title', v_sem ->> 'title',
      'date', v_date,
      'type', '세미나',
      'attendeeIds', coalesce(v_sem -> 'presenterIds', '[]'::jsonb),
      'studyId', null,
      'sourceRequestId', v_anchor);
    perform app_put('activities', v_acts || jsonb_build_array(v_act));
    v_touched := v_touched || array['activities'];
  end if;

  v_events := app_rows('events');
  select e into v_event from jsonb_array_elements(v_events) e
   where e ->> 'sourceRequestId' = v_anchor limit 1;
  if v_event is null then
    -- a migrated seminar's attendance event hangs off its activity
    select e into v_event from jsonb_array_elements(v_events) e
     where e ->> 'activityId' = v_act ->> 'id' and app_nullable(e -> 'studyId') is null
     limit 1;
  end if;
  if v_event is null then
    v_event := jsonb_build_object(
      'id', p ->> 'eventId',
      'title', v_sem ->> 'title',
      'date', v_date,
      'type', '세미나',
      'status', 'active',
      'pathId', p ->> 'pathId',
      'attendCode', p ->> 'attendCode',
      'activityId', v_act ->> 'id',
      'applicantIds', '[]'::jsonb,
      'presenterIds', coalesce(v_sem -> 'presenterIds', '[]'::jsonb),
      'studyId', null,
      'sessionNo', null,
      'autoGenerated', false,
      'sourceRequestId', v_anchor);
    perform app_put('events', v_events || jsonb_build_array(v_event));
    v_touched := v_touched || array['events'];
  end if;

  v_sem := v_sem || jsonb_build_object('activityId', v_act ->> 'id');
  -- announcedAt means "the announcement went out" — so it is claimed only
  -- when one will: a seminar published with a past date is a record fix,
  -- announced by nobody. Stamping it anyway made a later move to a future
  -- date send "schedule changed" for a seminar never announced (audit LB30-1).
  -- Nor for a seminar that is no announcement target (announce = false: made
  -- by "기록 직접 생성", #21) — and since announcedAt then stays null, its
  -- schedule changes and cancellation send nothing either. A row without the
  -- key predates it and was a target (migration 20260928000300).
  if v_sem ->> 'announcedAt' is null
     and coalesce((v_sem ->> 'announce')::boolean, true)
     and (v_sched ->> 'startsAt')::timestamptz > (p ->> 'now')::timestamptz then
    v_sem := v_sem || jsonb_build_object('announcedAt', p ->> 'now');
    v_claimed := true;
  end if;
  perform app_put('seminars', app_replace(v_seminars, v_id, v_sem));

  return jsonb_build_object(
    'touched', to_jsonb(v_touched),
    'seminar', v_sem,
    'activityId', v_act ->> 'id',
    'eventId', v_event ->> 'id',
    'claimed', v_claimed);
end $$;

-- Create a study session — as 20260928000000_atomic_flows.sql, plus the
-- session's study on the activity it creates.
create or replace function flow_create_study_session(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_study_id text := p ->> 'studyId';
  v_key      text := (p ->> 'studyId') || ':' || (p ->> 'date');
  v_study    jsonb;
  v_events   jsonb;
  v_event    jsonb;
  v_acts     jsonb;
  v_act      jsonb;
  v_no       int;
  v_title    text;
  v_touched  text[] := '{}';
begin
  perform app_require(p, array['studyId', 'date', 'activityId', 'eventId', 'pathId', 'attendCode']);
  perform app_lock(array['activities', 'events', 'studies']);
  v_study := app_find(app_rows('studies'), v_study_id);
  if v_study is null then raise exception 'NOT_FOUND'; end if;
  -- a closed study is immutable (#4/#20, audit LB31-2)
  if v_study ->> 'status' in ('finished', 'cancelled') then
    raise exception 'CONFLICT' using detail = 'study-' || (v_study ->> 'status');
  end if;

  v_events := app_rows('events');
  select e into v_event from jsonb_array_elements(v_events) e
   where e ->> 'sourceRequestId' = v_key limit 1;
  if v_event is not null and v_event ->> 'status' = 'cancelled' then
    raise exception 'CONFLICT' using detail = 'session-slot-cancelled';
  end if;
  if v_event is not null then
    return jsonb_build_object('touched', '[]'::jsonb, 'event', v_event);
  end if;

  select coalesce(max((e ->> 'sessionNo')::int), 0) + 1 into v_no
    from jsonb_array_elements(v_events) e
   where e ->> 'studyId' = v_study_id;
  v_title := coalesce(nullif(p ->> 'title', ''), (v_study ->> 'title') || ' ' || v_no || '회차');

  v_acts := app_rows('activities');
  select a into v_act from jsonb_array_elements(v_acts) a
   where a ->> 'sourceRequestId' = v_key limit 1;
  if v_act is null then
    v_act := jsonb_build_object(
      'id', p ->> 'activityId',
      'title', v_title,
      'date', jsonb_build_object('start', p ->> 'date', 'end', null),
      'type', '스터디',
      'attendeeIds', '[]'::jsonb,
      'studyId', p ->> 'studyId',
      'sourceRequestId', v_key);
    perform app_put('activities', v_acts || jsonb_build_array(v_act));
    v_touched := v_touched || array['activities'];
  end if;

  v_event := jsonb_build_object(
    'id', p ->> 'eventId',
    'title', v_title,
    'date', jsonb_build_object('start', p ->> 'date', 'end', null),
    'type', '스터디',
    'status', 'active',
    'pathId', p ->> 'pathId',
    'attendCode', p ->> 'attendCode',
    'activityId', v_act ->> 'id',
    'applicantIds', '[]'::jsonb,
    'presenterIds', '[]'::jsonb,
    'studyId', v_study_id,
    'sessionNo', v_no,
    'autoGenerated', coalesce((p ->> 'autoGenerated')::boolean, false),
    'sourceRequestId', v_key);
  perform app_put('events', v_events || jsonb_build_array(v_event));
  v_touched := v_touched || array['events'];

  return jsonb_build_object('touched', to_jsonb(v_touched), 'event', v_event);
end $$;

-- Link an activity to a study, or unlink it (studyId null). The key must be
-- given: a call that left it out would otherwise unlink silently. A missing
-- activity or a named study that does not exist is NOT_FOUND, its detail
-- naming which ('activity' / 'study') so the admin screen can say it
-- (snumps-webpage/D-000062). The activity's type is not checked here — that
-- rule belongs to the caller.
--   p = { activityId, studyId | null }  → { touched }
create or replace function flow_set_activity_study(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_id    text := p ->> 'activityId';
  v_study text := p ->> 'studyId';
  v_acts  jsonb;
  v_act   jsonb;
begin
  perform app_require(p, array['activityId']);
  if not p ? 'studyId' then
    raise exception 'VALIDATION_FAILED' using detail = 'missing-studyId';
  end if;
  perform app_lock(array['activities', 'studies']);
  v_acts := app_rows('activities');
  v_act := app_find(v_acts, v_id);
  if v_act is null then raise exception 'NOT_FOUND' using detail = 'activity'; end if;
  if v_study is not null and app_find(app_rows('studies'), v_study) is null then
    raise exception 'NOT_FOUND' using detail = 'study';
  end if;
  perform app_put('activities', app_replace(v_acts, v_id,
    v_act || jsonb_build_object('studyId', v_study)));
  return jsonb_build_object('touched', jsonb_build_array('activities'));
end $$;

-- Delete a study — as 20260928000000_atomic_flows.sql, plus: refused while an
-- activity is linked to it (activity.studyId), like a study with sessions,
-- checked under the same lock (snumps-webpage/D-000059). Otherwise the link
-- would point at a study that no longer exists; the admin unlinks first.
create or replace function flow_delete_study(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_id      text := p ->> 'id';
  v_studies jsonb;
  v_study   jsonb;
begin
  perform app_require(p, array['id']);
  perform app_lock(array['activities', 'events', 'studies']);
  if exists (select 1 from jsonb_array_elements(app_rows('events')) e where e ->> 'studyId' = v_id)
     or exists (select 1 from jsonb_array_elements(app_rows('activities')) a where a ->> 'studyId' = v_id)
  then
    raise exception 'CONFLICT';
  end if;
  v_studies := app_rows('studies');
  v_study := app_find(v_studies, v_id);
  if v_study is null then raise exception 'NOT_FOUND'; end if;
  perform app_put('studies', app_without(v_studies, 'id', v_id));
  return jsonb_build_object(
    'touched', jsonb_build_array('studies'),
    'assets', coalesce(v_study -> 'photos', '[]'::jsonb));
end $$;


-- create or replace keeps the functions' grants, and the new one has the
-- default (PUBLIC execute); state them so no flow runs for anon/authenticated
-- (as section 99 of atomic_flows). (Guarded: PGlite has no Supabase roles.)
do $$
declare
  f text;
begin
  foreach f in array array[
    'flow_publish_seminar(jsonb)',
    'flow_create_study_session(jsonb)',
    'flow_set_activity_study(jsonb)',
    'flow_delete_study(jsonb)'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('revoke all on function %s from anon, authenticated', f);
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
