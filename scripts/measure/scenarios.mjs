// End-to-end scenarios over real HTTP against a memory-backed dev server.
// Usage: BASE=http://127.0.0.1:5199 node scripts/measure/scenarios.mjs
import {
  BASE,
  action,
  adminQueue,
  check,
  get,
  probeSeed,
  putRows,
  queue,
  session,
  setClock,
  summary,
  table,
  ANCHOR,
  PREVIOUS_TERM_AT,
  TERM,
  at,
} from "./lib.mjs";

const EVIL = "evil.example";
const email = {
  admin: "admin@snu.ac.kr",
  a: "a@snu.ac.kr",
  b: "b@snu.ac.kr",
  c: "c@snu.ac.kr",
};
const admin = await session(email.admin, "관리자 / 학부생 / 수리과학부");
const A = await session(email.a, "홍길동 / 학부생 / 수리과학부");
const B = await session(email.b, "김발표 / 학부생 / 물리천문학부");
const C = await session(email.c, "이참가 / 대학원생 / 통계학과");

const memberIdOf = async (addr) =>
  (await table("private-info")).find((p) => p.email === addr)?.memberId;

async function signupAndApprove(cookie, addr, phone) {
  const sub = await action(
    "/signup",
    null,
    { phone, studentId: "2020-12345", background: "", agreement: "on" },
    cookie,
  );
  const q = await adminQueue("applications", admin);
  const item = (q.items ?? []).find((i) => i.email === addr);
  const ok = await action("/admin", "approve", { id: item?.id ?? "" }, admin);
  return { sub, ok };
}

// ---------------------------------------------------------------- setup
await probeSeed({ op: "reset" });
await setClock(PREVIOUS_TERM_AT); // the previous term
await signupAndApprove(A, email.a, "01011112222");
check("setup: A approved in the previous term", !!(await memberIdOf(email.a)));
await setClock(ANCHOR); // the current term, fixed point
await signupAndApprove(B, email.b, "01033334444");
await signupAndApprove(C, email.c, "01099990000");
const idA = await memberIdOf(email.a);
const idB = await memberIdOf(email.b);
const idC = await memberIdOf(email.c);
check(`setup: B, C approved in ${TERM}`, !!idB && !!idC);

// ---------------------------------------------------------------- S1 login redirect
{
  const r1 = await get(
    `/login?redirect=${encodeURIComponent("/\\" + EVIL)}`,
    B,
  );
  check(
    "S1 signed-in /\\host redirect stays on site",
    r1.status === 303 && r1.location === "/",
    `${r1.status} ${r1.location}`,
  );
  const r2 = await get(`/login?redirect=${encodeURIComponent("//" + EVIL)}`, B);
  check(
    "S1 signed-in //host redirect stays on site",
    r2.location === "/",
    `${r2.location}`,
  );
  const r3 = await get(
    `/login?redirect=${encodeURIComponent("/study?tab=1")}`,
    B,
  );
  check(
    "S1 signed-in internal redirect kept",
    r3.location === "/study?tab=1",
    `${r3.location}`,
  );
  const r4 = await get(`/login?redirect=${encodeURIComponent("/\\" + EVIL)}`);
  check(
    "S1 guest login page never carries the off-site target",
    r4.status === 200 && !r4.text.includes(EVIL),
    `${r4.status}`,
  );
  const r5 = await get("/study");
  const back = r5.location ?? "";
  const r6 = await get(back, B);
  check(
    "S1 guard → /login?redirect= → back to /study",
    r5.status === 303 && r6.location === "/study",
    `${back} → ${r6.location}`,
  );
}

// ---------------------------------------------------------------- S2 re-application across the term boundary
{
  const home = await get("/study", A);
  check(
    "S2 unregistered A is sent to re-apply",
    home.status === 303 && home.location === "/signup",
    `${home.status} ${home.location}`,
  );
  const form = await get("/signup", A);
  check("S2 A can open /signup", form.status === 200, `${form.status}`);
  const sub = await action(
    "/signup",
    null,
    {
      phone: "01011112222",
      studentId: "2020-12345",
      background: "",
      agreement: "on",
    },
    A,
  );
  check(
    "S2 re-application accepted",
    sub.type === "success" || sub.type === "redirect",
    JSON.stringify(sub).slice(0, 120),
  );
  const wait = await get("/wait", A);
  check(
    "S2 re-applicant sees /wait",
    wait.status === 200,
    `${wait.status} ${wait.location ?? ""}`,
  );
  const bWait = await get("/wait", B);
  check(
    "S2 registered member still bounced from /wait",
    bWait.status === 303 || bWait.status === 302,
    `${bWait.status} ${bWait.location}`,
  );
  const q = await adminQueue("applications", admin);
  const item = (q.items ?? []).find((i) => i.email === email.a);
  await action("/admin", "approve", { id: item?.id ?? "" }, admin);
  const regs = (await table("registrations"))
    .filter((r) => r.memberId === idA)
    .map((r) => r.term);
  check(
    `S2 re-approval registers A for ${TERM} on the same member row`,
    regs.includes(TERM) && (await memberIdOf(email.a)) === idA,
    regs.join(","),
  );
}

// ---------------------------------------------------------------- seminar helpers
async function publishedSeminar(title, startsAtLocal) {
  await action(
    "/seminar/apply",
    null,
    { title, description: "설명", speakerIds: "" },
    B,
  );
  const reqs = await adminQueue("seminar-requests", admin);
  const req = (reqs.items ?? []).find((i) => i.title === title);
  await action("/admin", "approveSeminar", { id: req?.id ?? "" }, admin);
  const seminar = (await table("seminars")).find((s) => s.title === title);
  await action(
    "/admin/seminars",
    "scheduleSeminar",
    {
      seminarId: seminar.id,
      startsAtLocal,
      endsAtLocal: "",
      location: "상산관 301호",
    },
    admin,
  );
  const pub = await action(
    "/admin/seminars",
    "publishSeminar",
    { seminarId: seminar.id },
    admin,
  );
  const s = (await table("seminars")).find((x) => x.id === seminar.id);
  const event = (await table("events")).find(
    (e) => e.activityId === s.activityId,
  );
  return { seminarId: s.id, activityId: s.activityId, event, pub };
}
// `tel:` hrefs are digits-only by design; only the visible text must be hyphenated.
const shown = (text, raw) => text.replace(/tel:\d+/g, "").includes(raw);
const archiveHas = async (title) =>
  (await get("/archive/activities")).text.includes(title);
const dashboardHas = async (cookie, title) =>
  (await get("/", cookie)).text.includes(title);

// ---------------------------------------------------------------- S3 dashboard apply / cancel
{
  const s = await publishedSeminar("S3 대시보드 신청", at(3));
  check(
    "S3 setup: seminar published with an event",
    s.pub.type === "success" && !!s.event,
    JSON.stringify(s.pub.data ?? s.pub).slice(0, 120),
  );
  const ap = await action("/", "applyActivity", { eventId: s.event.id }, C);
  check(
    "S3 applyActivity returns the updated row",
    ap.data?.operation === "activityApplied" &&
      ap.data?.activity?.isApplied === true &&
      ap.data?.activity?.eventId === s.event.id,
    JSON.stringify(ap.data).slice(0, 160),
  );
  const stored = (await table("events")).find((e) => e.id === s.event.id);
  check("S3 application stored", stored.applicantIds.includes(idC));
  const cn = await action("/", "cancelActivity", { eventId: s.event.id }, C);
  check(
    "S3 cancelActivity returns the updated row",
    cn.data?.operation === "activityCancelled" &&
      cn.data?.activity?.isApplied === false &&
      cn.data?.activity?.canApply === true,
    JSON.stringify(cn.data).slice(0, 160),
  );
  const unreg = await session("z@snu.ac.kr", "무명 / 학부생 / 수학과");
  const denied = await action(
    "/",
    "applyActivity",
    { eventId: s.event.id },
    unreg,
  );
  check(
    "S3 non-member cannot apply (guard 303 or failure)",
    denied.type === "failure" ||
      denied.type === "redirect" ||
      denied.httpStatus === 303,
    `${denied.type} ${denied.httpStatus}`,
  );
  const missing = await action("/", "applyActivity", { eventId: "nope" }, C);
  check(
    "S3 unknown event → 404 failure, no crash",
    missing.type === "failure" && missing.status === 404,
    `${missing.type} ${missing.status}`,
  );
}

// ---------------------------------------------------------------- S4 cancelled seminar delete (no credit)
{
  const title = "S4 취소후삭제";
  const s = await publishedSeminar(title, at(4));
  await action("/", "applyActivity", { eventId: s.event.id }, C);
  check("S4 published activity visible in archive", await archiveHas(title));
  const cancel = await action(
    "/admin/seminars",
    "cancelSeminar",
    { seminarId: s.seminarId },
    admin,
  );
  check(
    "S4 cancel ok",
    cancel.type === "success",
    JSON.stringify(cancel).slice(0, 120),
  );
  check(
    "S4 cancelled activity hidden from archive",
    !(await archiveHas(title)),
  );
  check(
    "S4 cancelled activity hidden from dashboard",
    !(await dashboardHas(C, title)),
  );
  const del = await action(
    "/admin/seminars",
    "delete",
    { id: s.seminarId },
    admin,
  );
  check(
    "S4 admin can delete the cancelled seminar",
    del.type === "success",
    JSON.stringify(del).slice(0, 160),
  );
  check(
    "S4 activity does NOT resurface in archive",
    !(await archiveHas(title)),
  );
  check(
    "S4 activity does NOT resurface in dashboard",
    !(await dashboardHas(C, title)),
  );
  const acts = await table("activities");
  const evs = await table("events");
  check("S4 activity row removed", !acts.some((a) => a.id === s.activityId));
  check(
    "S4 session rows removed",
    !evs.some((e) => e.activityId === s.activityId),
  );
  const attend = await get(
    `/events/${s.event.pathId}/${s.event.attendCode}`,
    C,
  );
  check(
    "S4 old check-in link is dead (404)",
    attend.status === 404,
    `${attend.status}`,
  );
}

// ---------------------------------------------------------------- S5 credit blocks delete until cleared
{
  const title = "S5 출석기록";
  const s = await publishedSeminar(title, at(5));
  const set = await action(
    "/admin/activities",
    "setAttendees",
    { id: s.activityId, attendeeIds: [idC] },
    admin,
  );
  check("S5 setup: attendee credited", set.type === "success");
  await action(
    "/admin/seminars",
    "cancelSeminar",
    { seminarId: s.seminarId },
    admin,
  );
  const del = await action(
    "/admin/seminars",
    "delete",
    { id: s.seminarId },
    admin,
  );
  check(
    "S5 delete refused while credit exists (409 CONFLICT)",
    del.type === "failure" &&
      del.status === 409 &&
      del.data?.error === "CONFLICT",
    JSON.stringify(del).slice(0, 160),
  );
  check(
    "S5 refused delete leaves the seminar",
    (await table("seminars")).some((x) => x.id === s.seminarId),
  );
  check(
    "S5 refused delete keeps the activity hidden",
    !(await archiveHas(title)),
  );
  const page = await get("/admin/seminars", admin);
  check(
    "S5 admin seminars page renders",
    page.status === 200,
    `${page.status}`,
  );
  await action(
    "/admin/activities",
    "setAttendees",
    { id: s.activityId },
    admin,
  );
  const del2 = await action(
    "/admin/seminars",
    "delete",
    { id: s.seminarId },
    admin,
  );
  check(
    "S5 delete succeeds once credit is cleared",
    del2.type === "success",
    JSON.stringify(del2).slice(0, 160),
  );
  check("S5 still hidden after delete", !(await archiveHas(title)));
}

// ---------------------------------------------------------------- S6 pending check-in blocks delete
{
  const title = "S6 체크인대기";
  const s = await publishedSeminar(title, at(0, "09:00"));
  const page = await get(`/events/${s.event.pathId}/${s.event.attendCode}`, C);
  const attended = await action(
    `/events/${s.event.pathId}/${s.event.attendCode}`,
    "attend",
    {},
    C,
  );
  const q = await queue(s.event.id);
  check(
    "S6 setup: check-in pending",
    page.status === 200 && q.some((r) => r.status === "pending"),
    `${page.status} ${attended.type} q=${q.length}`,
  );
  const cancel = await action(
    "/admin/seminars",
    "cancelSeminar",
    { seminarId: s.seminarId, acknowledgeStarted: "yes" },
    admin,
  );
  check(
    "S6 cancel after start with acknowledgement",
    cancel.type === "success",
    JSON.stringify(cancel).slice(0, 120),
  );
  const del = await action(
    "/admin/seminars",
    "delete",
    { id: s.seminarId },
    admin,
  );
  check(
    "S6 delete refused while a check-in is pending",
    del.type === "failure" && del.status === 409,
    JSON.stringify(del).slice(0, 120),
  );
  const row = (await queue(s.event.id))[0];
  await action(
    "/admin",
    "rejectAttendance",
    { eventId: s.event.id, id: row?.id ?? "" },
    admin,
  );
  const del2 = await action(
    "/admin/seminars",
    "delete",
    { id: s.seminarId },
    admin,
  );
  check(
    "S6 delete succeeds after the check-in is rejected",
    del2.type === "success",
    JSON.stringify(del2).slice(0, 120),
  );
  check("S6 queue document removed", (await queue(s.event.id)).length === 0);
  check("S6 hidden after delete", !(await archiveHas(title)));
}

// ---------------------------------------------------------------- S7 published seminar delete (unchanged behavior)
{
  const title = "S7 공개후삭제";
  const s = await publishedSeminar(title, at(6));
  const del = await action(
    "/admin/seminars",
    "delete",
    { id: s.seminarId },
    admin,
  );
  check("S7 published seminar delete ok", del.type === "success");
  check(
    "S7 its (never hidden) activity stays in the archive",
    await archiveHas(title),
  );
}

// ---------------------------------------------------------------- S8 profile + phone formatting
{
  const ok = await action(
    "/",
    "updateProfile",
    { phone: "01077776666", background: "  대수학  " },
    C,
  );
  check(
    "S8 profile save returns normalized fields",
    ok.data?.operation === "profileUpdated" &&
      ok.data?.profile?.phone === "010-7777-6666" &&
      ok.data?.profile?.background === "대수학",
    JSON.stringify(ok.data).slice(0, 160),
  );
  const infoC = (await table("private-info")).find((p) => p.memberId === idC);
  check(
    "S8 stored phone normalized",
    infoC.phone === "010-7777-6666",
    infoC.phone.replace(/\d/g, "D"),
  );
  const bad = await action(
    "/",
    "updateProfile",
    { phone: "12", background: "" },
    C,
  );
  check(
    "S8 malformed phone refused with a field issue",
    bad.type === "failure" && bad.status === 400 && !!bad.data?.issues?.phone,
    JSON.stringify(bad).slice(0, 160),
  );
  const after = (await table("private-info")).find((p) => p.memberId === idC);
  check("S8 refused save wrote nothing", after.phone === "010-7777-6666");

  // simulate an archived bare-digit number on A's row, make A the current president
  const infos = await table("private-info");
  await putRows(
    "private-info",
    infos.map((p) => (p.memberId === idA ? { ...p, phone: "01055554444" } : p)),
  );
  const roles = await action(
    `/admin/members/${idA}`,
    "setRoles",
    { roles: `${TERM} 회장` },
    admin,
  );
  check(
    `S8 setup: A is the ${TERM} president`,
    roles.type === "success",
    JSON.stringify(roles).slice(0, 120),
  );
  const dash = await get("/", A);
  check(
    "S8 dashboard shows the hyphenated form",
    dash.text.includes("010-5555-4444") && !shown(dash.text, "01055554444"),
  );
  const noti = await get("/settings/notifications", A);
  check(
    "S8 notification settings show the hyphenated form",
    noti.status === 200 &&
      noti.text.includes("010-5555-4444") &&
      !shown(noti.text, "01055554444"),
    `${noti.status}`,
  );
  const adm = await get(`/admin/members/${idA}`, admin);
  check(
    "S8 admin member detail shows the hyphenated form",
    adm.status === 200 &&
      adm.text.includes("010-5555-4444") &&
      !shown(adm.text, "01055554444"),
    `${adm.status}`,
  );
  const guest = await get("/");
  check(
    "S8 public cover shows the president phone hyphenated",
    guest.text.includes("010-5555-4444") && !shown(guest.text, "01055554444"),
  );
  const save = await action(
    "/",
    "updateProfile",
    { phone: "01055554444", background: "" },
    A,
  );
  check(
    "S8 re-saving the prefilled value succeeds",
    save.data?.operation === "profileUpdated",
    JSON.stringify(save).slice(0, 120),
  );
}

// ---------------------------------------------------------------- S10 round-2 findings (adversarial run)
{
  for (const q of [
    "/.//" + EVIL,
    "/%2e//" + EVIL,
    "/a/..//" + EVIL,
    "/./\\" + EVIL,
    "/.///" + EVIL + "/x",
  ]) {
    const r = await get(`/login?redirect=${encodeURIComponent(q)}`, B);
    check(
      `S10 dot-segment redirect ${JSON.stringify(q)} stays on site`,
      r.status === 303 && r.location === "/",
      `${r.location}`,
    );
  }

  // presenter's dashboard must not show the request of a deleted cancelled seminar
  const title = "S10 요청재노출";
  const s = await publishedSeminar(title, at(7));
  await action(
    "/admin/seminars",
    "cancelSeminar",
    { seminarId: s.seminarId },
    admin,
  );
  // Decision 2026-09-27: the presenter keeps seeing the request, as 취소됨 —
  // before and after an admin deletes the cancelled seminar.
  const shownCancelled = async () => {
    const t = (await get("/", B)).text;
    const at = t.indexOf(title);
    return at >= 0 && t.slice(at, at + 400).includes("취소됨");
  };
  check(
    "S10 cancelled seminar's request shown as 취소됨 to the presenter",
    await shownCancelled(),
  );
  const del = await action(
    "/admin/seminars",
    "delete",
    { id: s.seminarId },
    admin,
  );
  check(
    "S10 delete ok",
    del.type === "success",
    JSON.stringify(del).slice(0, 100),
  );
  check(
    "S10 after delete the request stays, still 취소됨",
    await shownCancelled(),
  );
  check(
    "S10 after delete the activity stays out of the archive",
    !(await archiveHas(title)),
  );

  // shared activity: a second seminar points at the same activity → refuse, touch nothing
  const t2 = "S10 공유활동";
  const s2 = await publishedSeminar(t2, at(8));
  await action(
    "/admin/seminars",
    "cancelSeminar",
    { seminarId: s2.seminarId },
    admin,
  );
  const other = await publishedSeminar("S10 다른세미나", at(9));
  const sems = await table("seminars");
  await putRows(
    "seminars",
    sems.map((x) =>
      x.id === other.seminarId ? { ...x, activityId: s2.activityId } : x,
    ),
  );
  const del2 = await action(
    "/admin/seminars",
    "delete",
    { id: s2.seminarId },
    admin,
  );
  check(
    "S10 shared activity → 409, nothing deleted",
    del2.status === 409 &&
      (await table("activities")).some((a) => a.id === s2.activityId),
    JSON.stringify(del2).slice(0, 100),
  );

  // hidden activity's event cannot be applied to (and nothing is written)
  const hiddenEvent = (await table("events")).find(
    (e) => e.activityId === s2.activityId,
  );
  const evs = await table("events");
  await putRows(
    "events",
    evs.map((e) => (e.id === hiddenEvent.id ? { ...e, status: "active" } : e)),
  );
  const ap = await action("/", "applyActivity", { eventId: hiddenEvent.id }, C);
  const after = (await table("events")).find((e) => e.id === hiddenEvent.id);
  check(
    "S10 apply to a hidden activity's event → 404, no write",
    ap.status === 404 && !after.applicantIds.includes(idC),
    `${ap.type} ${ap.status}`,
  );

  // unregistered non-alumnus: no profile edit, no transfer actions on `/`
  const Z = await session("z2@snu.ac.kr", "무소속 / 학부생 / 수학과");
  await setClock(PREVIOUS_TERM_AT);
  await signupAndApprove(Z, "z2@snu.ac.kr", "01012121212");
  await setClock(ANCHOR);
  const prof = await action(
    "/",
    "updateProfile",
    { phone: "01034343434", background: "" },
    Z,
  );
  check(
    "S10 unregistered non-alumnus profile edit → 403",
    prof.status === 403,
    `${prof.type} ${prof.status}`,
  );
  const tr = await action("/", "acceptTransfer", { studyId: "x" }, Z);
  check(
    "S10 unregistered member transfer on / → 403",
    tr.status === 403,
    `${tr.type} ${tr.status}`,
  );
}

// ---------------------------------------------------------------- S11 P2 changes
{
  // a cancelled event does not exist for members → 404 (with its own message)
  const title = "S11 취소이벤트";
  const s = await publishedSeminar(title, at(10));
  await action(
    "/admin/seminars",
    "cancelSeminar",
    { seminarId: s.seminarId },
    admin,
  );
  const ap = await action("/", "applyActivity", { eventId: s.event.id }, C);
  check(
    "S11 apply to a cancelled event → 404, no write",
    ap.status === 404 &&
      !(await table("events"))
        .find((e) => e.id === s.event.id)
        ?.applicantIds.includes(idC),
    `${ap.type} ${ap.status}`,
  );

  // guard refusals carry no-store (W-23)
  const refused = await get("/admin", C);
  check(
    "S11 guard 404 carries no-store",
    refused.status === 404 &&
      refused.headers.get("cache-control") === "private, no-store" &&
      refused.headers.get("vercel-cdn-cache-control") === "no-store",
    `${refused.status} ${refused.headers.get("cache-control")}`,
  );
  const refusedJson = await fetch(
    `${(await import("./lib.mjs")).BASE}/admin/members/x`,
    { headers: { cookie: C, accept: "application/json" } },
  );
  check(
    "S11 guard 404 as JSON carries no-store",
    refusedJson.status === 404 &&
      refusedJson.headers.get("cache-control") === "private, no-store",
    `${refusedJson.status}`,
  );

  // the orphaned seminar editor on `/` is gone
  const gone = await action("/", "updateSeminar", { id: s.seminarId }, B);
  check(
    "S11 `/?/updateSeminar` no longer exists",
    gone.type !== "success",
    `${gone.type} ${gone.status ?? gone.httpStatus}`,
  );

  // admin study list renders with real session counts
  const studies = await get("/admin/studies", admin);
  check("S11 admin studies page renders", studies.status === 200);
}

// ---------------------------------------------------------------- S9 crawl
{
  const pages = {
    guest: [
      "/",
      "/login",
      "/about",
      "/about/charter",
      "/about/executives",
      "/archive",
      "/archive/seminars",
      "/archive/studies",
      "/archive/activities",
      "/archive/gallery",
      "/members",
      "/sitemap.xml",
      "/robots.txt",
    ],
    member: [
      "/",
      "/study",
      "/study/apply",
      "/seminar/apply",
      "/settings/notifications",
      "/settings/withdraw",
      "/events/manage",
    ],
    admin: [
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
    ],
  };
  const who = { guest: undefined, member: B, admin };
  for (const [role, list] of Object.entries(pages)) {
    for (const p of list) {
      const r = await get(p, who[role]);
      check(
        `S9 ${role} ${p}`,
        r.status === 200,
        `${r.status} ${r.location ?? ""}`,
      );
    }
  }
}

await setClock(null);
process.exitCode = summary(`scenarios @ ${BASE}`) ? 1 : 0;
