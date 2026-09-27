import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock(
  "$lib/server/data/storage",
  () => import("$lib/server/data/storage-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import {
  __exists,
  __reset as __resetStorage,
  __setRemoveFails,
  __stage,
  copyToBackups,
  promoteToAssets,
} from "$lib/server/data/storage-memory";
import {
  _resetDataLayerForTests,
  getQueue,
  getTable,
  mutate,
  mutateQueue,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import { nowKstIso } from "$lib/server/core/time";
import { AppError } from "$lib/server/core/errors";
import {
  createActivity,
  createGalleryEntry,
  createSeminar,
  createStudy,
  deleteActivity,
  deleteSeminar,
  deleteStudy,
  setAttendees,
  setOrganizer,
  setSeminarFiles,
  setStudyPhotos,
  updateActivity,
  updateSeminar,
} from "./records-admin";
import { hiddenActivityIds } from "./visibility";

beforeEach(async () => {
  __reset();
  __resetStorage();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of [
    "activities",
    "events",
    "seminars",
    "studies",
    "gallery-dinner",
    "members",
    "seminar-requests",
  ]) {
    await invalidateCache(`table_${t}`);
  }
});

const seedMember = async (
  id: string,
  status: "regular" | "withdrawn" = "regular",
) =>
  mutate("members", (rows) => [
    ...rows,
    {
      id,
      name: "회원",
      department: "수리과학부",
      joinedAt: "2024-03-01",
      status,
      statusChangedAt: nowKstIso(),
      withdrawal:
        status === "withdrawn"
          ? {
              requestedAt: nowKstIso(),
              previousStatus: "regular" as const,
              holdBy: null,
              holdAt: null,
            }
          : null,
      isAlumni: false,
      alumniRevoked: false,
      roles: [],
      isAdmin: false,
      publicContact: null,
      project: null,
      legacyMemberId: null,
      sourceRequestId: null,
    },
  ]);

describe("setAttendees — the sanctioned wholesale overwrite", () => {
  it("replaces the list entirely, deduped — merge rule deliberately absent", async () => {
    const a = await createActivity({
      title: "회의",
      date: { start: nowKstIso(), end: null },
      type: "회의",
    });
    await setAttendees(a.id, ["m1", "m1", "m2"]);
    expect((await getTable("activities"))[0].attendeeIds).toEqual(["m1", "m2"]);
    await setAttendees(a.id, ["m3"]); // walk-ins do NOT survive here, by design
    expect((await getTable("activities"))[0].attendeeIds).toEqual(["m3"]);
  });
});

describe("학기는 관리자의 결정이 최상위다", () => {
  /**
   * 기록 편집기에서 학기를 손으로 고치면 그 값이 자동 도출보다 위여야 한다.
   * 고정되지 않으면 이후 일정 수정 한 번이 조용히 덮어쓴다 — 손으로 "24-2"로
   * 되돌린 이주 기록이 일정을 넣는 순간 현재 학기로 튀는 경로였다.
   */
  it("학기를 손으로 고치면 이후 자동 도출이 덮지 않는다", async () => {
    const s = await createSeminar({
      title: "세미나",
      semester: "26-2",
      note: "",
      presenterIds: [],
      externalPresenters: "",
    });
    await updateSeminar(s.id, { semesterPinned: false } as never); // 승인 흐름과 같은 상태로
    expect((await getTable("seminars"))[0].semesterPinned).toBe(false);

    await updateSeminar(s.id, { semester: "24-2" });

    const [row] = await getTable("seminars");
    expect(row.semester).toBe("24-2");
    expect(row.semesterPinned).toBe(true);
  });

  // 편집기는 바뀌지 않은 학기도 매번 보낸다 — 그것까지 고정으로 읽으면 기록을
  // 한 번 저장했다는 이유만으로 모든 자동 도출이 멈춘다.
  it("같은 학기를 다시 저장하는 것은 고정이 아니다", async () => {
    const s = await createSeminar({
      title: "세미나",
      semester: "26-2",
      note: "",
      presenterIds: [],
      externalPresenters: "",
    });
    await updateSeminar(s.id, { semesterPinned: false } as never);

    await updateSeminar(s.id, { semester: "26-2", note: "설명만 수정" });

    expect((await getTable("seminars"))[0].semesterPinned).toBe(false);
  });
});

describe("관리자 파일 삭제 — 기록에서 빼는 것으로는 부족하다", () => {
  /**
   * 예전에는 기록에서 키만 지우고 바이트는 버킷에 남겼다. 공개 버킷이었으므로
   * 이미 나간 URL은 그 파일을 영원히 내려 줬다(C-22). 백업 미러는 건드리지
   * 않는다 — 실수로 지웠을 때의 복구 근거다.
   */
  async function seminarWithFile(field: "materials" | "photos") {
    const s = await createSeminar({
      title: "세미나",
      semester: "26-2",
      note: "",
      presenterIds: [],
      externalPresenters: "",
    });
    __stage("pending/x-file.pdf", 10, "application/pdf");
    await promoteToAssets("pending/x-file.pdf", "seminars/s1/aa-file.pdf");
    await copyToBackups(
      "assets",
      "seminars/s1/aa-file.pdf",
      "assets-mirror/seminars/s1/aa-file.pdf",
    );
    await setSeminarFiles(s.id, field, { add: "seminars/s1/aa-file.pdf" });
    return s.id;
  }

  it("파일을 떼어내면 버킷에서도 지운다", async () => {
    const id = await seminarWithFile("materials");

    await setSeminarFiles(id, "materials", {
      remove: "seminars/s1/aa-file.pdf",
    });

    expect(__exists("assets", "seminars/s1/aa-file.pdf")).toBe(false);
  });

  it("백업 미러는 남긴다 — 실수를 되돌릴 유일한 길이다", async () => {
    const id = await seminarWithFile("photos");

    await setSeminarFiles(id, "photos", { remove: "seminars/s1/aa-file.pdf" });

    expect(__exists("backups", "assets-mirror/seminars/s1/aa-file.pdf")).toBe(
      true,
    );
  });

  it("기록을 지우면 딸린 파일도 함께 지운다", async () => {
    const id = await seminarWithFile("materials");

    await deleteSeminar(id);

    expect(__exists("assets", "seminars/s1/aa-file.pdf")).toBe(false);
  });

  // 삭제 실패가 기록 편집을 막으면 관리자가 화면에서 아무것도 못 한다.
  it("버킷 삭제가 실패해도 기록 편집은 끝난다", async () => {
    const id = await seminarWithFile("materials");
    __setRemoveFails(true);

    await setSeminarFiles(id, "materials", {
      remove: "seminars/s1/aa-file.pdf",
    });

    __setRemoveFails(false);
    expect((await getTable("seminars"))[0].materials).toEqual([]);
  });
});

// 승격은 매직 바이트를 검사한다 — 확장자만으로는 통과하지 않는다.
const PNG_HEAD = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("삭제는 그 기록이 가진 파일만, 아무도 안 쓰는 것만", () => {
  /**
   * 삭제 대상 키는 폼의 hidden 필드로 온다 — 즉 **클라이언트가 고른다**. 예전
   * 구현은 그 키를 기록에서 빼든 못 빼든 무조건 버킷에서 지웠고, 기록이 안
   * 바뀌면 mutate가 조용히 아무것도 쓰지 않아 화면에는 성공으로 보였다.
   * 같은 파일을 두 기록이 가리키는 경우(승인 시 신청의 포스터를 그대로 물려받는다)
   * 한쪽을 지우면 다른 쪽의 화면이 깨진다.
   */
  async function seminarOwning(key: string, field: "materials" | "photos") {
    const s = await createSeminar({
      title: "세미나",
      semester: "26-2",
      note: "",
      presenterIds: [],
      externalPresenters: "",
    });
    __stage("pending/x.pdf", 10, "application/pdf");
    await promoteToAssets("pending/x.pdf", key);
    await setSeminarFiles(s.id, field, { add: key });
    return s.id;
  }

  it("다른 기록의 파일은 지우지 않는다", async () => {
    const other = await seminarOwning("seminars/b/bb-file.pdf", "materials");
    const mine = await seminarOwning("seminars/a/aa-file.pdf", "materials");

    await expect(
      setSeminarFiles(mine, "materials", {
        remove: "seminars/b/bb-file.pdf",
      }),
    ).rejects.toSatisfy((e) => e instanceof AppError && e.code === "NOT_FOUND");

    expect(__exists("assets", "seminars/b/bb-file.pdf")).toBe(true);
    expect(
      (await getTable("seminars")).find((s) => s.id === other)!.materials,
    ).toEqual(["seminars/b/bb-file.pdf"]);
  });

  it("여전히 다른 기록이 참조하는 파일은 남긴다", async () => {
    const key = "seminars/shared/cc-file.pdf";
    const first = await seminarOwning(key, "materials");
    const second = await createSeminar({
      title: "다른 세미나",
      semester: "26-2",
      note: "",
      presenterIds: [],
      externalPresenters: "",
    });
    await setSeminarFiles(second.id, "materials", { add: key });

    await setSeminarFiles(first, "materials", { remove: key });

    // 기록에서는 빠졌지만 두 번째 기록이 아직 쓰고 있으므로 바이트는 남는다.
    expect(__exists("assets", key)).toBe(true);
  });

  it("스터디를 지우면 사진도 함께 지운다", async () => {
    const study = await createStudy({
      title: "스터디",
      semester: "26-2",
      textbook: "",
      description: "",
      note: "",
      organizerIds: [newId()],
    });
    __stage("pending/y.jpg", 10, "image/jpeg");
    await promoteToAssets("pending/y.jpg", "studies/st1/dd-photo.jpg");
    await setStudyPhotos(study.id, { add: "studies/st1/dd-photo.jpg" });

    await deleteStudy(study.id);

    expect(__exists("assets", "studies/st1/dd-photo.jpg")).toBe(false);
  });
});

describe("포스터 교체", () => {
  // 교체하면 이전 포스터는 어느 기록도 가리키지 않는다 — /media는 그런 키를
  // 거절하지만(서빙은 막힌다), 바이트는 용량과 백업 비용으로 남는다.
  it("새 포스터를 올리면 이전 포스터를 버킷에서 지운다", async () => {
    __stage(
      "pending/seminar-poster/old-poster.png",
      10,
      "image/png",
      undefined,
      PNG_HEAD,
    );
    const seminar = await createSeminar(
      {
        title: "세미나",
        semester: "26-2",
        note: "",
        presenterIds: [],
        externalPresenters: "",
      },
      "pending/seminar-poster/old-poster.png",
    );
    const oldKey = (await getTable("seminars"))[0].posterKey;
    expect(__exists("assets", oldKey)).toBe(true);

    __stage(
      "pending/seminar-poster/new-poster.png",
      10,
      "image/png",
      undefined,
      PNG_HEAD,
    );
    await updateSeminar(
      seminar.id,
      {},
      "pending/seminar-poster/new-poster.png",
    );

    expect(__exists("assets", oldKey)).toBe(false);
    expect((await getTable("seminars"))[0].posterKey).not.toBe(oldKey);
  });
});

describe("referential-integrity deletes", () => {
  it("refuses to delete an activity a seminar record references", async () => {
    const a = await createActivity({
      title: "세미나",
      date: { start: nowKstIso(), end: null },
      type: "세미나",
    });
    const s = await createSeminar({
      title: "세미나",
      semester: "26-2",
      note: "",
      presenterIds: [],
      externalPresenters: "",
    });
    await updateSeminar(s.id, { activityId: a.id });

    await expect(deleteActivity(a.id)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );

    await updateSeminar(s.id, { activityId: null });
    await deleteActivity(a.id);
    expect(await getTable("activities")).toHaveLength(0);
  });

  /**
   * A cancelled or unpublished seminar is the only thing hiding its activity
   * (visibility.ts reads `seminars.activityId`). Deleting just the row would
   * put that activity back on the public archive and in members' histories,
   * so the delete takes the hidden activity and its sessions with it.
   */
  const seminarHoldingActivity = async (
    publicationStatus: "cancelled" | "unscheduled" | "published",
  ) => {
    const a = await createActivity({
      title: "세미나",
      date: { start: nowKstIso(), end: null },
      type: "세미나",
    });
    const s = await createSeminar({
      title: "세미나",
      semester: "26-2",
      note: "",
      presenterIds: [],
      externalPresenters: "",
    });
    await mutate("seminars", (rows) =>
      rows.map((r) =>
        r.id === s.id ? { ...r, activityId: a.id, publicationStatus } : r,
      ),
    );
    const eventId = newId();
    await mutate("events", (rows) => [
      ...rows,
      {
        id: eventId,
        title: "세미나",
        date: { start: nowKstIso(), end: null },
        type: "세미나" as const,
        status: "cancelled" as const,
        pathId: "p",
        attendCode: "c",
        activityId: a.id,
        applicantIds: [],
        presenterIds: [],
        studyId: null,
        sessionNo: null,
        autoGenerated: false,
        sourceRequestId: null,
      },
    ]);
    return { activityId: a.id, seminarId: s.id, eventId };
  };

  const queueRow = (
    eventId: string,
    status: "pending" | "approved" | "rejected",
  ) => ({
    id: newId(),
    memberId: "m1",
    eventId,
    startTime: nowKstIso(),
    endTime: null,
    status,
  });

  it.each(["cancelled", "unscheduled"] as const)(
    "deletes a %s seminar together with the activity it was hiding",
    async (status) => {
      const { activityId, seminarId, eventId } =
        await seminarHoldingActivity(status);
      await mutateQueue(eventId, () => [queueRow(eventId, "rejected")]);

      await deleteSeminar(seminarId);

      expect(await getTable("seminars")).toHaveLength(0);
      expect((await getTable("activities")).map((a) => a.id)).not.toContain(
        activityId,
      );
      expect(await getTable("events")).toHaveLength(0);
      expect(await getQueue(eventId)).toEqual([]);
    },
  );

  // Publication credits the presenters automatically (seminars.ts) — that is
  // not evidence anyone attended, so it must not make every cancelled seminar
  // undeletable. (Found by the end-to-end run: all cancelled seminars 409'd.)
  it("deletes despite the presenters' automatic credit", async () => {
    const { activityId, seminarId } = await seminarHoldingActivity("cancelled");
    await mutate("seminars", (rows) =>
      rows.map((r) =>
        r.id === seminarId ? { ...r, presenterIds: ["p1"] } : r,
      ),
    );
    await setAttendees(activityId, ["p1"]);

    await deleteSeminar(seminarId);

    expect(await getTable("seminars")).toHaveLength(0);
    expect((await getTable("activities")).map((a) => a.id)).not.toContain(
      activityId,
    );
  });

  // The next three were found by the adversarial HTTP run.
  it("refuses when another seminar also points at the activity", async () => {
    const { activityId, seminarId, eventId } =
      await seminarHoldingActivity("cancelled");
    const other = await createSeminar({
      title: "다른 세미나",
      semester: "26-2",
      note: "",
      presenterIds: [],
      externalPresenters: "",
    });
    await mutate("seminars", (rows) =>
      rows.map((r) => (r.id === other.id ? { ...r, activityId } : r)),
    );

    await expect(deleteSeminar(seminarId)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
    expect((await getTable("activities")).map((a) => a.id)).toContain(
      activityId,
    );
    expect((await getTable("events")).map((e) => e.id)).toContain(eventId);
  });

  it("refuses when a study session hangs off the same activity", async () => {
    const { seminarId, eventId } = await seminarHoldingActivity("cancelled");
    await mutate("events", (rows) =>
      rows.map((e) => (e.id === eventId ? { ...e, studyId: "st1" } : e)),
    );

    await expect(deleteSeminar(seminarId)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
    expect(await getTable("events")).toHaveLength(1);
  });

  const withSourceRequest = async (seminarId: string) => {
    await mutate("seminar-requests", (rows) => [
      ...rows,
      {
        id: "req1",
        title: "세미나",
        description: "",
        prerequisites: "",
        duration: "",
        preferredTiming: "",
        presenterIds: ["p1"],
        attachment: "",
        posterKey: "",
        requesterId: "p1",
        status: "approved" as const,
        closedAs: null,
        kind: null,
        createdAt: nowKstIso(),
      },
    ]);
    await mutate("seminars", (rows) =>
      rows.map((r) =>
        r.id === seminarId ? { ...r, sourceRequestId: "req1" } : r,
      ),
    );
  };

  // Only the cancelled seminar kept its approved request off the presenter's
  // dashboard (cancelledRequestIds) — without it the request shows "승인" again.
  it("keeps the request of a deleted hidden seminar, marked closed", async () => {
    const { seminarId } = await seminarHoldingActivity("cancelled");
    await withSourceRequest(seminarId);
    await mutate("seminar-requests", (rows) =>
      rows.map((r) => ({ ...r, posterKey: "seminar-requests/req1/p.png" })),
    );

    await deleteSeminar(seminarId);

    const [request] = await getTable("seminar-requests");
    expect(request).toMatchObject({
      id: "req1",
      status: "approved",
      closedAs: "deleted",
      posterKey: "", // the file goes with the seminar
    });
  });

  it("keeps the request of a deleted published seminar", async () => {
    const { seminarId } = await seminarHoldingActivity("published");
    await withSourceRequest(seminarId);

    await deleteSeminar(seminarId);

    expect(await getTable("seminar-requests")).toHaveLength(1);
  });

  it("refuses while the hidden activity still carries attendance credit", async () => {
    const { activityId, seminarId } = await seminarHoldingActivity("cancelled");
    await setAttendees(activityId, ["m1"]);

    await expect(deleteSeminar(seminarId)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
    expect(await getTable("seminars")).toHaveLength(1);
    expect(await getTable("events")).toHaveLength(1);
    expect(await hiddenActivityIds()).toContain(activityId);
  });

  it.each(["pending", "approved"] as const)(
    "refuses while a session still holds a %s check-in",
    async (rowStatus) => {
      const { activityId, seminarId, eventId } =
        await seminarHoldingActivity("cancelled");
      await mutateQueue(eventId, () => [queueRow(eventId, rowStatus)]);

      await expect(deleteSeminar(seminarId)).rejects.toSatisfy(
        (e) => e instanceof AppError && e.code === "CONFLICT",
      );
      expect(await getTable("events")).toHaveLength(1);
      expect(await hiddenActivityIds()).toContain(activityId);
    },
  );

  it("still deletes a published seminar — its activity was never hidden", async () => {
    const { seminarId } = await seminarHoldingActivity("published");

    await deleteSeminar(seminarId);

    expect(await getTable("seminars")).toHaveLength(0);
  });

  it("refuses to delete a study that still has sessions", async () => {
    const study = await createStudy({
      title: "해석학",
      semester: "26-2",
      textbook: "",
      description: "",
      note: "",
      organizerIds: ["org"],
    });
    await mutate("events", (rows) => [
      ...rows,
      {
        id: newId(),
        title: "1회차",
        date: { start: nowKstIso(), end: null },
        type: "스터디" as const,
        status: "active" as const,
        pathId: "p",
        attendCode: "c",
        activityId: newId(),
        applicantIds: [],
        presenterIds: [],
        studyId: study.id,
        sessionNo: 1,
        autoGenerated: false,
        sourceRequestId: null,
      },
    ]);
    await expect(deleteStudy(study.id)).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "CONFLICT",
    );
  });
});

describe("file-array editing (shared setFileArray)", () => {
  it("adds deduped and removes exactly", async () => {
    const s = await createSeminar({
      title: "세미나",
      semester: "26-2",
      note: "",
      presenterIds: [],
      externalPresenters: "",
    });
    await setSeminarFiles(s.id, "materials", { add: "seminars/x/a.pdf" });
    await setSeminarFiles(s.id, "materials", { add: "seminars/x/a.pdf" });
    await setSeminarFiles(s.id, "photos", { add: "seminars/x/p.png" });
    let row = (await getTable("seminars"))[0];
    expect(row.materials).toEqual(["seminars/x/a.pdf"]);
    expect(row.photos).toEqual(["seminars/x/p.png"]);

    await setSeminarFiles(s.id, "materials", { remove: "seminars/x/a.pdf" });
    row = (await getTable("seminars"))[0];
    expect(row.materials).toEqual([]);
  });
});

describe("update actions cannot poison the table (review C1)", () => {
  it("undefined patch fields leave stored fields intact", async () => {
    const a = await createActivity({
      title: "세미나",
      date: { start: nowKstIso(), end: null },
      type: "세미나",
    });
    await updateActivity(a.id, { title: undefined, type: "회의" });
    const row = (await getTable("activities"))[0];
    expect(row.title).toBe("세미나"); // not deleted by the spread
    expect(row.type).toBe("회의");
  });

  it("a schema-violating write is refused, not stored", async () => {
    const g = await createGalleryEntry({ year: "2026", activityId: null });
    await expect(
      // empty year violates min(1) — the data layer must refuse the write
      mutate("gallery-dinner", (rows) =>
        rows.map((r) => (r.id === g.id ? { ...r, year: "" } : r)),
      ),
    ).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "VALIDATION_FAILED",
    );
    expect((await getTable("gallery-dinner"))[0].year).toBe("2026"); // table readable, intact
  });
});

describe("setOrganizer target validation (review M6)", () => {
  it("refuses ghosts and grace-period members; accepts a real member", async () => {
    await seedMember("m-ok");
    await seedMember("m-gone", "withdrawn");
    const study = await createStudy({
      title: "해석학",
      semester: "26-2",
      textbook: "",
      description: "",
      note: "",
      organizerIds: ["org"],
    });

    await expect(setOrganizer(study.id, "ghost", "admin")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "VALIDATION_FAILED",
    );
    await expect(setOrganizer(study.id, "m-gone", "admin")).rejects.toSatisfy(
      (e) => e instanceof AppError && e.code === "VALIDATION_FAILED",
    );
    await setOrganizer(study.id, "m-ok", "admin");
    expect((await getTable("studies"))[0].organizerIds).toEqual(["m-ok"]);
  });
});
