// Prepares state for the browser check and prints the member cookie value.
import fs from "node:fs";
import path from "node:path";
import {
  action,
  adminQueue,
  probeSeed,
  session,
  setClock,
  table,
  ANCHOR,
  MEASURE_DIR,
  at,
} from "./lib.mjs";

await probeSeed({ op: "reset" });
await setClock(ANCHOR); // ui-cdp.mjs resets it
const admin = await session("admin@snu.ac.kr", "관리자 / 학부생 / 수리과학부");
const B = await session("b@snu.ac.kr", "김발표 / 학부생 / 물리천문학부");
const C = await session("c@snu.ac.kr", "이참가 / 대학원생 / 통계학과");
for (const [cookie, addr, phone] of [
  [B, "b@snu.ac.kr", "01033334444"],
  [C, "c@snu.ac.kr", "01099990000"],
]) {
  await action(
    "/signup",
    null,
    { phone, studentId: "2020-12345", background: "", agreement: "on" },
    cookie,
  );
  const item = (await adminQueue("applications", admin)).items.find(
    (i) => i.email === addr,
  );
  await action("/admin", "approve", { id: item.id }, admin);
}
const title = "UI 확인용 세미나";
await action(
  "/seminar/apply",
  null,
  { title, description: "설명", speakerIds: "" },
  B,
);
const req = (await adminQueue("seminar-requests", admin)).items.find(
  (i) => i.title === title,
);
await action("/admin", "approveSeminar", { id: req.id }, admin);
const s = (await table("seminars")).find((x) => x.title === title);
await action(
  "/admin/seminars",
  "scheduleSeminar",
  { seminarId: s.id, startsAtLocal: at(3), endsAtLocal: "", location: "301호" },
  admin,
);
await action("/admin/seminars", "publishSeminar", { seminarId: s.id }, admin);
fs.mkdirSync(MEASURE_DIR, { recursive: true });
fs.writeFileSync(
  process.argv[2] ?? path.join(MEASURE_DIR, "ui-cookie.txt"),
  C.split("=").slice(1).join("="),
);
console.log("ready");
