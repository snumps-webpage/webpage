-- ============================================================================
-- 20260928000400_member_revocation_reason.sql — write the new field out
--
-- Decision : #18 (audit LA30-1) — the alumni revocation reason (유고 박탈
--            사유) moves out of the append-only audit log onto the member
--            row: MemberSchema.alumniRevocationReason, string | null,
--            required (no zod default). The audit row keeps only
--            { hasReason: true }.
-- Run on   : BOTH prod and dev, BEFORE deploying the code that requires the
--            key (that code refuses a member row lacking it). Idempotent —
--            touches a document only while one of its rows lacks the key.
-- Rule     : a member or legacy-member row without the key predates the
--            field. It is written as null — also for a member revoked
--            before this change: that reason stays where it was written,
--            in the immutable audit_log (member.revoke-alumni detail), and
--            is not copied or rewritten. Nothing else changes.
-- ============================================================================

update app_tables
   set doc = jsonb_set(doc, '{rows}', (
         select coalesce(jsonb_agg(
                  case when r ? 'alumniRevocationReason' then r
                       else r || jsonb_build_object('alumniRevocationReason', null) end
                  order by n), '[]'::jsonb)
           from jsonb_array_elements(doc -> 'rows') with ordinality as x(r, n))),
       version = version + 1
 where name in ('members', 'legacy-members')
   and exists (select 1 from jsonb_array_elements(doc -> 'rows') r
                where not r ? 'alumniRevocationReason');
