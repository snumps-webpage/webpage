// Anonymous denial requires a privileged known-resource control first.
import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_URL: url,
  PUBKEY: publicKey,
  SUPABASE_SECRET_KEY: secret,
} = process.env;
if (!url || !publicKey || !secret) {
  console.error(
    "INCOMPLETE — SUPABASE_URL, PUBKEY, SUPABASE_SECRET_KEY control required",
  );
  process.exit(1);
}
const sb = createClient(url, publicKey);
const control = createClient(url, secret);
const results = [];
// Auth, missing-resource and transport failures never prove an RLS denial.
const policyDenied = (error) =>
  error?.code === "42501" ||
  ((error?.status === 403 || error?.statusCode === "403") &&
    /row.level security|permission denied/i.test(error?.message ?? ""));

for (const table of ["app_tables", "app_queues", "audit_log"]) {
  const known = await control.from(table).select("*").limit(1);
  if (known.error || !Array.isArray(known.data) || known.data.length === 0) {
    results.push({
      name: `select ${table}`,
      pass: false,
      note: "INCOMPLETE: no privileged known-row control",
    });
    continue;
  }
  const { data, error } = await sb.from(table).select("*").limit(1);
  const denied = error
    ? policyDenied(error)
    : Array.isArray(data) && data.length === 0;
  results.push({
    name: `select ${table} (publishable)`,
    pass: denied,
    note: error
      ? `code=${error.code ?? "unknown"}`
      : `rows=${data?.length ?? "unknown"}`,
  });
}

// Existing write-denial probe: use a disposable dev project, because a broken
// policy could permit the insertion. Only a specific policy rejection passes.
const { error: werr } = await sb
  .from("app_tables")
  .insert({ name: "rls-probe", doc: {} });
results.push({
  name: "insert app_tables (publishable)",
  pass: policyDenied(werr),
  note: werr ? `code=${werr.code ?? "unknown"}` : "!! insert succeeded",
});

/** Find a prefix containing a real object rather than an empty folder. */
async function knownStoragePrefix(prefix) {
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await control.storage
      .from("staging")
      .list(prefix, { limit: 100, offset });
    if (error || !Array.isArray(data))
      throw new Error("privileged storage read failed");
    if (data.some((row) => row.id)) return prefix;
    for (const folder of data.filter((row) => !row.id)) {
      const found = await knownStoragePrefix(`${prefix}/${folder.name}`);
      if (found !== null) return found;
    }
    if (data.length < 100) return null;
  }
}
try {
  const prefix = await knownStoragePrefix("pending");
  if (prefix === null) {
    results.push({
      name: "list staging",
      pass: false,
      note: "INCOMPLETE: no known stored object",
    });
  } else {
    const { data, error } = await sb.storage.from("staging").list(prefix);
    results.push({
      name: "list staging (publishable)",
      pass: error
        ? policyDenied(error)
        : Array.isArray(data) && data.length === 0,
      note: error
        ? `code=${error.code ?? "unknown"}`
        : `entries=${data?.length ?? "unknown"}`,
    });
  }
} catch {
  results.push({
    name: "list staging",
    pass: false,
    note: "INCOMPLETE: privileged control failed",
  });
}

for (const r of results)
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}  — ${r.note}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
