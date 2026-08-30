// dev 프로젝트 버킷 존재 확인 — 이름/공개여부만 출력
import { createClient } from "@supabase/supabase-js";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("env missing");
  process.exit(1);
}
const sb = createClient(url, key);
const { data, error } = await sb.storage.listBuckets();
if (error) {
  console.error("listBuckets error:", error.message);
  process.exit(1);
}
for (const b of data) console.log(`${b.name} public=${b.public}`);
