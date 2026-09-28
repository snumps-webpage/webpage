import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __putRawDoc, __reset } from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { nowKstIso, toKstIso } from "$lib/server/core/time";
import { AppError } from "$lib/server/core/errors";
import type { Member, Study } from "$lib/server/data/schemas";
import {
  acceptParticipant,
  acceptTransfer,
  approveStudy,
  cancelSession,
  createStudySession,
  declineTransfer,
  joinStudy,
  leaveStudy,
  proposeTransfer,
  rejectStudy,
  removeParticipant,
  saveStudyAttendance,
  setStudyStatus,
  submitStudyRequest,
} from "./studies";

const future = () => toKstIso(new Date(Date.now() + 60 * 60 * 1000));
const past = () => toKstIso(new Date(Date.now() - 60 * 60 * 1000));

async function seedMember(id: string, name = "회원"): Promise<void> {
  const m: Member = {
    id,
    name,
    department: "수리과학부",
    joinedAt: "2024-03-01",
    status: "regular",
    statusChangedAt: nowKstIso(),
    withdrawal: null,
    isAlumni: true,
    alumniRevoked: false,
    roles: [],
    isAdmin: false,
    publicContact: null,
    alumniRevocationReason: null,
    project: null,
    legacyMemberId: null,
    sourceRequestId: null,
  };
  await mutate("members", (rows) => [...rows, m]);
}

async function seedStudy(over: Partial<Study> = {}): Promise<Study> {
  const s: Study = {
    id: newId(),
    title: "해석학",
    semester: "26-2",
    textbook: "",
    description: "",
    note: "",
    organizerIds: ["org"],
    participantIds: ["org"],
    pendingParticipantIds: [],
    pendingTransfer: null,
    schedule: [],
    transferHistory: [],
    photos: [],
    status: "recruiting",
    sourceRequestId: null,
    ...over,
  };
  await mutate("studies", (rows) => [...rows, s]);
  return s;
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of [
    "studies",
    "study-requests",
    "events",
    "activities",
    "members",
  ]) {
    await invalidateCache(`table_${t}`);
  }
});

describe("proposal → approval (STU-01 / ADM-16)", () => {
  it("approval creates the study with the requester as organizer AND participant", async () => {
    const req = await submitStudyRequest({
      title: "위상수학",
      textbook: "Munkres",
      description: "",
      semester: "26-2",
      requesterId: "m-req",
    });
    await approveStudy(req.id);

    const study = (await getTable("studies"))[0];
    expect(study.organizerIds).toEqual(["m-req"]);
    expect(study.participantIds).toContain("m-req");
    expect(study.status).toBe("recruiting");
    expect((await getTable("study-requests"))[0].status).toBe("approved");

    // idempotent re-run
    await expect(approveStudy(req.id)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
    expect(await getTable("studies")).toHaveLength(1);
  });
});

describe("participation (STU-02/04)", () => {
  it("join gates on recruiting; accept moves pending → participant", async () => {
    const s = await seedStudy();
    await joinStudy(s.id, "m1");
    await joinStudy(s.id, "m1"); // idempotent
    expect((await getTable("studies"))[0].pendingParticipantIds).toEqual([
      "m1",
    ]);

    await acceptParticipant(s.id, "m1");
    const updated = (await getTable("studies"))[0];
    expect(updated.participantIds).toContain("m1");
    expect(updated.pendingParticipantIds).toEqual([]);

    await setStudyStatus(s.id, "ongoing");
    await expect(joinStudy(s.id, "m2")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "STUDY_NOT_RECRUITING",
    );
  });

  it("the organizer cannot leave — hand over first", async () => {
    const s = await seedStudy();
    await expect(leaveStudy(s.id, "org")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
  });

  // LB31-4: accept moved ANY posted id into participantIds — someone who
  // never asked, or asked and left — and so into the attendance pool.
  it("accept refuses a member who is not waiting", async () => {
    const s = await seedStudy({ participantIds: ["org", "p1"] });
    await joinStudy(s.id, "m1");
    await leaveStudy(s.id, "m1"); // asked, then withdrew the request

    for (const id of ["m1", "stranger"]) {
      await expect(acceptParticipant(s.id, id)).rejects.toSatisfy(
        (e) => e instanceof AppError && e.code === "NOT_FOUND",
      );
    }
    expect((await getTable("studies"))[0].participantIds).toEqual([
      "org",
      "p1",
    ]);

    await acceptParticipant(s.id, "p1"); // already in — idempotent
    expect((await getTable("studies"))[0].participantIds).toEqual([
      "org",
      "p1",
    ]);
  });
});

describe("proposal rejection (ADM-16)", () => {
  // LB31-5: rejectStudy judged existence on the cached table — a request
  // submitted on another instance was refused for up to 15s…
  it("rejects a request the cache has not seen yet", async () => {
    await getTable("study-requests"); // this instance caches "no requests"
    const row = {
      id: "r1",
      title: "위상수학",
      textbook: "",
      description: "",
      semester: "26-2",
      requesterId: "m-req",
      status: "pending",
      createdAt: nowKstIso(),
    };
    await __putRawDoc("table", "study-requests", {
      schemaVersion: 1,
      rows: [row],
    });

    const rejected = await rejectStudy("r1");
    expect(rejected.status).toBe("rejected"); // the row as it now is
    expect((await getTable("study-requests"))[0].status).toBe("rejected");
  });

  // …and a row the cache still had but the store did not was "rejected"
  // without a write, and the caller mailed the requester.
  it("refuses a request the store no longer has", async () => {
    const req = await submitStudyRequest({
      title: "위상수학",
      textbook: "",
      description: "",
      semester: "26-2",
      requesterId: "m-req",
    });
    await getTable("study-requests"); // cached with the row
    await __putRawDoc("table", "study-requests", {
      schemaVersion: 1,
      rows: [],
    });

    await expect(rejectStudy(req.id)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "NOT_FOUND",
    );
  });
});

describe("sessions (STU-06, manual only)", () => {
  it("creation is idempotent on the study+date key — never double-creates", async () => {
    const s = await seedStudy();
    const date = past();
    await createStudySession(s, date, { autoGenerated: false });
    await createStudySession(s, date, { autoGenerated: false });

    const events = (await getTable("events")).filter((e) => e.studyId === s.id);
    expect(events).toHaveLength(1);
    expect(events[0].sessionNo).toBe(1);
  });

  it("numbers sessions sequentially", async () => {
    const s = await seedStudy();
    await createStudySession(s, past(), { autoGenerated: false });
    await createStudySession(s, future(), { autoGenerated: false });

    const numbers = (await getTable("events"))
      .filter((e) => e.studyId === s.id)
      .map((e) => e.sessionNo)
      .sort();
    expect(numbers).toEqual([1, 2]);
  });

  it("cancelled sessions are terminal", async () => {
    const s = await seedStudy();
    const date = past();
    const event = await createStudySession(s, date, { autoGenerated: false });
    await cancelSession(s.id, event.id);

    expect((await getTable("events"))[0].status).toBe("cancelled");
    await expect(
      createStudySession(s, date, { autoGenerated: false }),
    ).rejects.toSatisfy((e) => e instanceof AppError && e.code === "CONFLICT");
  });

  // Product decision (FRONTEND-DECISIONS §3-2, confirmed 2026-09-27): no
  // pre-registered schedule, no cron generation — the organizer creates each
  // session by hand.
  it("offers no schedule-driven generation", async () => {
    const studies = await import("./studies");
    expect(Object.keys(studies)).not.toContain("registerSchedule");
    expect(Object.keys(studies)).not.toContain("studySessionCronStep");
  });
});

describe("organizer handover (STU-07 / BE-50)", () => {
  it("two-phase: propose → accept replaces organizer and records history", async () => {
    await seedMember("m-new", "김수학");
    const s = await seedStudy();
    await proposeTransfer(s.id, "org", "m-new");

    // duplicate proposal blocked
    await expect(proposeTransfer(s.id, "org", "m-new")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );

    await acceptTransfer(s.id, "m-new");
    const updated = (await getTable("studies"))[0];
    expect(updated.organizerIds).toEqual(["m-new"]);
    expect(updated.participantIds).toContain("m-new");
    expect(updated.pendingTransfer).toBeNull();
    expect(updated.transferHistory.at(-1)).toMatchObject({
      from: "org",
      to: "m-new",
      byAdmin: false,
    });
  });

  it("blocks self-transfer and unknown/withdrawn targets", async () => {
    const s = await seedStudy();
    await expect(proposeTransfer(s.id, "org", "org")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "VALIDATION_FAILED",
    );
    await expect(proposeTransfer(s.id, "org", "ghost")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "VALIDATION_FAILED",
    );
  });

  it("decline clears the proposal; a stranger cannot accept", async () => {
    await seedMember("m-new");
    const s = await seedStudy();
    await proposeTransfer(s.id, "org", "m-new");

    await expect(acceptTransfer(s.id, "someone-else")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "FORBIDDEN", // §6-5
    );
    await declineTransfer(s.id, "m-new");
    expect((await getTable("studies"))[0].pendingTransfer).toBeNull();
    expect((await getTable("studies"))[0].organizerIds).toEqual(["org"]);
  });
});

describe("attendance (STU-05 / BE-51)", () => {
  it("merge rule: walk-in check-ins survive the organizer's save", async () => {
    const s = await seedStudy({ participantIds: ["org", "p1", "p2"] });
    const event = await createStudySession(s, future(), {
      autoGenerated: false,
    });
    await mutate("activities", (rows) =>
      rows.map((a) =>
        a.id === event.activityId ? { ...a, attendeeIds: ["walkin"] } : a,
      ),
    );

    await saveStudyAttendance(s, event.id, ["p1"]);
    expect([...(await getTable("activities"))[0].attendeeIds].sort()).toEqual(
      ["p1", "walkin"].sort(),
    );

    await expect(
      saveStudyAttendance(s, event.id, ["outsider"]),
    ).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "VALIDATION_FAILED",
    );
  });

  // LB31-1: the sheet hides a cancelled session, but a posted eventId of one
  // still wrote attendance onto its activity.
  it("refuses a cancelled session", async () => {
    const s = await seedStudy({ participantIds: ["org", "p1"] });
    const event = await createStudySession(s, future(), {
      autoGenerated: false,
    });
    await cancelSession(s.id, event.id);

    await expect(saveStudyAttendance(s, event.id, ["p1"])).rejects.toSatisfy(
      (e) =>
        e instanceof AppError &&
        e.code === "CONFLICT" &&
        e.userMessage === "취소된 회차에는 출석을 기록할 수 없습니다.",
    );
    expect((await getTable("activities"))[0].attendeeIds).toEqual([]);
  });

  it("rejects a session belonging to another study", async () => {
    const s1 = await seedStudy();
    const s2 = await seedStudy({ title: "대수학" });
    const event = await createStudySession(s1, future(), {
      autoGenerated: false,
    });
    await expect(saveStudyAttendance(s2, event.id, [])).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "NOT_FOUND",
    );
  });
});

describe("status transitions (#4/#20, LB31-3)", () => {
  // #4/#20, LB31-3: setStudyStatus only refused leaving "finished" — a posted
  // status took a recruiting study straight to finished, and a self-
  // transition passed. It now follows nextStudyStatuses.
  it("refuses a transition the domain rule does not list", async () => {
    const s = await seedStudy(); // recruiting
    for (const status of ["finished", "recruiting"] as const) {
      await expect(setStudyStatus(s.id, status)).rejects.toSatisfy(
        (e) =>
          e instanceof AppError &&
          e.code === "CONFLICT" &&
          typeof e.userMessage === "string",
      );
    }
    expect((await getTable("studies"))[0].status).toBe("recruiting");

    await setStudyStatus(s.id, "ongoing");
    await setStudyStatus(s.id, "recruiting"); // reopened
    await setStudyStatus(s.id, "ongoing");
    await setStudyStatus(s.id, "finished");
    expect((await getTable("studies"))[0].status).toBe("finished");
  });

  // #4/#20, LB31-3: a study ended while still recruiting never ran — it
  // becomes "cancelled", which is as terminal as "finished".
  it("cancels a recruiting study, and cancelled is terminal", async () => {
    const s = await seedStudy();
    await setStudyStatus(s.id, "cancelled");
    expect((await getTable("studies"))[0].status).toBe("cancelled");

    for (const status of ["recruiting", "ongoing", "finished"] as const) {
      await expect(setStudyStatus(s.id, status)).rejects.toSatisfy(
        (e) =>
          e instanceof AppError &&
          e.code === "CONFLICT" &&
          e.userMessage === "취소된 스터디는 수정할 수 없습니다.",
      );
    }
  });

  // #4/#20, LB31-2: closing is the last write the organizer makes, so it
  // retracts what could otherwise never be answered — join requests and an
  // in-flight handover — instead of leaving them dangling on screens.
  it("closing drops pending join requests and an in-flight handover", async () => {
    await seedMember("m-new");
    const s = await seedStudy({ status: "ongoing" });
    await mutate("studies", (rows) =>
      rows.map((r) => ({ ...r, pendingParticipantIds: ["waiting"] })),
    );
    await proposeTransfer(s.id, "org", "m-new");

    await setStudyStatus(s.id, "finished");
    const closed = (await getTable("studies"))[0];
    expect(closed.pendingParticipantIds).toEqual([]);
    expect(closed.pendingTransfer).toBeNull();
    expect(closed.participantIds).toEqual(["org"]);
  });
});

describe("a closed study is immutable (#4/#20, LB31-2)", () => {
  const closedMessage = {
    finished: "종료된 스터디는 수정할 수 없습니다.",
    cancelled: "취소된 스터디는 수정할 수 없습니다.",
  } as const;

  // #4/#20, LB31-2: only session creation checked "finished" — the roster,
  // the handover and session cancels still went through after the end.
  it.each(["finished", "cancelled"] as const)(
    "refuses every organizer and member change on a %s study",
    async (status) => {
      await seedMember("m-new");
      const s = await seedStudy({
        status: "ongoing",
        participantIds: ["org", "p1"],
      });
      const event = await createStudySession(s, past(), {
        autoGenerated: false,
      });
      // closed by the admin record editor, with state the organizer's own
      // close would have dropped
      await mutate("studies", (rows) =>
        rows.map((r) => ({
          ...r,
          status,
          pendingParticipantIds: ["waiting"],
          pendingTransfer: { toMemberId: "m-new", requestedAt: nowKstIso() },
        })),
      );
      const before = (await getTable("studies"))[0];

      const attempts: [string, () => Promise<unknown>][] = [
        ["accept", () => acceptParticipant(s.id, "waiting")],
        ["remove", () => removeParticipant(s.id, "p1")],
        ["leave", () => leaveStudy(s.id, "p1")],
        ["propose", () => proposeTransfer(s.id, "org", "m-new")],
        ["acceptTransfer", () => acceptTransfer(s.id, "m-new")],
        ["cancelSession", () => cancelSession(s.id, event.id)],
      ];
      for (const [name, attempt] of attempts) {
        await expect(attempt(), name).rejects.toSatisfy(
          (e) =>
            e instanceof AppError &&
            e.code === "CONFLICT" &&
            e.userMessage === closedMessage[status],
        );
      }
      expect((await getTable("studies"))[0]).toEqual(before);
      expect((await getTable("events"))[0].status).not.toBe("cancelled");
    },
  );

  // #4/#20, LB31-2: attendance correction on an existing session stays open
  // after the study ends — records get fixed late.
  it("still corrects attendance on an existing session", async () => {
    const s = await seedStudy({
      status: "ongoing",
      participantIds: ["org", "p1"],
    });
    const event = await createStudySession(s, past(), {
      autoGenerated: false,
    });
    await setStudyStatus(s.id, "finished");
    const finished = (await getTable("studies"))[0];

    await saveStudyAttendance(finished, event.id, ["p1"]);
    expect((await getTable("activities"))[0].attendeeIds).toEqual(["p1"]);
  });
});
