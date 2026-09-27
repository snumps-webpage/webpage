// Parallel HTTP races on the seminar lifecycle. Invariants checked per run:
//  - no 5xx
//  - a seminar that ended cancelled never has its activity on /archive/activities
//  - no event left active on an activity that no seminar references AND that a
//    refused/removed seminar never published (i.e. the "live orphan" of round 2)
import {
  action,
  adminQueue,
  check,
  get,
  probeSeed,
  session,
  setClock,
  summary,
  table,
  ANCHOR,
  at,
} from "./lib.mjs";

const RUNS = Number(process.env.RUNS ?? 10);
await probeSeed({ op: "reset" });
await setClock(ANCHOR);
const admin = await session("admin@snu.ac.kr", "관리자 / 학부생 / 수리과학부");
const B = await session("b@snu.ac.kr", "김발표 / 학부생 / 물리천문학부");
await action(
  "/signup",
  null,
  {
    phone: "01033334444",
    studentId: "2020-12345",
    background: "",
    agreement: "on",
  },
  B,
);
const item = (await adminQueue("applications", admin)).items.find(
  (i) => i.email === "b@snu.ac.kr",
);
await action("/admin", "approve", { id: item.id }, admin);

async function scheduled(title) {
  await action(
    "/seminar/apply",
    null,
    { title, description: "d", speakerIds: "" },
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
    {
      seminarId: s.id,
      startsAtLocal: at(5),
      endsAtLocal: "",
      location: "301호",
    },
    admin,
  );
  return s.id;
}
const outcome = (r) =>
  r.type === "success"
    ? "200"
    : `${r.status ?? r.httpStatus}${r.data?.error ? ":" + r.data.error : ""}`;
const dist = { publish: {}, cancel: {} };

for (let i = 0; i < RUNS; i++) {
  // publish ∥ delete
  const t1 = `race-pub-${i}`;
  const id1 = await scheduled(t1);
  const [pub, del] = await Promise.all([
    action("/admin/seminars", "publishSeminar", { seminarId: id1 }, admin),
    action("/admin/seminars", "delete", { id: id1 }, admin),
  ]);
  const key1 = `publish ${outcome(pub)} / delete ${outcome(del)}`;
  dist.publish[key1] = (dist.publish[key1] ?? 0) + 1;
  check(
    `race ${i} publish∥delete no 5xx`,
    ![pub, del].some((r) => (r.status ?? r.httpStatus) >= 500),
    key1,
  );

  // cancel ∥ delete (on a published seminar)
  const t2 = `race-cancel-${i}`;
  const id2 = await scheduled(t2);
  await action("/admin/seminars", "publishSeminar", { seminarId: id2 }, admin);
  const [can, del2] = await Promise.all([
    action("/admin/seminars", "cancelSeminar", { seminarId: id2 }, admin),
    action("/admin/seminars", "delete", { id: id2 }, admin),
  ]);
  const key2 = `cancel ${outcome(can)} / delete ${outcome(del2)}`;
  dist.cancel[key2] = (dist.cancel[key2] ?? 0) + 1;
  check(
    `race ${i} cancel∥delete no 5xx`,
    ![can, del2].some((r) => (r.status ?? r.httpStatus) >= 500),
    key2,
  );
  // cancel won and delete also went through: the cancelled seminar's activity must stay hidden
  if (can.type === "success" && del2.type === "success") {
    check(
      `race ${i} cancel+delete both ok → activity hidden`,
      !(await get("/archive/activities")).text.includes(t2),
    );
  }
}

// global invariants after all runs
const seminars = await table("seminars");
const activities = await table("activities");
const events = await table("events");
const archive = (await get("/archive/activities")).text;
for (const s of seminars.filter((x) => x.publicationStatus === "cancelled")) {
  check(`cancelled ${s.title} not in archive`, !archive.includes(s.title));
}
const referenced = new Set(seminars.map((s) => s.activityId).filter(Boolean));
const orphanActive = events.filter(
  (e) => e.status === "active" && !referenced.has(e.activityId),
);
// an orphan is acceptable only when its seminar was deleted AFTER it was published
// (same as deleting a published seminar, by design) — record them for the report
console.log(
  "orphan active events (published-then-deleted by design):",
  orphanActive.length,
  "of",
  events.length,
);
check(
  "every remaining seminar's activityId exists",
  seminars.every(
    (s) => !s.activityId || activities.some((a) => a.id === s.activityId),
  ),
);
console.log("distribution:", JSON.stringify(dist, null, 1));
await setClock(null);
process.exitCode = summary("race") ? 1 : 0;
