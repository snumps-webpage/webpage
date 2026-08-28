import { AppError } from "$lib/server/core/errors";
import { nowKstIso } from "$lib/server/core/time";
import { getTable, mutate } from "$lib/server/data/tables";
import { audit } from "$lib/server/data/audit";

/**
 * Withdrawal lifecycle, member side (API-SPEC §4-7 / MEM-07).
 * Triple confirmation is verified HERE, atomically — client steps are UX.
 * Auto-anonymization is explicitly DEFERRED (기능 명세 §10): past-deadline
 * members simply persist, and self-cancellation never expires.
 */

export interface TripleConfirmation {
  ackInfo: boolean;
  ackDataPolicy: boolean;
  confirmName: string;
}

export async function requestWithdrawal(
  memberId: string,
  confirmation: TripleConfirmation,
): Promise<void> {
  const member = (await getTable("members")).find((m) => m.id === memberId);
  if (!member) throw new AppError("NOT_FOUND");
  if (member.status === "withdrawn") throw new AppError("CONFLICT");

  // All three factors, server-side, in one shot (§4-7).
  if (
    !confirmation.ackInfo ||
    !confirmation.ackDataPolicy ||
    confirmation.confirmName.trim() !== member.name
  ) {
    throw new AppError("VALIDATION_FAILED");
  }

  // An active organizer must hand over first (STU-07 or admin transfer).
  const studies = await getTable("studies");
  const organizes = studies.some(
    (s) => s.organizerIds.includes(memberId) && s.status !== "finished",
  );
  if (organizes) throw new AppError("CONFLICT");

  const previousStatus = member.status; // "associate" | "regular" (withdrawn excluded above)
  await mutate("members", (rows) =>
    rows.map((m) =>
      m.id === memberId
        ? {
            ...m,
            status: "withdrawn" as const,
            statusChangedAt: nowKstIso(),
            withdrawal: {
              requestedAt: nowKstIso(),
              previousStatus,
              holdBy: null,
              holdAt: null,
            },
          }
        : m,
    ),
  );

  // Destruction-lifecycle evidence: audit failure fails the action (§1-5).
  await audit({
    actorMemberId: memberId,
    action: "withdrawal.request",
    targetTable: "members",
    targetId: memberId,
  });
}

/** Self-cancellation from /withdraw/pending — restores the pre-withdrawal status. */
export async function cancelWithdrawal(memberId: string): Promise<void> {
  await mutate("members", (rows) => {
    const idx = rows.findIndex((m) => m.id === memberId);
    if (idx === -1) throw new AppError("NOT_FOUND");
    const m = rows[idx];
    if (m.status !== "withdrawn" || !m.withdrawal) throw new AppError("NOT_FOUND");
    rows[idx] = {
      ...m,
      status: m.withdrawal.previousStatus,
      statusChangedAt: nowKstIso(),
      withdrawal: null,
    };
    return rows;
  });
  await audit({
    actorMemberId: memberId,
    action: "withdrawal.cancel",
    targetTable: "members",
    targetId: memberId,
  });
}

export async function getWithdrawalState(memberId: string) {
  const member = (await getTable("members")).find((m) => m.id === memberId);
  if (!member?.withdrawal) return null;
  return {
    requestedAt: member.withdrawal.requestedAt,
    deleteAfter: new Date(
      new Date(member.withdrawal.requestedAt).getTime() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    held: !!member.withdrawal.holdBy,
  };
}
