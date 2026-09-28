// Real-data measurement: seeds a local backup snapshot into the memory server
// and exercises every route with real ids. Prints statuses, counts and ids
// only — never names, emails or phone numbers.
// Usage: BASE=... node scripts/measure/real.mjs <backup.json>
import fs from "node:fs";
import {
  BASE,
  action,
  check,
  get,
  probeSeed,
  session,
  setClock,
  summary,
  table,
  queue,
} from "./lib.mjs";

const snap = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).tables;
// Backups taken before migration 20260928000100 hold seminars without
// publicationStatus; the app no longer defaults it. Apply the migration's
// rule (missing → "published") to the snapshot, as the deploy would. The
// same for 20260928000300 (kind / durationMinutes / prerequisites / announce;
// kind and prerequisites from the source request, #7 #12 #21).
let backfilled = 0;
const requestById = new Map(
  (
    snap.app_tables.find((t) => t.name === "seminar-requests")?.doc.rows ?? []
  ).map((r) => [r.id, r]),
);
for (const t of snap.app_tables) {
  if (t.name !== "seminars") continue;
  t.doc.rows = t.doc.rows.map((s) => {
    const request = requestById.get(s.sourceRequestId);
    const out = { ...s };
    if (s.publicationStatus == null) {
      backfilled++;
      out.publicationStatus = "published";
    }
    if (!("kind" in s))
      out.kind = ["regular", "irregular"].includes(request?.kind)
        ? request.kind
        : null;
    if (typeof s.prerequisites !== "string")
      out.prerequisites =
        typeof request?.prerequisites === "string" ? request.prerequisites : "";
    if (!("durationMinutes" in s)) out.durationMinutes = null;
    if (typeof s.announce !== "boolean") out.announce = true;
    return out;
  });
}
// 20260928000400: the alumni revocation reason lives on the member row (#18).
for (const t of snap.app_tables) {
  if (t.name !== "members" && t.name !== "legacy-members") continue;
  t.doc.rows = t.doc.rows.map((m) =>
    "alumniRevocationReason" in m ? m : { ...m, alumniRevocationReason: null },
  );
}
await setClock(null);
await probeSeed({
  op: "reset",
  tables: snap.app_tables.map((t) => ({ name: t.name, doc: t.doc })),
  queues: (snap.app_queues ?? []).map((q) => ({
    event_id: q.event_id,
    doc: q.doc,
  })),
});
const counts = Object.fromEntries(
  snap.app_tables.map((t) => [t.name, t.doc.rows.length]),
);
console.log("seeded:", JSON.stringify(counts));

const admin = await session("admin@snu.ac.kr", "관리자 / 학부생 / 수리과학부");
const members = await table("members");
const infos = await table("private-info");
const seminars = (await table("seminars")).map((s) => ({
  ...s,
  presenterIds: s.presenterIds ?? [],
}));
console.log(`seminars backfilled with publicationStatus: ${backfilled}`);
const byStatus = {};
for (const s of seminars)
  byStatus[s.publicationStatus] = (byStatus[s.publicationStatus] ?? 0) + 1;
console.log("seminar statuses:", JSON.stringify(byStatus));
const studies = await table("studies");
const events = await table("events");

// ---------------------------------------------------------------- R1 public + admin crawl with real ids
const bad = [];
async function expect200(label, p, cookie) {
  const r = await get(p, cookie);
  if (r.status !== 200)
    bad.push(`${label} ${p} → ${r.status} ${r.location ?? ""}`);
  return r;
}
for (const p of [
  "/",
  "/about",
  "/about/charter",
  "/about/executives",
  "/archive",
  "/archive/seminars",
  "/archive/studies",
  "/archive/activities",
  "/archive/gallery",
  "/archive/projects",
  "/members",
]) {
  await expect200("guest", p);
}
const publicSeminars = seminars.filter(
  (s) => s.publicationStatus === "published",
);
for (const s of publicSeminars)
  await expect200("guest", `/archive/seminars/${s.id}`);
for (const p of [
  "/admin",
  "/admin/members",
  "/admin/seminars",
  "/admin/studies",
  "/admin/activities",
  "/admin/gallery",
  "/admin/executives",
  "/admin/mail",
  "/admin/events/new",
  "/admin/events/connect",
]) {
  await expect200("admin", p, admin);
}
for (const m of members)
  await expect200("admin", `/admin/members/${m.id}`, admin);
check(
  "R1 every public/admin page with real ids answers 200",
  bad.length === 0,
  `${bad.length} bad: ${bad.slice(0, 5).join(" | ")}`,
);

// ---------------------------------------------------------------- R2 every real member's own pages
const badMember = [];
let dashboards = 0;
for (const info of infos) {
  if (!info.email) continue;
  const m = members.find((x) => x.id === info.memberId);
  if (!m || m.status === "withdrawn") continue;
  const cookie = await session(
    info.email,
    `${m.name} / 학부생 / ${m.department}`,
  );
  const r = await get("/", cookie);
  if (r.status === 200) dashboards++;
  else badMember.push(`/ → ${r.status} ${r.location ?? ""}`);
  for (const p of ["/settings/notifications", "/study"]) {
    const x = await get(p, cookie);
    if (![200, 303].includes(x.status)) badMember.push(`${p} → ${x.status}`);
  }
  if (r.text.includes("데이터를 처리하는 중 오류"))
    badMember.push("dashboard error payload");
}
check(
  "R2 every real member's dashboard and settings render",
  badMember.length === 0,
  `dashboards=${dashboards} bad=${badMember.slice(0, 5).join(" | ")}`,
);

// ---------------------------------------------------------------- R3 stored phone shapes as the public/admin surfaces show them
const guestHome = await get("/");
const bareInPublic =
  guestHome.text.replace(/tel:\d+/g, "").match(/\b010\d{8}\b/g) ?? [];
check(
  "R3 no bare 010XXXXXXXX visible on the public cover",
  bareInPublic.length === 0,
  `${bareInPublic.length}`,
);
let bareInAdmin = 0;
for (const m of members) {
  const r = await get(`/admin/members/${m.id}`, admin);
  bareInAdmin += (r.text.replace(/tel:\d+/g, "").match(/\b010\d{8}\b/g) ?? [])
    .length;
}
check(
  "R3 no bare 010XXXXXXXX visible on admin member pages",
  bareInAdmin === 0,
  `${bareInAdmin}`,
);

// ---------------------------------------------------------------- R4 delete every real cancelled seminar (on this throwaway copy)
const hiddenWithActivity = seminars.filter(
  (s) => s.publicationStatus !== "published" && s.activityId,
);
console.log(
  `real seminars: ${seminars.length}, hidden with activity: ${hiddenWithActivity.length}`,
);
const archiveBefore = (await get("/archive/activities")).text;
for (const s of hiddenWithActivity) {
  const act = (await table("activities")).find((a) => a.id === s.activityId);
  const titleVisibleBefore = act ? archiveBefore.includes(act.title) : false;
  const del = await action("/admin/seminars", "delete", { id: s.id }, admin);
  const after = await get("/archive/activities");
  const acts = await table("activities");
  const stillThere = acts.some((a) => a.id === s.activityId);
  const resurfaced =
    act &&
    !titleVisibleBefore &&
    after.text.includes(act.title) &&
    // another visible activity may share the title — only count if ours is visible
    stillThere;
  const outcome =
    del.type === "success" ? "deleted" : `${del.status} ${del.data?.error}`;
  const others = act
    ? act.attendeeIds.filter((id) => !s.presenterIds.includes(id)).length
    : 0;
  console.log(
    `  seminar ${s.id} status=${s.publicationStatus} → ${outcome}; non-presenter credit=${others}; activity kept=${stillThere}`,
  );
  check(`R4 ${s.id} delete does not resurface its activity`, !resurfaced);
  if (del.type === "success")
    check(
      `R4 ${s.id} activity and sessions gone`,
      !stillThere &&
        !(await table("events")).some((e) => e.activityId === s.activityId),
    );
  else
    check(
      `R4 ${s.id} refusal is a CONFLICT with evidence`,
      (del.status === 409 && others > 0) ||
        (
          await Promise.all(
            events
              .filter((e) => e.activityId === s.activityId)
              .map((e) => queue(e.id)),
          )
        )
          .flat()
          .some((r) => r.status !== "rejected"),
    );
}

// ---------------------------------------------------------------- R5 studies routes as organizer (real ids)
let studyBad = 0;
for (const st of studies) {
  const orgInfo = infos.find(
    (i) => st.organizerIds.includes(i.memberId) && i.email,
  );
  if (!orgInfo) continue;
  const m = members.find((x) => x.id === orgInfo.memberId);
  const cookie = await session(
    orgInfo.email,
    `${m?.name} / 학부생 / ${m?.department}`,
  );
  for (const p of [
    `/study/${st.id}`,
    `/study/${st.id}/manage`,
    `/study/${st.id}/attendance`,
  ]) {
    const r = await get(p, cookie);
    if (![200, 303].includes(r.status)) studyBad++;
  }
}
check(
  "R5 study pages render for their real organizers",
  studyBad === 0,
  `${studyBad}`,
);

process.exitCode = summary(`real-data @ ${BASE}`) ? 1 : 0;
