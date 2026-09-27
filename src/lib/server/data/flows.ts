import { AppError, ERR, type ErrCode } from "$lib/server/core/errors";
import type { TableName } from "./schemas";
import { rpc } from "./store";
import { invalidateQueue, invalidateTable } from "./tables";

/**
 * The one way to run a multi-document flow (docs/spec/ATOMIC-FLOWS.md): a
 * plpgsql function that locks what it touches and does the whole change in
 * one transaction. This wrapper
 *   - turns the error code a function RAISEs into an AppError (anything else —
 *     a SQL bug, an unreachable database — is rethrown as is), and
 *   - drops the cache of every table/queue the function reports as touched,
 *     so the next read on this instance sees the new state.
 * Side effects that must not run inside a transaction (mail, Storage) stay
 * with the caller, after this returns.
 */

/**
 * What the function says it wrote. Each flow builds these lists by hand; the
 * test backend checks them against the rows the flow actually changed
 * (store-memory `__checkFlowWrites`, audit LA32-2).
 */
export interface FlowResult {
  touched?: TableName[];
  touchedQueues?: string[];
}

const APP_CODES = new Set<string>(Object.keys(ERR));

/**
 * `messages` maps a flow's reason (its RAISE ... USING DETAIL) to the Korean
 * userMessage the AppError should carry — the code stays the contract.
 */
export async function callFlow<T extends FlowResult>(
  fn: `flow_${string}`,
  args: Record<string, unknown>,
  opts: { messages?: Record<string, string> } = {},
): Promise<T> {
  let out: T;
  try {
    out = await rpc<T>(fn, args);
  } catch (e) {
    const code = e instanceof Error ? e.message.trim() : "";
    if (APP_CODES.has(code)) {
      const detail = (e as { detail?: string }).detail;
      const userMessage = detail ? opts.messages?.[detail] : undefined;
      throw new AppError(code as ErrCode, userMessage ? { userMessage } : {});
    }
    throw e;
  }
  for (const name of out.touched ?? []) await invalidateTable(name);
  for (const id of out.touchedQueues ?? []) await invalidateQueue(id);
  return out;
}
