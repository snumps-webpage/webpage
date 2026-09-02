// prod 가입 차단 진단 — 개수/불리언만 출력 (PII 미출력)
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const admins = (process.env.ADMINS_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

async function rows(name) {
  const { data } = await sb.from("app_tables").select("doc").eq("name", name).maybeSingle();
  return data?.doc?.rows ?? [];
}

const [members, infos, regs, apps] = await Promise.all([
  rows("members"),
  rows("private-info"),
  rows("registrations"),
  rows("applications"),
]);
console.log("live members:", members.length);
console.log("live private-info:", infos.length);
console.log("registrations:", regs.length);
console.log("applications:", apps.length);
console.log("admins-in-env:", admins.length);
console.log(
  "application-by-admin-email:",
  apps.some((a) => admins.includes((a.email ?? "").toLowerCase())),
);
console.log(
  "live-info-by-admin-email:",
  infos.some((i) => admins.includes((i.email ?? "").toLowerCase())),
);
