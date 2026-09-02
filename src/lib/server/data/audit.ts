import { newId } from "$lib/server/core/id";
import { insertAuditRow } from "./store";
import type { TableName } from "./schemas";

/**
 * Audit channel (API-SPEC §1-5, revised by SUPABASE-MIGRATION-SPEC §3): one
 * append-only Postgres `audit_log` row per entry — the INSERT is the append,
 * so log writes never contend with table mutations.
 * detail must carry field NAMES only, never PII values.
 */

export type AuditAction =
  | "private-info.read"
  | "private-info.update"
  | "member.set-status"
  | "member.set-roles"
  | "member.set-admin"
  | "member.revoke-alumni"
  | "study.set-organizer"
  | "withdrawal.request"
  | "withdrawal.cancel"
  | "withdrawal.hold"
  | "withdrawal.release-hold"
  | "withdrawal.auto-anonymize";

export interface AuditEntry {
  actorMemberId: string | "system"; // cron = "system"
  action: AuditAction;
  targetTable: TableName | "attendance-queue";
  targetId: string;
  detail?: Record<string, unknown>;
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await insertAuditRow({
      id: newId(),
      at: new Date().toISOString(),
      actor: entry.actorMemberId,
      action: entry.action,
      target_tb: entry.targetTable,
      target_id: entry.targetId,
      detail: entry.detail ?? null,
    });
  } catch (e) {
    // Withdrawal-lifecycle entries are destruction evidence: their loss must
    // fail the action itself. Everything else logs and moves on.
    if (entry.action.startsWith("withdrawal.")) throw e;
    console.error("[audit] write failed:", entry.action, e);
  }
}
