import { getTable } from "$lib/server/data/tables";
import type { MemberContext } from "./zone";

/**
 * Session-hook member matching (IMPLEMENTATION-SPEC BE-21):
 * email → private-info row → members row, all through the cached table layer.
 * Explicitly exempt from audit logging (API-SPEC §1-5) — it runs on every request.
 *
 * TODO(M3-cutover): remove the legacy fallback below once the S3 tables are
 * populated by the migration. Until then an empty/unconfigured data layer
 * falls back to the Notion-backed repository so the app keeps working.
 */

export async function resolveMember(email: string): Promise<MemberContext | null> {
  const normalized = email.trim().toLowerCase();

  try {
    const infos = await getTable("private-info");
    if (infos.length > 0) {
      const info = infos.find((i) => i.email.toLowerCase() === normalized);
      if (!info) return null;
      const member = (await getTable("members")).find((m) => m.id === info.memberId);
      if (!member) return null;
      return {
        memberId: member.id,
        privateInfoId: info.id,
        name: member.name,
        status: member.status,
        isAdmin: member.isAdmin,
      };
    }
  } catch {
    // fall through to legacy
  }

  return resolveLegacy(email);
}

async function resolveLegacy(email: string): Promise<MemberContext | null> {
  const [{ memberRepo }, { isAdmin }] = await Promise.all([
    import("$lib/server/repositories/MemberRepository"),
    import("$lib/server/admin"),
  ]);
  const member = await memberRepo.findByEmail(email);
  if (!member) return null;
  return {
    memberId: member.memberId,
    privateInfoId: member.privateInfoId ?? null,
    name: member.name ?? "",
    status: "regular", // legacy data has no status axis; it gates nothing pre-M3
    isAdmin: isAdmin(email),
  };
}

export async function hasApplication(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  try {
    const apps = await getTable("applications");
    if (apps.some((a) => a.email.toLowerCase() === normalized)) return true;
  } catch {
    // fall through to legacy
  }
  const { getApplicationByEmail } = await import("$lib/server/admin");
  const app = await getApplicationByEmail(email);
  return !!app;
}
