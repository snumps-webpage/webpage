/**
 * vitest globalSetup: build ONE initialized PGlite data directory (initdb +
 * every migration) and hand its path to the test workers. Starting PGlite
 * from scratch runs initdb — over a second per test file, many seconds under
 * parallel load — while loading this snapshot takes a few hundred ms.
 * store-memory.ts picks it up through PGLITE_SNAPSHOT.
 */
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { freshDatabase } from "./pglite-bootstrap";

export default async function setup() {
  const db: PGlite = await freshDatabase(
    (name) => fs.readFileSync(name, "utf8"),
    fs
      .readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => path.join("supabase/migrations", f)),
  );
  const dump = await db.dumpDataDir("none");
  await db.close();
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "pglite-")),
    "snapshot.tar",
  );
  fs.writeFileSync(file, Buffer.from(await dump.arrayBuffer()));
  process.env.PGLITE_SNAPSHOT = file;
  return () => fs.rmSync(path.dirname(file), { recursive: true, force: true });
}
