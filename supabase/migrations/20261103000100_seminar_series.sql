-- Existing seminars remain the sessions: no event/activity/request/asset is moved.
-- A deterministic parent id makes retries and old writers that omit new fields safe.
create or replace function flow_link_seminar_series(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  sessions jsonb;
  parents jsonb;
  s jsonb;
  next_sessions jsonb := '[]'::jsonb;
  parent_id text;
  changed boolean := false;
  parent_changed boolean := false;
begin
  perform app_lock(array['seminar-series','seminars']);
  sessions := app_rows('seminars'); parents := app_rows('seminar-series');
  for s in select value from jsonb_array_elements(sessions) loop
    parent_id := coalesce(nullif(s->>'seriesId',''), s->>'id');
    if app_find(parents,parent_id) is null then
      parents := parents || jsonb_build_array(jsonb_build_object(
        'id',parent_id,'title',s->>'title','description',coalesce(s->>'description','')));
      parent_changed := true;
    end if;
    if nullif(s->>'seriesId','') is null or s->>'sessionNo' is null then
      s := s || jsonb_build_object('seriesId',parent_id,'sessionNo',coalesce((s->>'sessionNo')::integer,1));
      changed := true;
    end if;
    next_sessions := next_sessions || jsonb_build_array(s);
  end loop;
  if parent_changed then perform app_put('seminar-series',parents); end if;
  if changed then perform app_put('seminars',next_sessions); end if;
  return jsonb_build_object('touched',jsonb_build_array('seminar-series','seminars'));
end $$;

-- Direct record creation: both records commit or neither does.
create or replace function flow_create_standalone_seminar(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare s jsonb := p->'seminar';
begin
  perform app_require(s,array['id','title']);
  perform app_lock(array['seminar-series','seminars']);
  if app_find(app_rows('seminars'),s->>'id') is not null then raise exception 'CONFLICT'; end if;
  s := s || jsonb_build_object('seriesId',s->>'id','sessionNo',1);
  perform app_put('seminars',app_rows('seminars') || jsonb_build_array(s));
  perform flow_link_seminar_series('{}'::jsonb);
  return jsonb_build_object('touched',jsonb_build_array('seminars','seminar-series'),'seminar',s);
end $$;

-- Preserve the established approval transaction, but include its new parent in
-- that same transaction. Lock the union in the global ordering before delegating.
-- Rename only once, so replaying this migration never wraps the wrapper.
do $$ begin
  if to_regprocedure('app_approve_seminar_request_without_series(jsonb)') is null then
    alter function flow_approve_seminar_request(jsonb) rename to app_approve_seminar_request_without_series;
  end if;
end $$;
create or replace function flow_approve_seminar_request(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare result jsonb;
begin
  perform app_lock(array['seminar-requests','seminar-series','seminars']);
  result := app_approve_seminar_request_without_series(p);
  perform flow_link_seminar_series('{}'::jsonb);
  return result || jsonb_build_object('touched',coalesce(result->'touched','[]'::jsonb) || jsonb_build_array('seminar-series','seminars'));
end $$;

-- Administrative operations recheck the actor on the stored member, under lock.
create or replace function flow_admin_seminar_series(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  op text := p->>'operation';
  actor jsonb;
  parent jsonb;
  session jsonb;
  event jsonb;
  activity jsonb;
  parent_id text := p->>'seriesId';
  number integer;
  selected jsonb;
  touched jsonb := '[]'::jsonb;
begin
  perform app_require(p,array['actorMemberId','auditId','auditAt','operation']);
  perform app_lock(array['activities','events','members','seminar-series','seminars']);
  actor := app_find(app_rows('members'),p->>'actorMemberId');
  if actor is null or not coalesce((actor->>'isAdmin')::boolean,false)
     or actor->>'status'='withdrawn' then raise exception 'FORBIDDEN'; end if;
  if op='create' then
    parent := p->'series'; parent_id := parent->>'id';
    perform app_require(parent,array['id','title']);
    if app_find(app_rows('seminar-series'),parent_id) is not null then raise exception 'CONFLICT'; end if;
    perform app_put('seminar-series',app_rows('seminar-series') || jsonb_build_array(parent));
    touched := jsonb_build_array('seminar-series');
  else
    parent := app_find(app_rows('seminar-series'),parent_id);
    if parent is null then raise exception 'NOT_FOUND'; end if;
    if op='update' then
      parent := parent || (p->'patch');
      perform app_put('seminar-series',app_replace(app_rows('seminar-series'),parent_id,parent));
      touched := jsonb_build_array('seminar-series');
    elsif op='session' then
      session := p->'seminar';
      perform app_require(session,array['id']);
      if app_find(app_rows('seminars'),session->>'id') is not null then raise exception 'CONFLICT'; end if;
      if exists(select 1 from jsonb_array_elements(session->'presenterIds') id
        where not exists(select 1 from jsonb_array_elements(app_rows('members')) m
          where m->'id'=id and m->>'status'<>'withdrawn')) then raise exception 'VALIDATION_FAILED'; end if;
      select coalesce(max((s->>'sessionNo')::integer),0)+1 into number
        from jsonb_array_elements(app_rows('seminars')) s where s->>'seriesId'=parent_id;
      session := session || jsonb_build_object('seriesId',parent_id,'sessionNo',number,
        'title',coalesce(nullif(session->>'title',''),(parent->>'title') || ' ' || number || '회차'));
      perform app_put('seminars',app_rows('seminars') || jsonb_build_array(session));
      touched := jsonb_build_array('seminars');
    elsif op='attendance' then
      session := app_find(app_rows('seminars'),p->>'seminarId');
      if session is null or session->>'seriesId' is distinct from parent_id then raise exception 'NOT_FOUND'; end if;
      if session->>'publicationStatus'='cancelled' then raise exception 'CONFLICT'; end if;
      activity := app_find(app_rows('activities'),session->>'activityId');
      if activity is null then raise exception 'NOT_FOUND'; end if;
      if not exists(select 1 from jsonb_array_elements(app_rows('events')) e
        where e->>'activityId'=activity->>'id' and app_nullable(e->'studyId') is null) then raise exception 'CONFLICT'; end if;
      selected := p->'attendeeIds';
      if jsonb_typeof(selected) is distinct from 'array' then raise exception 'VALIDATION_FAILED'; end if;
      if exists(select 1 from jsonb_array_elements(selected) id
        where jsonb_typeof(id)<>'string' or not (
          exists(select 1 from jsonb_array_elements(app_rows('members')) m where m->'id'=id)
          or exists(select 1 from jsonb_array_elements(app_rows('legacy-members')) m where m->'id'=id)
          or (activity->'attendeeIds') @> jsonb_build_array(id))) then raise exception 'VALIDATION_FAILED'; end if;
      select coalesce(jsonb_agg(id),'[]'::jsonb) into selected from (select distinct value id from jsonb_array_elements(selected)) ids;
      activity := activity || jsonb_build_object('attendeeIds',selected);
      perform app_put('activities',app_replace(app_rows('activities'),activity->>'id',activity));
      touched := jsonb_build_array('activities');
    else raise exception 'VALIDATION_FAILED'; end if;
  end if;
  perform app_audit(p->>'auditId',p->>'auditAt',p->>'actorMemberId',
    'seminar-series.' || op,'seminar-series',parent_id);
  return jsonb_build_object('touched',touched,'series',parent,'seminar',session);
end $$;

-- During a rolling release the previous schema strips unknown fields when it
-- writes the whole document. Preserve only the session metadata already stored;
-- this trigger writes no other table and does not change old flow touched lists.
create or replace function app_preserve_seminar_session_metadata() returns trigger
language plpgsql set search_path = public as $$
declare s jsonb; previous jsonb; rows_out jsonb := '[]'::jsonb;
begin
  if new.name <> 'seminars' then return new; end if;
  for s in select value from jsonb_array_elements(new.doc->'rows') loop
    previous := app_find(old.doc->'rows',s->>'id');
    if previous is not null then
      if nullif(s->>'seriesId','') is null and previous->>'seriesId' is not null then
        s := s || jsonb_build_object('seriesId',previous->'seriesId','sessionNo',previous->'sessionNo');
      elsif s->>'sessionNo' is null and previous->>'sessionNo' is not null then
        s := s || jsonb_build_object('sessionNo',previous->'sessionNo');
      end if;
    end if;
    rows_out := rows_out || jsonb_build_array(s);
  end loop;
  new.doc := jsonb_set(new.doc,'{rows}',rows_out);
  return new;
end $$;
drop trigger if exists preserve_seminar_session_metadata on app_tables;
create trigger preserve_seminar_session_metadata before update on app_tables
for each row execute function app_preserve_seminar_session_metadata();

select flow_link_seminar_series('{}'::jsonb);

do $$ declare f text; begin
  foreach f in array array['flow_link_seminar_series(jsonb)','flow_create_standalone_seminar(jsonb)',
    'flow_approve_seminar_request(jsonb)','app_approve_seminar_request_without_series(jsonb)',
    'flow_admin_seminar_series(jsonb)','app_preserve_seminar_session_metadata()'] loop
    execute format('revoke all on function %s from public',f);
    if exists(select 1 from pg_roles where rolname='service_role') then
      execute format('revoke all on function %s from anon, authenticated',f);
      execute format('grant execute on function %s to service_role',f);
    end if;
  end loop;
end $$;
