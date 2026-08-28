import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/data/s3", () => import("$lib/server/data/s3-memory"));

import { __reset } from "$lib/server/data/s3-memory";
import { _resetDataLayerForTests, getTable, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { AppError } from "$lib/server/core/errors";
import {
  approveApplication,
  submitApplication,
  withdrawOwnApplication,
} from "./membership";
import { approveSeminar, submitSeminarRequest, withdrawSeminarRequest } from "./seminar-requests";

async function clearCaches() {
  for (const t of ["applications", "members", "private-info", "activities", "events", "seminars", "seminar-requests"]) {
    await invalidateCache(`table_${t}`);
  }
}

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  await clearCaches();
});

describe("membership conversion (§7-2 approve)", () => {
  it("converts the application into member + private-info and removes the row", async () => {
    const app = await submitApplication({
      email: "Test@snu.ac.kr",
      name: "홍길동",
      department: "수리과학부",
      phone: "010-1234-5678",
      background: "",
    });

    await approveApplication(app.id);

    const members = await getTable("members");
    const infos = await getTable("private-info");
    expect(members).toHaveLength(1);
    expect(members[0].status).toBe("associate");
    expect(members[0].sourceRequestId).toBe(app.id);
    expect(infos[0].memberId).toBe(members[0].id);
    expect(infos[0].email).toBe("test@snu.ac.kr"); // normalized
    expect(await getTable("applications")).toHaveLength(0);
  });

  it("re-run after full completion is CONFLICT with zero duplicates", async () => {
    const app = await submitApplication({
      email: "a@snu.ac.kr", name: "A", department: "D", phone: "010-0000-0000", background: "",
    });
    await approveApplication(app.id);
    await expect(approveApplication(app.id)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
    expect(await getTable("members")).toHaveLength(1);
  });

  it("re-run after a mid-sequence crash fills in only the missing records", async () => {
    const app = await submitApplication({
      email: "b@snu.ac.kr", name: "B", department: "D", phone: "010-0000-0000", background: "",
    });
    // Simulate: member creation succeeded, then the process died.
    await mutate("members", (rows) => [
      ...rows,
      {
        id: newId(), name: app.name, department: app.department,
        joinedAt: "2026-08-29", status: "associate" as const,
        statusChangedAt: nowKstIso(), withdrawal: null,
        isAlumni: false, alumniRevoked: false, roles: [], isAdmin: false,
        publicContact: null, project: null, sourceRequestId: app.id,
      },
    ]);

    await approveApplication(app.id);

    expect(await getTable("members")).toHaveLength(1); // no duplicate member
    expect(await getTable("private-info")).toHaveLength(1); // missing step filled
    expect(await getTable("applications")).toHaveLength(0);
  });

  it("self-withdrawal removes the row and its PII", async () => {
    await submitApplication({
      email: "c@snu.ac.kr", name: "C", department: "D", phone: "010-0000-0000", background: "",
    });
    await withdrawOwnApplication("c@snu.ac.kr");
    expect(await getTable("applications")).toHaveLength(0);
  });

  it("duplicate application for the same email is CONFLICT", async () => {
    await submitApplication({
      email: "d@snu.ac.kr", name: "D", department: "D", phone: "010-0000-0000", background: "",
    });
    await expect(
      submitApplication({
        email: "D@snu.ac.kr", name: "D2", department: "D", phone: "010-0000-0000", background: "",
      }),
    ).rejects.toSatisfy((e) => e instanceof AppError && e.code === "CONFLICT");
  });
});

describe("seminar approval chain (§7-2 approveSeminar)", () => {
  const submit = () =>
    submitSeminarRequest({
      title: "위상수학 세미나",
      description: "설명",
      prerequisites: "",
      duration: "1h",
      presenterIds: ["m-presenter"],
      attachment: "",
      requesterId: "m-presenter",
    });

  it("creates activity + event + archive record and marks the request approved", async () => {
    const req = await submit();
    await approveSeminar(req.id);

    const [activities, events, seminars, requests] = await Promise.all([
      getTable("activities"), getTable("events"), getTable("seminars"), getTable("seminar-requests"),
    ]);
    expect(activities).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0].activityId).toBe(activities[0].id);
    expect(events[0].presenterIds).toEqual(["m-presenter"]);
    expect(events[0].status).toBe("active");
    expect(seminars[0].activityId).toBe(activities[0].id);
    expect(requests[0].status).toBe("approved");
  });

  it("re-run after the activity-only crash creates the missing event and record once", async () => {
    const req = await submit();
    // Simulate: only the activity landed before the crash.
    await mutate("activities", (rows) => [
      ...rows,
      {
        id: newId(), title: req.title, date: { start: nowKstIso(), end: null },
        type: "세미나" as const, attendeeIds: ["m-presenter"], sourceRequestId: req.id,
      },
    ]);

    await approveSeminar(req.id);

    expect(await getTable("activities")).toHaveLength(1);
    expect(await getTable("events")).toHaveLength(1);
    expect(await getTable("seminars")).toHaveLength(1);
  });

  it("approving a non-pending request is CONFLICT", async () => {
    const req = await submit();
    await withdrawSeminarRequest(req.id, "m-presenter");
    await expect(approveSeminar(req.id)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
  });
});
