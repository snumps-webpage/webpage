import { nowKstIso } from "$lib/server/core/time";
import { withdrawalGraceEndsAt } from "$lib/domain/account";
import { getTable } from "$lib/server/data/tables";
import { auditStamp } from "$lib/server/data/audit";
import { callFlow } from "$lib/server/data/flows";

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
  // All three factors, server-side, in one shot (§4-7); an active organizer
  // must hand over first (STU-07 or admin transfer). The checks, the status
  // change and its audit row — destruction-lifecycle evidence (§1-5) — are
  // one transaction (flow_request_withdrawal).
  await callFlow("flow_request_withdrawal", {
    memberId,
    ackInfo: confirmation.ackInfo,
    ackDataPolicy: confirmation.ackDataPolicy,
    confirmName: confirmation.confirmName.trim(),
    now: nowKstIso(),
    ...auditStamp(),
  });
}

/** Self-cancellation from /withdraw/pending — restores the pre-withdrawal status. */
export async function cancelWithdrawal(memberId: string): Promise<void> {
  await callFlow("flow_member_withdrawal", {
    memberId,
    op: "cancel",
    actorId: memberId,
    now: nowKstIso(),
    ...auditStamp(),
  });
}

export async function getWithdrawalState(memberId: string) {
  const member = (await getTable("members")).find((m) => m.id === memberId);
  if (!member?.withdrawal) return null;
  return {
    requestedAt: member.withdrawal.requestedAt,
    deleteAfter: withdrawalGraceEndsAt(member.withdrawal.requestedAt),
    held: !!member.withdrawal.holdBy,
  };
}
