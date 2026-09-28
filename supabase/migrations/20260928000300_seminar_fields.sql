-- ============================================================================
-- 20260928000300_seminar_fields.sql — write out the seminar record fields
--
-- Decision : 2026-09-28 — seminars store kind (정기 "regular" / 비정기
--            "irregular" / null = unknown), durationMinutes (number | null),
--            prerequisites (string) and announce (boolean). SeminarSchema
--            requires all four with no zod default (#7, #12, #21).
-- Run on   : BOTH prod and dev, BEFORE deploying the code that requires the
--            fields (that code refuses a seminar row lacking any of them).
--            Idempotent — touches the document only while a row lacks one.
-- Rule     : for a row that lacks a field (or holds a value of the wrong
--            JSON type):
--              kind          — the source request's kind when the seminar has
--                              a request whose kind is regular/irregular
--                              (what approval now copies), else null;
--              prerequisites — the source request's prerequisites when it
--                              has one, else "";
--              durationMinutes — null: the request's duration is free text
--                              ("90분 정도") and is not parsed into minutes;
--              announce      — true: every existing seminar is an
--                              announcement target today (a published row
--                              with announcedAt null and a future date gets
--                              the all-member announcement), and rows the
--                              record editor made cannot be told apart from
--                              migrated ones on disk. New direct records are
--                              written with false by the code.
--            A value already written — null included — is kept.
-- ============================================================================

update app_tables
   set doc = jsonb_set(doc, '{rows}', (
         select coalesce(jsonb_agg(
                  s
                  || case when jsonb_typeof(s -> 'kind') in ('string', 'null') then '{}'::jsonb
                          else jsonb_build_object('kind', (
                                 select q -> 'kind'
                                   from app_tables t, jsonb_array_elements(t.doc -> 'rows') q
                                  where t.name = 'seminar-requests'
                                    and q ->> 'id' = s ->> 'sourceRequestId'
                                    and q ->> 'kind' in ('regular', 'irregular')
                                  limit 1)) end
                  || case when jsonb_typeof(s -> 'prerequisites') = 'string' then '{}'::jsonb
                          else jsonb_build_object('prerequisites', coalesce((
                                 select q -> 'prerequisites'
                                   from app_tables t, jsonb_array_elements(t.doc -> 'rows') q
                                  where t.name = 'seminar-requests'
                                    and q ->> 'id' = s ->> 'sourceRequestId'
                                    and jsonb_typeof(q -> 'prerequisites') = 'string'
                                  limit 1), '""'::jsonb)) end
                  || case when jsonb_typeof(s -> 'durationMinutes') in ('number', 'null') then '{}'::jsonb
                          else jsonb_build_object('durationMinutes', null) end
                  || case when jsonb_typeof(s -> 'announce') = 'boolean' then '{}'::jsonb
                          else jsonb_build_object('announce', true) end
                  order by n), '[]'::jsonb)
           from jsonb_array_elements(doc -> 'rows') with ordinality as x(s, n))),
       version = version + 1
 where name = 'seminars'
   and exists (select 1 from jsonb_array_elements(doc -> 'rows') s
                where jsonb_typeof(s -> 'kind') is distinct from 'string'
                      and jsonb_typeof(s -> 'kind') is distinct from 'null'
                   or jsonb_typeof(s -> 'prerequisites') is distinct from 'string'
                   or jsonb_typeof(s -> 'durationMinutes') is distinct from 'number'
                      and jsonb_typeof(s -> 'durationMinutes') is distinct from 'null'
                   or jsonb_typeof(s -> 'announce') is distinct from 'boolean');
