-- ============================================================================
-- 20260928000100_seminar_publication_status.sql — write the migration rule out
--
-- Decision : 2026-09-27 — publicationStatus is stored explicitly; the zod
--            default ("published") is removed from SeminarSchema.
-- Run on   : BOTH prod and dev, BEFORE deploying the code without the
--            default (that code refuses a seminar row lacking the key).
--            Idempotent — touches the document only while a row lacks it.
-- Rule     : a seminar row without publicationStatus predates the field. It
--            was written when approval created the activity and the event at
--            once, so it is a published seminar (the rule the default
--            expressed, schemas/seminar.ts). Nothing else changes.
-- ============================================================================

update app_tables
   set doc = jsonb_set(doc, '{rows}', (
         select coalesce(jsonb_agg(
                  case when jsonb_typeof(r -> 'publicationStatus') = 'string' then r
                       else r || jsonb_build_object('publicationStatus', 'published') end
                  order by n), '[]'::jsonb)
           from jsonb_array_elements(doc -> 'rows') with ordinality as x(r, n))),
       version = version + 1
 where name = 'seminars'
   and exists (select 1 from jsonb_array_elements(doc -> 'rows') r
                where jsonb_typeof(r -> 'publicationStatus') is distinct from 'string');
