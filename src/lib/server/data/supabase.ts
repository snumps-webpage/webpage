import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "$env/dynamic/private";

/**
 * The ONLY module that constructs the Supabase client for data-plane access
 * (SUPABASE-MIGRATION-SPEC §2-3). Everything above goes through store.ts.
 */

let client: SupabaseClient | null = null;

/** DATA_BACKEND=memory routes the whole document store to store-memory (S4). */
export function isMemoryBackend(): boolean {
  return env.DATA_BACKEND === "memory";
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
