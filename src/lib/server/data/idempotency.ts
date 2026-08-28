import { getTable, mutate } from "./tables";
import type { RowOf, TableName } from "./schemas";

/** Tables whose rows carry the §1-6 idempotency anchor. */
type SourcedTable = {
  [N in TableName]: RowOf<N> extends { sourceRequestId: string | null } ? N : never;
}[TableName];

/**
 * check-before-create (API-SPEC §1-6): approval flows call this once per
 * record they create. A re-run after a mid-sequence failure finds the
 * record from the previous attempt and skips creation — duplicates: zero.
 */
export async function ensureCreated<N extends SourcedTable>(
  name: N,
  sourceRequestId: string,
  build: () => RowOf<N>,
): Promise<RowOf<N>> {
  const bySource = (rows: RowOf<N>[]) =>
    rows.find((r) => (r as { sourceRequestId: string | null }).sourceRequestId === sourceRequestId);

  const existing = bySource(await getTable(name));
  if (existing) return existing;

  let created: RowOf<N> | undefined;
  await mutate(name, (rows) => {
    const found = bySource(rows);
    if (found) {
      created = found;
      return rows;
    }
    created = build();
    return [...rows, created];
  });
  return created!;
}
