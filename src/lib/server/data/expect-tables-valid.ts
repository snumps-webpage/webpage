// Test-only helper (imported by *.test.ts, never by app code).
import { z } from "zod";
import { __docs } from "./store-memory";
import { AttendanceRecordSchema, TABLES, envelope } from "./schemas";

/**
 * Every stored document, decoded strictly — the check that rows written by
 * the plpgsql flows (docs/spec/ATOMIC-FLOWS.md §3) have exactly the shapes
 * the TS writers produce:
 *   - the envelope and each row pass their zod schema with unknown keys
 *     refused (a misspelled key in SQL would otherwise be silently dropped
 *     on the next TS write);
 *   - no row relies on a schema default: every key the parsed row has is
 *     present in the stored row (SQL must write defaulted fields out).
 * Call after a flow ran; it reports every problem at once.
 */
export async function expectTablesValid(): Promise<void> {
  const problems: string[] = [];
  const check = (where: string, schema: z.ZodTypeAny, doc: unknown) => {
    const env = envelope(z.unknown()).safeParse(doc);
    if (!env.success) {
      problems.push(`${where}: bad envelope`);
      return;
    }
    const strict = schema instanceof z.ZodObject ? schema.strict() : schema;
    env.data.rows.forEach((row, i) => {
      const parsed = strict.safeParse(row);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          problems.push(
            `${where}[${i}].${issue.path.join(".")}: ${issue.message}`,
          );
        }
        return;
      }
      for (const key of Object.keys(parsed.data as object)) {
        if (!(key in (row as object))) {
          problems.push(`${where}[${i}].${key}: missing (default relied on)`);
        }
      }
    });
  };

  for (const [name, { doc }] of await __docs("table")) {
    const schema = TABLES[name as keyof typeof TABLES];
    if (!schema) problems.push(`table ${name}: no schema`);
    else check(name, schema, doc);
  }
  for (const [eventId, { doc }] of await __docs("queue")) {
    check(`queue ${eventId}`, AttendanceRecordSchema, doc);
  }
  if (problems.length > 0) {
    throw new Error(`stored documents do not decode:\n${problems.join("\n")}`);
  }
}
