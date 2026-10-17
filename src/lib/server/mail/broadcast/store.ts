import type { MailBroadcast } from "$lib/server/data/schemas";
import { getTable, mutate } from "$lib/server/data/tables";

/** messageId로 발송 기록을 찾는다. 없으면 null. */
export async function findBroadcast(
  messageId: string,
): Promise<MailBroadcast | null> {
  const rows = await getTable("mail-broadcasts");
  return rows.find((r) => r.messageId === messageId) ?? null;
}

/** 같은 메일은 한 번만 — `failed`만 다시 선점할 수 있다 (D-000110). */
export async function claimBroadcast(
  row: MailBroadcast,
): Promise<{ ok: true } | { ok: false; existing: MailBroadcast }> {
  let existing: MailBroadcast | undefined;
  await mutate("mail-broadcasts", (rows) => {
    existing = rows.find(
      (r) => r.messageId === row.messageId && r.status !== "failed",
    );
    if (existing) return rows;
    return [...rows.filter((r) => r.messageId !== row.messageId), row];
  });
  return existing ? { ok: false, existing } : { ok: true };
}

/** 발송 종료 시 결과(상태·묶음 수·종료 시각)를 기록한다. */
export async function finishBroadcast(
  id: string,
  patch: Pick<
    MailBroadcast,
    "status" | "batchesSent" | "batchesFailed" | "recipientCount" | "finishedAt"
  >,
): Promise<void> {
  await mutate("mail-broadcasts", (rows) =>
    rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  );
}

/** 최근 발송 기록, `startedAt` 내림차순. */
export async function recentBroadcasts(
  limit: number,
): Promise<MailBroadcast[]> {
  const rows = await getTable("mail-broadcasts");
  return [...rows]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, limit);
}
