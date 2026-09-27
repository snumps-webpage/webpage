import { invalidateCache } from "$lib/server/cache";
import { AppError, ERR, type ErrCode } from "$lib/server/core/errors";
import { rpc } from "./store";

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

export interface FlowResult {
  touched?: string[];
  touchedQueues?: string[];
}

const APP_CODES = new Set<string>(Object.keys(ERR));

export async function callFlow<T extends FlowResult>(
  fn: `flow_${string}`,
  args: Record<string, unknown>,
): Promise<T> {
  let out: T;
  try {
    out = await rpc<T>(fn, args);
  } catch (e) {
    const code = e instanceof Error ? e.message.trim() : "";
    if (APP_CODES.has(code)) throw new AppError(code as ErrCode);
    throw e;
  }
  for (const name of out.touched ?? []) await invalidateCache(`table_${name}`);
  for (const id of out.touchedQueues ?? []) {
    await invalidateCache(`table_attendance-queue_${id}`);
  }
  return out;
}
