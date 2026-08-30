import { getTable } from "$lib/server/data/tables";
import type { MemberContext } from "./zone";

/**
 * Session-hook member matching (IMPLEMENTATION-SPEC BE-21):
 * email → private-info row → members row, all through the cached table layer.
 * Explicitly exempt from audit logging (API-SPEC §1-5) — it runs on every request.
 * The legacy Notion-repository fallback was removed at the Supabase cutover:
 * an empty private-info table now simply means "not a member".
 */

export async function resolveMember(email: string): Promise<MemberContext | null> {
  const normalized = email.trim().toLowerCase();

  const infos = await getTable("private-info");
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

export async function hasApplication(email: string): Promise<boolean> {
  // S3-only on purpose: all outstanding applications live in the new table
  // (the legacy store held no pending rows at migration time).
  const normalized = email.trim().toLowerCase();
  try {
    const apps = await getTable("applications");
    return apps.some((a) => a.email.toLowerCase() === normalized);
  } catch {
    return false;
  }
}
