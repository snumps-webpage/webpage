import { ensureAdmin } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { nowKstIso } from "$lib/server/core/time";
import { memberActivityIndex } from "$lib/server/public/member-activity";
import type { PageServerLoad } from "./$types";

/** ADM-07: member roster for the admin. Search/filter runs client-side (231 rows). */
export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });

  // 저장 지위와 회칙 기준 계산 지위를 함께 (snumps-webpage/D-000065·070·078)
  const [members, index] = await Promise.all([
    getTable("members"),
    memberActivityIndex({ publicOnly: false }),
  ]);
  return {
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      department: m.department,
      joinedAt: m.joinedAt,
      status: m.status,
      statusChangedAt: m.statusChangedAt,
      isAlumni: m.isAlumni,
      alumniRevoked: m.alumniRevoked,
      isAdmin: m.isAdmin,
      roles: m.roles,
      standing: index.of(m).standing,
    })),
    generatedAt: nowKstIso(),
  };
};
