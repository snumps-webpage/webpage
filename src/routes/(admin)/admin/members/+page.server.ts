import { ensureAdmin } from "$lib/server/auth-guards";
import { getTable } from "$lib/server/data/tables";
import { nowKstIso } from "$lib/server/core/time";
import type { PageServerLoad } from "./$types";

/** ADM-07: member roster for the admin. Search/filter runs client-side (231 rows). */
export const load: PageServerLoad = async ({ locals }) => {
  await ensureAdmin(locals, { silent: true });

  const members = await getTable("members");
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
    })),
    generatedAt: nowKstIso(),
  };
};
