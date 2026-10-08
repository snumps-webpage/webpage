// S12 — the post-audit fixes (6ab4f33..HEAD) over real HTTP, each probe named
// after its commit. Every check holds on the fixed code; run against the
// pre-audit build (start.sh --ref 6ab4f33) the probes for fixed defects FAIL.
// Usage: BASE=http://127.0.0.1:5199 node scripts/measure/audit-fixes.mjs
import {
  BASE,
  action,
  adminQueue,
  check,
  get,
  probeSeed,
  putRows,
  session,
  setClock,
  summary,
  table,
  ANCHOR,
  PREVIOUS_TERM_AT,
  TERM,
  at,
  memberIdOf,
} from "./lib.mjs";

const email = {
  admin: "admin@snu.ac.kr",
  a: "a12@snu.ac.kr",
  b: "b12@snu.ac.kr",
  c: "c12@snu.ac.kr",
  d: "d12@snu.ac.kr",
};
const admin = await session(email.admin, "관리자 / 학부생 / 수리과학부");
const A = await session(email.a, "가신청 / 학부생 / 수리과학부");
const B = await session(email.b, "나조직 / 학부생 / 물리천문학부");
const C = await session(email.c, "다회장 / 대학원생 / 통계학과");
const D = await session(email.d, "라동문 / 학부생 / 수학과");

// 합성 데이터만 — 전화번호는 실제로 쓰이지 않는 형태의 가짜 번호다.
async function signupAndApprove(cookie, addr, phone) {
  await action(
    "/signup",
    null,
    { phone, studentId: "2020-00000", background: "", agreement: "on" },
    cookie,
  );
  const q = await adminQueue("applications", admin);
  const item = (q.items ?? []).find((i) => i.email === addr);
  return action("/admin", "approve", { id: item?.id ?? "" }, admin);
}

async function publishedSeminar(title, startsAtLocal, cookie, addr) {
  await action(
    "/seminar/apply",
    null,
    {
      kind: "regular",
      title,
      description: "설명",
      duration: "60분",
      speakerIds: (await memberIdOf(addr)) ?? "",
    },
    cookie,
  );
  const reqs = await adminQueue("seminar-requests", admin);
  const req = (reqs.items ?? []).find((i) => i.title === title);
  await action("/admin", "approveSeminar", { id: req?.id ?? "" }, admin);
  const seminar = (await table("seminars")).find((s) => s.title === title);
  await action(
    "/admin/seminars",
    "scheduleSeminar",
    {
      seminarId: seminar?.id ?? "",
      startsAtLocal,
      endsAtLocal: "",
      location: "상산관 301호",
    },
    admin,
  );
  await action(
    "/admin/seminars",
    "publishSeminar",
    { seminarId: seminar?.id ?? "" },
    admin,
  );
  const s = (await table("seminars")).find((x) => x.id === seminar?.id);
  const event = (await table("events")).find(
    (e) => e.activityId === s?.activityId,
  );
  return { seminarId: s?.id, activityId: s?.activityId, event };
}

/** 한 행만 바꿔 표 전체를 다시 넣는다 (시드 API의 put은 문서 단위). */
async function patchRow(name, match, patch) {
  const rows = await table(name);
  await putRows(
    name,
    rows.map((r) => (match(r) ? { ...r, ...patch } : r)),
  );
}

const brief = (r) => JSON.stringify(r?.data ?? r).slice(0, 140);
const failed = (r, status, code) =>
  r.type === "failure" &&
  r.status === status &&
  (code === undefined || r.data?.error === code);

// ---------------------------------------------------------------- setup
await probeSeed({ op: "reset" });
await setClock(PREVIOUS_TERM_AT);
await signupAndApprove(A, email.a, "01000001111");
await signupAndApprove(D, email.d, "01000004444");
await setClock(ANCHOR);
await signupAndApprove(B, email.b, "01000002222");
await signupAndApprove(C, email.c, "01000003333");
const idA = await memberIdOf(email.a);
const idB = await memberIdOf(email.b);
const idC = await memberIdOf(email.c);
const idD = await memberIdOf(email.d);
check("S12 setup: four synthetic members", !!idA && !!idB && !!idC && !!idD);
const [termYear] = ANCHOR.split("-");

// ---------------------------------------------------------------- 2ad2f5a guard answers enhanced submissions
{
  // D: 직전 학기 회원, 동문 아님 → 이번 학기엔 재가입 대상. use:enhance 제출은
  // HTML로 가는 303이 아니라 Kit의 ActionResult를 받아야 한다.
  const r = await action("/study/apply", "submit", { title: "x" }, D);
  check(
    "S12 enhanced POST by an unregistered member → ActionResult redirect to /signup (2ad2f5a)",
    r.httpStatus === 200 && r.type === "redirect" && r.location === "/signup",
    `${r.httpStatus} ${r.type} ${r.location ?? ""}`,
  );
}

// ---------------------------------------------------------------- 8b34553 member-zone write gate
{
  // D becomes an alumnus: may view the member zone, may not write to it.
  await patchRow("members", (m) => m.id === idD, { isAlumni: true });
  const view = await get("/study", D);
  check(
    "S12 setup: alumnus can view the member zone",
    view.status === 200,
    `${view.status} ${view.location ?? ""}`,
  );
  for (const method of ["PUT", "PATCH", "DELETE"]) {
    const res = await fetch(`${BASE}/study/apply`, {
      method,
      redirect: "manual",
      headers: { cookie: D, origin: BASE, accept: "application/json" },
    });
    check(
      `S12 alumnus ${method} /study/apply → 403 no-store (8b34553)`,
      res.status === 403 &&
        res.headers.get("cache-control") === "private, no-store",
      `${res.status} ${res.headers.get("cache-control")}`,
    );
  }
}

// ---------------------------------------------------------------- 5112ccf seminar timing across the term boundary
{
  // PREVIOUS_TERM_AT는 항상 방학(학기 시작 20일 전)이다 — 제안 대상은 다가올 학기.
  const firstMonth = TERM.endsWith("-1") ? 3 : 9;
  const storedTiming = TERM.endsWith("-1") ? "12월 말" : "6월 말"; // 직전 학기의 달
  await setClock(PREVIOUS_TERM_AT);
  const form = await get("/seminar/apply", A);
  check(
    `S12 vacation apply form offers the coming term (${firstMonth}월) (5112ccf)`,
    form.status === 200 && form.text.includes(`value="${firstMonth}월 초"`),
    `${form.status}`,
  );
  const title = "S12 시점유지";
  const sub = await action(
    "/seminar/apply",
    null,
    {
      kind: "regular",
      title,
      description: "설명",
      duration: "60분",
      preferredTiming: storedTiming,
      speakerIds: idA ?? "",
    },
    A,
  );
  check(
    "S12 setup: request with a previous-term timing submitted",
    sub.type === "success" || sub.type === "redirect",
    brief(sub),
  );
  await setClock(ANCHOR);
  await signupAndApprove(A, email.a, "01000001111"); // A re-registers for TERM
  const req = (await table("seminar-requests")).find((r) => r.title === title);
  const edit = await get(`/seminar/edit/${req?.id}`, A);
  check(
    "S12 edit form after the boundary keeps the stored timing as an option (5112ccf)",
    edit.status === 200 && edit.text.includes(`value="${storedTiming}"`),
    `${edit.status} stored=${req?.preferredTiming === storedTiming}`,
  );

  // 1812d39: a stored javascript: attachment is not handed to the review card
  await patchRow("seminar-requests", (r) => r.id === req?.id, {
    attachment: "javascript:alert(1)",
  });
  const queued = (
    (await adminQueue("seminar-requests", admin)).items ?? []
  ).find((i) => i.id === req?.id);
  check(
    "S12 admin review card gets no javascript: attachment link (1812d39)",
    !!queued && queued.attachmentUrl === null,
    `queued=${!!queued} js=${String(queued?.attachmentUrl).startsWith("javascript:")}`,
  );
}

// ---------------------------------------------------------------- c1d863e admin forms refuse what they cannot do
{
  const impossible = `${termYear}-02-30T10:00`;
  const ev = await action(
    "/admin/events/new",
    null,
    { title: "S12 없는날", type: "기타", date: impossible },
    admin,
  );
  check(
    "S12 new event on 02-30 → 400 with a startsAtLocal issue (c1d863e)",
    failed(ev, 400, "VALIDATION_FAILED") && !!ev.data?.issues?.startsAtLocal,
    `${ev.type} ${ev.status ?? ev.httpStatus}`,
  );
  check(
    "S12 refused 02-30 event wrote nothing (c1d863e)",
    !(await table("events")).some((e) => e.title === "S12 없는날"),
  );

  const act = await action(
    "/admin/activities",
    "create",
    {
      title: "S12 역순",
      type: "기타",
      start: at(2, "19:00"),
      end: at(2, "18:00"),
    },
    admin,
  );
  check(
    "S12 activity with end before start → 400 on end (c1d863e)",
    failed(act, 400, "VALIDATION_FAILED") && !!act.data?.issues?.end,
    `${act.type} ${act.status ?? act.httpStatus}`,
  );
  const act2 = await action(
    "/admin/activities",
    "create",
    {
      title: "S12 사월삼십일일",
      type: "기타",
      start: `${termYear}-04-31T10:00`,
      end: "",
    },
    admin,
  );
  check(
    "S12 activity on 04-31 → 400 on start (c1d863e)",
    failed(act2, 400, "VALIDATION_FAILED") && !!act2.data?.issues?.start,
    `${act2.type} ${act2.status ?? act2.httpStatus}`,
  );

  // an update's end without a start used to be dropped silently
  await action(
    "/admin/activities",
    "create",
    {
      title: "S12 단독활동",
      type: "기타",
      start: at(2, "18:00"),
      end: at(2, "19:00"),
    },
    admin,
  );
  const lone = (await table("activities")).find(
    (a) => a.title === "S12 단독활동",
  );
  const endOnly = await action(
    "/admin/activities",
    "update",
    {
      id: lone?.id ?? "",
      title: "S12 단독활동",
      type: "기타",
      start: "",
      end: at(2, "21:00"),
    },
    admin,
  );
  check(
    "S12 activity update with an end but no start → 400 on start (c1d863e)",
    failed(endOnly, 400, "VALIDATION_FAILED") && !!endOnly.data?.issues?.start,
    `${endOnly.type} ${endOnly.status ?? endOnly.httpStatus}`,
  );

  // an event whose end has passed cannot be opened
  const past = await action(
    "/admin/events/new",
    null,
    { title: "S12 지난이벤트", type: "기타", date: at(-3, "10:00") },
    admin,
  );
  const pastEvent = (await table("events")).find(
    (e) => e.title === "S12 지난이벤트",
  );
  check(
    "S12 setup: past event created",
    !!pastEvent,
    `${past.type} ${past.status ?? past.httpStatus}`,
  );
  const open = await action(
    "/admin",
    "activateEvent",
    { id: pastEvent?.id ?? "" },
    admin,
  );
  check(
    "S12 opening an event whose end passed → 409 with a message (c1d863e)",
    failed(open, 409, "CONFLICT") &&
      typeof open.data?.message === "string" &&
      open.data.message.includes("종료 시각이 지난"),
    brief(open),
  );
  // the dashboard stops offering the button (the row's serialized capabilities
  // follow its id in the page data)
  const dash = await get("/admin", admin);
  const row = dash.text.slice(dash.text.indexOf(pastEvent?.id ?? "\u0000"));
  const offered = row.match(/canActivate:(\w+)/)?.[1];
  check(
    "S12 dashboard hides 'open' for an event whose end passed (c1d863e)",
    dash.status === 200 && offered === "false",
    `${dash.status} canActivate=${offered}`,
  );
  const upd = await action(
    "/admin",
    "updateEvent",
    {
      id: pastEvent?.id ?? "",
      title: "S12 지난이벤트",
      type: "기타",
      start: `${termYear}-02-30T10:00`,
      end: "",
    },
    admin,
  );
  check(
    "S12 dashboard event edit to 02-30 → 400 (c1d863e)",
    failed(upd, 400, "VALIDATION_FAILED") && !!upd.data?.issues?.startsAtLocal,
    `${upd.type} ${upd.status ?? upd.httpStatus}`,
  );
}

// ---------------------------------------------------------------- 7b082f7 + c1d863e seminar record edit and its copies
{
  const s = await publishedSeminar("S12 기록수정", at(6), B, email.b);
  check(
    "S12 setup: published seminar with an attendance event",
    !!s.event && (s.event.presenterIds ?? []).includes(idB),
  );
  const renamed = "S12 기록수정 후";
  const upd = await action(
    "/admin/seminars",
    "update",
    {
      id: s.seminarId ?? "",
      title: renamed,
      semester: TERM,
      presenterIds: idC,
    },
    admin,
  );
  const event = (await table("events")).find((e) => e.id === s.event?.id);
  const activity = (await table("activities")).find(
    (a) => a.id === s.activityId,
  );
  check(
    "S12 record edit carries presenters to the attendance event (7b082f7)",
    upd.type === "success" &&
      event?.presenterIds?.includes(idC) &&
      !event?.presenterIds?.includes(idB),
    `${upd.type} old=${event?.presenterIds?.includes(idB)} new=${event?.presenterIds?.includes(idC)}`,
  );
  check(
    "S12 record edit carries the title to event and activity (7b082f7)",
    event?.title === renamed && activity?.title === renamed,
    `event=${event?.title === renamed} activity=${activity?.title === renamed}`,
  );

  // the seminar's activity moves only with its seminar
  const paired = await action(
    "/admin/activities",
    "update",
    {
      id: s.activityId ?? "",
      title: "S12 활동만 바꿈",
      type: activity?.type ?? "seminar",
      start: "",
      end: "",
    },
    admin,
  );
  check(
    "S12 retitling a seminar's activity alone → 409 naming the seminar editor (c1d863e)",
    failed(paired, 409, "CONFLICT") &&
      String(paired.data?.message ?? "").includes("세미나 관리"),
    brief(paired),
  );

  // e734279: a re-joined presenter named by their legacy id is named, not "Unknown"
  const members = await table("members");
  const rowB = members.find((m) => m.id === idB);
  const legacyId = "legacy-s12-b";
  await putRows("legacy-members", [
    { ...rowB, id: legacyId, legacyMemberId: null, roles: [] },
  ]);
  await patchRow("members", (m) => m.id === idB, { legacyMemberId: legacyId });
  await patchRow("seminars", (x) => x.id === s.seminarId, {
    presenterIds: [legacyId],
  });
  const detail = await get(`/archive/seminars/${s.seminarId}`);
  check(
    "S12 seminar detail names a re-joined presenter by the new row (e734279)",
    detail.status === 200 &&
      detail.text.includes(rowB?.name ?? "\u0000") &&
      !detail.text.includes("Unknown"),
    `${detail.status} unknown=${detail.text.includes("Unknown")}`,
  );
  await patchRow("members", (m) => m.id === idB, { legacyMemberId: null });
}

// ---------------------------------------------------------------- 0258c28 + fc7a90e studies
{
  const create = await action(
    "/admin/studies",
    "create",
    {
      title: "S12 스터디",
      semester: TERM,
      description: "합성 스터디 설명입니다.",
      textbook: "교재",
      note: "",
      organizerId: idB ?? "",
    },
    admin,
  );
  const study = (await table("studies")).find((x) => x.title === "S12 스터디");
  check(
    "S12 admin-made study puts its organizer on the participant list (0258c28)",
    create.type === "success" && !!study?.participantIds?.includes(idB),
    `${create.type} participant=${!!study?.participantIds?.includes(idB)}`,
  );
  const ghost = await action(
    "/admin/studies",
    "create",
    {
      title: "S12 유령스터디",
      semester: TERM,
      description: "합성 스터디 설명입니다.",
      textbook: "교재",
      note: "",
      organizerId: "no-such-member",
    },
    admin,
  );
  check(
    "S12 admin study with a ghost organizer → 400, nothing stored (0258c28)",
    failed(ghost, 400, "VALIDATION_FAILED") &&
      !(await table("studies")).some((x) => x.title === "S12 유령스터디"),
    `${ghost.type} ${ghost.status ?? ghost.httpStatus}`,
  );

  const manage = `/study/${study?.id}/manage`;
  // A never asked to join; C asks and is accepted — the attendance pool below
  // is C, so the cancelled-session probe does not lean on the organizer rule.
  const stranger = await action(
    manage,
    "acceptParticipant",
    { memberId: idA ?? "" },
    B,
  );
  const afterAccept = (await table("studies")).find((x) => x.id === study?.id);
  check(
    "S12 accepting someone who never asked → 404 with a message, no write (fc7a90e)",
    failed(stranger, 404, "NOT_FOUND") &&
      !!stranger.data?.message &&
      !afterAccept?.participantIds?.includes(idA),
    `${stranger.type} ${stranger.status ?? stranger.httpStatus} added=${!!afterAccept?.participantIds?.includes(idA)}`,
  );
  await action(`/study/${study?.id}`, "join", {}, C);
  const accepted = await action(
    manage,
    "acceptParticipant",
    { memberId: idC ?? "" },
    B,
  );
  const joined = (await table("studies")).find((x) => x.id === study?.id);
  check(
    "S12 setup: C asked to join and was accepted",
    accepted.type === "success" && !!joined?.participantIds?.includes(idC),
    brief(accepted),
  );

  const made = await action(
    manage,
    "createSession",
    { date: at(3, "19:00"), title: "S12 1회차" },
    B,
  );
  const session1 = (await table("events")).find(
    (e) => e.studyId === study?.id && e.title === "S12 1회차",
  );
  check(
    "S12 setup: study session created",
    !!session1,
    `${made.type} ${made.status ?? made.httpStatus}`,
  );
  const cancel = await action(
    manage,
    "cancelSession",
    { eventId: session1?.id ?? "" },
    B,
  );
  check(
    "S12 setup: session cancelled",
    cancel.type === "success",
    brief(cancel),
  );
  const save = await action(
    `/study/${study?.id}/attendance`,
    "saveAttendance",
    { eventId: session1?.id ?? "", attendeeIds: [idC ?? ""] },
    B,
  );
  const act = (await table("activities")).find(
    (a) => a.id === session1?.activityId,
  );
  check(
    "S12 attendance on a cancelled session → 409 with a message, no write (fc7a90e)",
    failed(save, 409, "CONFLICT") &&
      !!save.data?.message &&
      !(act?.attendeeIds ?? []).includes(idC),
    `${save.type} ${save.status ?? save.httpStatus} written=${(act?.attendeeIds ?? []).includes(idC)}`,
  );
  const fix = await action(
    manage,
    "updateSession",
    { eventId: session1?.id ?? "", title: "S12 정정", date: at(4, "19:00") },
    B,
  );
  const afterFix = (await table("events")).find((e) => e.id === session1?.id);
  check(
    "S12 correcting a cancelled session → 409, event unchanged (fc7a90e)",
    failed(fix, 409, "CONFLICT") && afterFix?.title === "S12 1회차",
    `${fix.type} ${fix.status ?? fix.httpStatus} title=${afterFix?.title}`,
  );
}

// ---------------------------------------------------------------- 1812d39 stored project URLs
{
  await patchRow("members", (m) => m.id === idC, {
    project: { title: "S12 위험링크", url: "javascript:alert(1)" },
  });
  await patchRow("members", (m) => m.id === idB, {
    project: { title: "S12 정상링크", url: "HTTPS://example.org/p" },
  });
  const page = await get("/archive/projects");
  check(
    "S12 javascript: project URL is not rendered as a link (1812d39)",
    page.status === 200 &&
      page.text.includes("S12 위험링크") &&
      !/href="javascript:/i.test(page.text),
    `${page.status} js-href=${/href="javascript:/i.test(page.text)}`,
  );
  check(
    "S12 HTTPS:// project URL opens as an external link (1812d39)",
    /href="HTTPS:\/\/example\.org\/p"[^>]*target="_blank"/.test(page.text),
  );
}

// ---------------------------------------------------------------- e734279 executive contacts
{
  // C: 회장(전화 공개), D: 부회장(전화 비공개). 이메일은 생산자가 준 적이 없다.
  const r1 = await action(
    "/admin/executives",
    "assign",
    { memberId: idC ?? "", term: TERM, title: "회장" },
    admin,
  );
  const r2 = await action(
    "/admin/executives",
    "assign",
    { memberId: idD ?? "", term: TERM, title: "부회장" },
    admin,
  );
  await patchRow("private-info", (p) => p.memberId === idD, {
    hidePublicPhone: true,
  });
  check(
    `S12 setup: ${TERM} executives assigned`,
    r1.type === "success" && r2.type === "success",
    `${brief(r1)} ${brief(r2)}`,
  );
  for (const p of ["/", "/about"]) {
    const page = await get(p);
    const emptyTel = page.text.includes('href="tel:"');
    const emptyMail = page.text.includes('href="mailto:"');
    check(
      `S12 ${p} has no empty tel:/mailto: links, the public phone still linked (e734279)`,
      page.status === 200 &&
        !emptyTel &&
        !emptyMail &&
        /href="tel:\d+"/.test(page.text),
      `${page.status} emptyTel=${emptyTel} emptyMail=${emptyMail}`,
    );
  }
}

// ---------------------------------------------------------------- 70aa027 one rule for member roles
{
  const dup = await action(
    "/admin/executives",
    "assign",
    { memberId: idC ?? "", term: TERM, title: "회장" },
    admin,
  );
  check(
    "S12 duplicate term+title assignment → 400 VALIDATION_FAILED (70aa027)",
    failed(dup, 400, "VALIDATION_FAILED"),
    `${dup.type} ${dup.status ?? dup.httpStatus} ${dup.data?.error ?? ""}`,
  );
  // 30 roles already: the executives page must not store a 31st
  const thirty = Array.from({ length: 30 }, (_, i) => ({
    term: `${String(i >> 1).padStart(2, "0")}-${(i % 2) + 1}`,
    title: "기획부장",
  }));
  await patchRow("members", (m) => m.id === idB, { roles: thirty });
  const over = await action(
    "/admin/executives",
    "assign",
    { memberId: idB ?? "", term: TERM, title: "자료관리부장" },
    admin,
  );
  const rolesB = (await table("members")).find((m) => m.id === idB)?.roles;
  check(
    "S12 a 31st role via /admin/executives → 400, still 30 stored (70aa027)",
    failed(over, 400, "VALIDATION_FAILED") && rolesB?.length === 30,
    `${over.type} ${over.status ?? over.httpStatus} stored=${rolesB?.length}`,
  );
}

// ---------------------------------------------------------------- 6c9a334 login email stays unique
{
  const r = await action(
    `/admin/members/${idC}`,
    "updatePrivateInfo",
    { email: email.b.toUpperCase(), phone: "010-0000-3333", background: "" },
    admin,
  );
  const infoC = (await table("private-info")).find((p) => p.memberId === idC);
  check(
    "S12 giving a member another member's login email → 409, unchanged (6c9a334)",
    failed(r, 409, "CONFLICT") && infoC?.email === email.c,
    `${r.type} ${r.status ?? r.httpStatus} changed=${infoC?.email !== email.c}`,
  );
}

// ---------------------------------------------------------------- 0376223 upload key extension
{
  const res = await fetch(`${BASE}/api/uploads/presign`, {
    method: "POST",
    headers: { cookie: admin, "content-type": "application/json" },
    body: JSON.stringify({
      purpose: "seminar-material",
      filename: "a.p d f?#",
      contentType: "application/pdf",
      size: 1000,
    }),
  });
  const body = await res.json().catch(() => ({}));
  const key = String(body.s3Key ?? "");
  check(
    "S12 presign key takes its extension from the type (.pdf, no ?# or space) (0376223)",
    res.status === 200 && key.endsWith(".pdf") && !/[?# ]/.test(key),
    `${res.status} ${key.slice(key.lastIndexOf("-"))}`,
  );
}

// ---------------------------------------------------------------- 91fbdd8 cron response shape
{
  // start.sh sets CRON_SECRET=measure-cron (a fixed harness value, not a secret).
  const cron = process.env.MEASURE_CRON_SECRET ?? "measure-cron";
  const res = await fetch(`${BASE}/api/cron/maintenance`, {
    headers: { authorization: `Bearer ${cron}` },
  });
  const body = await res.json().catch(() => ({}));
  const keys = Object.keys(body);
  check(
    "S12 maintenance cron: success spread last, no <step>_failed body keys (91fbdd8)",
    res.status === 200 &&
      body.success === true &&
      keys.at(-1) === "success" &&
      !keys.some((k) => k.endsWith("_failed")),
    `${res.status} keys=${keys.join(",")}`,
  );
  const denied = await fetch(`${BASE}/api/cron/maintenance`);
  check(
    "S12 maintenance cron without the secret → 401",
    denied.status === 401,
    `${denied.status}`,
  );
}

// ---------------------------------------------------------------- c16f7c4 never revoke the last admin
{
  // D is the only member row with isAdmin (the env admin has no member row).
  const grant = await action(
    `/admin/members/${idD}`,
    "setAdmin",
    { isAdmin: "true" },
    admin,
  );
  check("S12 setup: D granted admin", grant.type === "success", brief(grant));
  const self = await action(
    `/admin/members/${idD}`,
    "setAdmin",
    { isAdmin: "false" },
    D,
  );
  check(
    "S12 self-revocation → 409 that says why (c16f7c4)",
    failed(self, 409, "CONFLICT") &&
      String(self.data?.message ?? "").includes("본인"),
    brief(self),
  );
  // The env bootstrap admin has no member row and stays admin, so revoking
  // the only admin row leaves an admin (57ec5f9). With a member-row actor the
  // actor itself remains, so the "last admin" refusal is reachable only by
  // two admins revoking each other at once — covered by the unit tests.
  const last = await action(
    `/admin/members/${idD}`,
    "setAdmin",
    { isAdmin: "false" },
    admin,
  );
  const stillAdmin = (await table("members")).find(
    (m) => m.id === idD,
  )?.isAdmin;
  check(
    "S12 the env admin may revoke the only admin row (57ec5f9)",
    last.type === "success" && stillAdmin === false,
    `${brief(last)} stillAdmin=${stillAdmin}`,
  );
}

await setClock(null);
process.exitCode = summary(`audit-fixes @ ${BASE}`) ? 1 : 0;
