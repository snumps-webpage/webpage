import { newId } from "$lib/server/core/id";
import { dataBucket, putObject } from "./s3";
import type { TableName } from "./schemas";

/**
 * Audit channel (API-SPEC §1-5): one S3 object per entry — object creation
 * IS the append, so log writes never contend with table mutations.
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
  const id = newId();
  const at = new Date().toISOString();
  const date = at.slice(0, 10);
  const body = new TextEncoder().encode(JSON.stringify({ id, at, ...entry }));
  try {
    await putObject(dataBucket(), `audit/${date}/${id}.json`, body, "application/json");
  } catch (e) {
    // Withdrawal-lifecycle entries are destruction evidence: their loss must
    // fail the action itself. Everything else logs and moves on.
    if (entry.action.startsWith("withdrawal.")) throw e;
    console.error("[audit] write failed:", entry.action, e);
  }
}
