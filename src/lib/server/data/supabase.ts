import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "$env/dynamic/private";

/**
 * The ONLY module that constructs the Supabase client for data-plane access
 * (SUPABASE-MIGRATION-SPEC §2-3). Everything above goes through store.ts.
 */

let client: SupabaseClient | null = null;

/**
 * DATA_BACKEND=memory routes the whole document store to store-memory (S4) —
 * PGlite in-process, empty on every start. It exists for local development,
 * the measurement harness (vite dev) and tests only: a production build does
 * not even contain it (store.ts / storage.ts load it under
 * `import.meta.env.DEV`), and a production server configured with it refuses
 * to run rather than serve an empty database (audit LA35-1).
 */
export function isMemoryBackend(): boolean {
  if (env.DATA_BACKEND !== "memory") return false;
  if (!import.meta.env.DEV) {
    throw new Error(
      "DATA_BACKEND=memory is only available in development and tests",
    );
  }
  return true;
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SECRET_KEY;
    if (!url) throw new Error("SUPABASE_URL is not set");
    if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
