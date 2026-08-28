import { AppError } from "$lib/server/core/errors";
import { nowKstIso } from "$lib/server/core/time";
import { getTable, mutate } from "$lib/server/data/tables";
import { audit } from "$lib/server/data/audit";
import type { Member, MemberRole } from "$lib/server/data/schemas";

/**
 * Member administration (API-SPEC §7-3 / BE-53).
 * Every status/privilege mutation and every admin touch of private-info is
 * audited. The withdrawal HOLD lives here; the request flow itself is BE-41.
 */

async function patchMember(id: string, fn: (m: Member) => Member): Promise<Member> {
  let updated: Member | undefined;
  await mutate("members", (rows) => {
    const idx = rows.findIndex((m) => m.id === id);
    if (idx === -1) throw new AppError("NOT_FOUND");
    updated = fn(rows[idx]);
    rows[idx] = updated;
    return rows;
  });
  return updated!;
}

export async function updateMember(
  id: string,
  patch: Partial<Pick<Member, "name" | "department" | "joinedAt" | "project" | "publicContact">>,
): Promise<void> {
  await patchMember(id, (m) => ({ ...m, ...patch }));
}

/** associate↔regular. Promotion grants alumni — unless a revocation sticks. */
export async function setStatus(
  targetId: string,
  status: "associate" | "regular",
  actorId: string,
): Promise<void> {
  await patchMember(targetId, (m) => {
    if (m.status === "withdrawn") throw new AppError("CONFLICT"); // lifecycle owns withdrawn
    return {
      ...m,
      status,
      statusChangedAt: nowKstIso(),
      isAlumni: status === "regular" && !m.alumniRevoked ? true : m.isAlumni,
    };
  });
  await audit({
    actorMemberId: actorId,
    action: "member.set-status",
    targetTable: "members",
    targetId,
    detail: { status },
  });
}

/** 유고 박탈 — reason is mandatory and the flag is sticky against re-promotion. */
export async function revokeAlumni(
  targetId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  if (!reason.trim()) throw new AppError("VALIDATION_FAILED");
  await patchMember(targetId, (m) => ({ ...m, isAlumni: false, alumniRevoked: true }));
  await audit({
    actorMemberId: actorId,
    action: "member.revoke-alumni",
    targetTable: "members",
    targetId,
    detail: { reason },
  });
}

export async function setRoles(
  targetId: string,
  roles: MemberRole[],
  actorId: string,
): Promise<void> {
  await patchMember(targetId, (m) => ({ ...m, roles }));
  await audit({
    actorMemberId: actorId,
    action: "member.set-roles",
    targetTable: "members",
    targetId,
    detail: { count: roles.length },
  });
}

/** Grant/revoke admin. Self-revocation is refused — the last admin must not vanish. */
export async function setAdmin(
  targetId: string,
  isAdmin: boolean,
  actorId: string,
): Promise<void> {
  if (targetId === actorId && !isAdmin) throw new AppError("CONFLICT");
  await patchMember(targetId, (m) => ({ ...m, isAdmin }));
  await audit({
    actorMemberId: actorId,
    action: "member.set-admin",
    targetTable: "members",
    targetId,
    detail: { isAdmin },
  });
}

export async function updatePrivateInfo(
  targetMemberId: string,
  patch: Partial<{ phone: string; background: string; email: string }>,
  actorId: string,
): Promise<void> {
  await mutate("private-info", (rows) => {
    const idx = rows.findIndex((p) => p.memberId === targetMemberId);
    if (idx === -1) throw new AppError("NOT_FOUND");
    rows[idx] = { ...rows[idx], ...patch };
    return rows;
  });
  await audit({
    actorMemberId: actorId,
    action: "private-info.update",
    targetTable: "private-info",
    targetId: targetMemberId,
    detail: { fields: Object.keys(patch) }, // field NAMES only, never values
  });
}

// ---- withdrawal hold (ADM-17) ----------------------------------------------

export async function holdWithdrawal(targetId: string, actorId: string): Promise<void> {
  await patchMember(targetId, (m) => {
    if (m.status !== "withdrawn" || !m.withdrawal) throw new AppError("CONFLICT");
    return {
      ...m,
      withdrawal: { ...m.withdrawal, holdBy: actorId, holdAt: nowKstIso() },
    };
  });
  await audit({
    actorMemberId: actorId,
    action: "withdrawal.hold",
    targetTable: "members",
    targetId,
  });
}

/** Releasing a hold restarts the one-month clock (§7-3). */
export async function releaseWithdrawalHold(
  targetId: string,
  actorId: string,
): Promise<void> {
  await patchMember(targetId, (m) => {
    if (m.status !== "withdrawn" || !m.withdrawal?.holdBy) throw new AppError("CONFLICT");
    return {
      ...m,
      withdrawal: { ...m.withdrawal, holdBy: null, holdAt: null, requestedAt: nowKstIso() },
    };
  });
  await audit({
    actorMemberId: actorId,
    action: "withdrawal.release-hold",
    targetTable: "members",
    targetId,
  });
}

/** §7-1: withdrawn members in their grace period, for the admin dashboard. */
export async function getWithdrawnPending() {
  const members = await getTable("members");
  return members
    .filter((m) => m.status === "withdrawn" && m.withdrawal)
    .map((m) => ({
      id: m.id,
      name: m.name,
      department: m.department,
      requestedAt: m.withdrawal!.requestedAt,
      deleteAfter: new Date(
        new Date(m.withdrawal!.requestedAt).getTime() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      held: !!m.withdrawal!.holdBy,
    }));
}
