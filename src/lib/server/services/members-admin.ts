import { AppError, definedOnly } from "$lib/server/core/errors";
import { nowKstIso } from "$lib/server/core/time";
import { withdrawalGraceEndsAt } from "$lib/domain/account";
import { isBootstrapAdminActorId } from "$lib/server/core/admin-bootstrap";
import {
  memberRolesSchema,
  type ActiveMemberStatus,
} from "$lib/domain/members";
import { getTable, mutate } from "$lib/server/data/tables";
import { audit, auditStamp } from "$lib/server/data/audit";
import { callFlow } from "$lib/server/data/flows";
import type { Member, MemberRole } from "$lib/server/data/schemas";

/**
 * Member administration (API-SPEC §7-3 / BE-53).
 * Every status/privilege mutation and every admin touch of private-info is
 * audited. The withdrawal HOLD lives here; the request flow itself is BE-41.
 */

async function patchMember(
  id: string,
  fn: (m: Member) => Member,
): Promise<Member> {
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
  patch: Partial<Pick<Member, "name" | "department" | "joinedAt" | "project">>,
): Promise<void> {
  await patchMember(id, (m) => ({ ...m, ...definedOnly(patch) }));
}

/** associate↔regular. Promotion grants alumni — unless a revocation sticks. */
export async function setStatus(
  targetId: string,
  status: ActiveMemberStatus,
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

/**
 * 유고 박탈 — reason is mandatory and the flag is sticky against re-promotion.
 * The reason is free text about one member, so it is stored on the member
 * row (erased with it) and the append-only audit log records only that one
 * was given (decision #18, audit LA30-1). Audit rows written before this
 * change still carry { reason } — they are immutable and stay as they are.
 */
export async function revokeAlumni(
  targetId: string,
  reason: string,
  actorId: string,
): Promise<void> {
  const trimmed = reason.trim();
  if (!trimmed) throw new AppError("VALIDATION_FAILED");
  await patchMember(targetId, (m) => ({
    ...m,
    isAlumni: false,
    alumniRevoked: true,
    alumniRevocationReason: trimmed,
  }));
  await audit({
    actorMemberId: actorId,
    action: "member.revoke-alumni",
    targetTable: "members",
    targetId,
    detail: { hasReason: true },
  });
}

/**
 * The one rule for a member's finished roles array — format, the 30-role cap,
 * no repeated (term, title) — whichever screen wrote it. The member page and
 * /admin/executives used to check different things; an executives assignment
 * past 30 then made the member page unable to save that member's roles at all
 * (audit LB22-3).
 */
function checkedRoles(roles: MemberRole[]): MemberRole[] {
  const parsed = memberRolesSchema.safeParse(roles);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", {
      userMessage: parsed.error.issues[0]?.message,
    });
  }
  return parsed.data;
}

export async function setRoles(
  targetId: string,
  roles: MemberRole[],
  actorId: string,
): Promise<void> {
  const checked = checkedRoles(roles);
  await patchMember(targetId, (m) => ({ ...m, roles: checked }));
  await audit({
    actorMemberId: actorId,
    action: "member.set-roles",
    targetTable: "members",
    targetId,
    detail: { count: checked.length },
  });
}

/**
 * Change one member's roles by a function of the latest row, inside the
 * write — for callers that add or remove one role. Building the whole array
 * from a cached read and handing it to setRoles undid an edit another
 * instance had just made (audit LB22-1). `change` may throw to refuse; what
 * it returns is held to the same rule as setRoles (audit LB22-3).
 */
export async function updateRoles(
  targetId: string,
  change: (member: Member) => MemberRole[],
  actorId: string,
): Promise<void> {
  const updated = await patchMember(targetId, (m) => ({
    ...m,
    roles: checkedRoles(change(m)),
  }));
  await audit({
    actorMemberId: actorId,
    action: "member.set-roles",
    targetTable: "members",
    targetId,
    detail: { count: updated.roles.length },
  });
}

/**
 * Grant/revoke admin. Self-revocation is refused (API-SPEC), and so is
 * revoking the last admin: two admins revoking each other both passed the
 * self check and left none, which only SQL could undo (audit LB25-2). The
 * count is checked inside the write, so a concurrent revocation re-checks it.
 */
export async function setAdmin(
  targetId: string,
  isAdmin: boolean,
  actorId: string,
): Promise<void> {
  if (targetId === actorId && !isAdmin) {
    throw new AppError("CONFLICT", {
      userMessage: "본인의 관리자 권한은 회수할 수 없습니다.",
    });
  }
  await mutate("members", (rows) => {
    const idx = rows.findIndex((m) => m.id === targetId);
    if (idx === -1) throw new AppError("NOT_FOUND");
    rows[idx] = { ...rows[idx], isAdmin };
    // Admins who can still act: a withdrawn row cannot, and the env bootstrap
    // admin has no row but stays admin (adversarial review L2).
    const remains =
      isBootstrapAdminActorId(actorId) ||
      rows.some((m) => m.isAdmin && m.status !== "withdrawn");
    if (!remains) {
      throw new AppError("CONFLICT", {
        userMessage: "마지막 관리자의 권한은 회수할 수 없습니다.",
      });
    }
    return rows;
  });
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
  // The email is the login key (resolveMember takes the first match): stored
  // normalized, and never shared — a second row with the same address would
  // hand one member's login to the other's record (audit LB25-1).
  const email =
    patch.email === undefined ? undefined : patch.email.trim().toLowerCase();
  await mutate("private-info", (rows) => {
    const idx = rows.findIndex((p) => p.memberId === targetMemberId);
    if (idx === -1) throw new AppError("NOT_FOUND");
    if (
      email &&
      rows.some((p, i) => i !== idx && p.email.trim().toLowerCase() === email)
    ) {
      throw new AppError("CONFLICT", {
        userMessage: "다른 회원이 이미 쓰는 이메일입니다.",
      });
    }
    rows[idx] = { ...rows[idx], ...definedOnly({ ...patch, email }) };
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
// The change and its audit row commit together (flow_member_withdrawal) —
// withdrawal-lifecycle entries are destruction evidence (§1-5).

export async function holdWithdrawal(
  targetId: string,
  actorId: string,
): Promise<void> {
  await callFlow("flow_member_withdrawal", {
    memberId: targetId,
    op: "hold",
    actorId,
    now: nowKstIso(),
    ...auditStamp(),
  });
}

/** Releasing a hold restarts the one-month clock (§7-3). */
export async function releaseWithdrawalHold(
  targetId: string,
  actorId: string,
): Promise<void> {
  await callFlow("flow_member_withdrawal", {
    memberId: targetId,
    op: "release",
    actorId,
    now: nowKstIso(),
    ...auditStamp(),
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
      deleteAfter: withdrawalGraceEndsAt(m.withdrawal!.requestedAt),
      held: !!m.withdrawal!.holdBy,
    }));
}
