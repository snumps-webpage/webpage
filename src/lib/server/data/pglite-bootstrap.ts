/**
 * The one way to turn an empty PGlite into this app's database: the stand-in
 * for Supabase's storage schema, then every migration in file-name order.
 * Shared by store-memory.ts (runtime) and the vitest snapshot setup.
 */
import type { PGlite } from "@electric-sql/pglite";

/** Supabase's storage schema does not exist in plain Postgres. */
export const STORAGE_STUB = `
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key, name text, public boolean
  );`;

export async function freshDatabase(
  read: (file: string) => string | Promise<string>,
  files: string[],
): Promise<PGlite> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.exec(STORAGE_STUB);
  for (const file of [...files].sort()) await db.exec(await read(file));
  return db;
}
