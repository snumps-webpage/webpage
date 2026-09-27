import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import { expectTablesValid } from "$lib/server/data/expect-tables-valid";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "$lib/server/core/errors";
import {
  approveSeminar,
  submitSeminarRequest,
  updateSeminarRequest,
  withdrawSeminarRequest,
} from "./seminar-requests";
import {
  approveStudy,
  submitStudyRequest,
  withdrawStudyRequest,
} from "./studies";

/**
 * flow_approve_seminar_request / flow_approve_study_request: the created
 * record and the request's flip in one transaction, judged on the request
 * as it is now. Before, the approval read a cached request, created the
 * seminar/study, and only then found the request withdrawn — leaving a
 * record for a request nobody approved.
 */

const codeOf = (e: unknown) => (e instanceof AppError ? e.code : String(e));
const REQUESTER = "m1";

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["seminars", "seminar-requests", "studies", "study-requests"])
    await invalidateCache(`table_${t}`);
});
afterEach(expectTablesValid);

const seminarRequest = () =>
  submitSeminarRequest({
    title: "원래 제목",
    description: "설명",
    prerequisites: "",
    duration: "60분",
    preferredTiming: "",
    presenterIds: [REQUESTER],
    attachment: "",
    requesterId: REQUESTER,
  });
const studyRequest = () =>
  submitStudyRequest({
    title: "스터디",
    textbook: "교재",
    description: "설명",
    semester: "26-2",
    requesterId: REQUESTER,
  });

describe("seminar request: approve ∥ withdraw", () => {
  it.each([1, 2, 3, 4, 5])(
    "a seminar exists exactly when the request ended approved (run %i)",
    async () => {
      const req = await seminarRequest();

      await Promise.allSettled([
        approveSeminar(req.id),
        withdrawSeminarRequest(req.id, REQUESTER),
      ]);

      const [row] = await getTable("seminar-requests");
      const seminars = await getTable("seminars");
      expect(seminars).toHaveLength(row.status === "approved" ? 1 : 0);
    },
  );

  it("approves the request as edited after the admin's page load", async () => {
    const req = await seminarRequest();
    await getTable("seminar-requests"); // the admin's board read it
    await updateSeminarRequest(
      req.id,
      { memberId: REQUESTER, isAdmin: false },
      { title: "고친 제목" },
    );

    await approveSeminar(req.id);

    const [seminar] = await getTable("seminars");
    expect(seminar.title).toBe("고친 제목");
    expect(seminar.publicationStatus).toBe("unscheduled");
  });

  it("refuses a request that is no longer pending", async () => {
    const req = await seminarRequest();
    await withdrawSeminarRequest(req.id, REQUESTER);

    await expect(approveSeminar(req.id)).rejects.toSatisfy(
      (e) => codeOf(e) === "CONFLICT",
    );
    expect(await getTable("seminars")).toEqual([]);
  });
});

describe("study request: approve ∥ withdraw", () => {
  it.each([1, 2, 3, 4, 5])(
    "a study exists exactly when the request ended approved (run %i)",
    async () => {
      const req = await studyRequest();

      await Promise.allSettled([
        approveStudy(req.id),
        withdrawStudyRequest(req.id, REQUESTER),
      ]);

      const [row] = await getTable("study-requests");
      const studies = await getTable("studies");
      expect(studies).toHaveLength(row.status === "approved" ? 1 : 0);
      if (studies.length) {
        expect(studies[0]).toMatchObject({
          organizerIds: [REQUESTER],
          participantIds: [REQUESTER],
          status: "recruiting",
        });
      }
    },
  );
});
