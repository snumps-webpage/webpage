import { ensureAdmin } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { nowKstIso } from "$lib/server/core/time";
import { memberActivityIndex } from "$lib/server/public/member-activity";
import type { PageServerLoad } from "./$types";

/** ADM-07: member roster for the admin. Search/filter runs client-side (231 rows). */
export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });

  // 관리자 면은 숨김 활동까지 센다 (snumps-webpage/D-000041·042)
  const [members, activityOf] = await Promise.all([
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
      active: activityOf(m).active,
    })),
    generatedAt: nowKstIso(),
  };
};
