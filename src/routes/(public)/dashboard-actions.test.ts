import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { capabilitiesFor } from "$lib/server/core/capabilities";
import { toKstIso } from "$lib/server/core/time";
import { createEventWithActivity } from "$lib/server/services/events";
import type { DashboardOperationResult } from "$lib/domain/dashboard";
import { actions, load } from "./+page.server";

/**
 * The ledger and profile panel keep their own `$state` and change it only from
 * the action result (`DashboardOperationResult`). An action that answers `{}`
 * succeeds on the server and leaves the screen exactly as it was.
 */

const MEMBER_ID = "m1";

const locals = {
  member: {
    memberId: MEMBER_ID,
    privateInfoId: "p1",
    name: "회원",
    status: "regular",
    isAdmin: false,
    isAlumni: false,
    registered: true,
    capabilities: capabilitiesFor({ isAlumni: false, registered: true }),
  },
  auth: async () => ({
    user: { email: "m1@snu.ac.kr", name: "회원" },
    expires: "",
  }),
} as unknown as App.Locals;

const cookies = { get: () => undefined, set: () => {}, delete: () => {} };

function actionEvent(fields: Record<string, string>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return {
    request: new Request("http://localhost/", { method: "POST", body }),
    locals,
    url: new URL("http://localhost/"),
    cookies,
  } as unknown as Parameters<typeof actions.applyActivity>[0] &
    Parameters<typeof actions.updateProfile>[0];
}

const inAnHour = () => toKstIso(new Date(Date.now() + 60 * 60 * 1000));

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of [
    "activities",
    "events",
    "members",
    "private-info",
    "seminars",
  ]) {
    await invalidateCache(`table_${t}`);
  }
});

describe("dashboard activity actions", () => {
  it("applyActivity returns the updated ledger row", async () => {
    const event = await createEventWithActivity({
      title: "정수론 세미나",
      startIso: inAnHour(),
      type: "세미나",
      status: "active",
    });

    const result = (await actions.applyActivity(
      actionEvent({ eventId: event.id }),
    )) as DashboardOperationResult;

    expect(result).toMatchObject({
      success: true,
      operation: "activityApplied",
      activity: {
        id: event.activityId,
        title: "정수론 세미나",
        eventId: event.id,
        isApplied: true,
        attended: false,
      },
    });
  });

  it("cancelActivity returns the row with the application removed", async () => {
    const event = await createEventWithActivity({
      title: "정수론 세미나",
      startIso: inAnHour(),
      type: "세미나",
      status: "active",
    });
    await actions.applyActivity(actionEvent({ eventId: event.id }));

    const result = (await actions.cancelActivity(
      actionEvent({ eventId: event.id }),
    )) as DashboardOperationResult;

    expect(result).toMatchObject({
      operation: "activityCancelled",
      activity: { id: event.activityId, isApplied: false, canApply: true },
    });
  });
});

/**
 * Found by the adversarial HTTP run. `/` is in the public zone, so the zone
 * guard's POST capability gate never sees these actions — each must check
 * for itself — and an apply must not write before it knows it can answer.
 */
describe("dashboard actions — refusals leave no trace", () => {
  const unregistered = {
    ...locals,
    member: {
      ...locals.member!,
      registered: false,
      capabilities: capabilitiesFor({ isAlumni: false, registered: false }),
    },
  } as unknown as App.Locals;
  const eventAs = (fields: Record<string, string>, as: App.Locals) =>
    ({ ...actionEvent(fields), locals: as }) as ReturnType<typeof actionEvent>;

  it("an event whose activity is missing → 404 before any write", async () => {
    const event = await createEventWithActivity({
      title: "고아 이벤트",
      startIso: inAnHour(),
      type: "세미나",
      status: "active",
    });
    await mutate("activities", () => []);

    const result = await actions.applyActivity(
      actionEvent({ eventId: event.id }),
    );

    expect(result).toMatchObject({ status: 404 });
    expect((await getTable("events"))[0].applicantIds).toEqual([]);
  });

  it("an active event on a cancelled seminar's hidden activity → 404 before any write", async () => {
    const event = await createEventWithActivity({
      title: "취소된 세미나",
      startIso: inAnHour(),
      type: "세미나",
      status: "active",
    });
    await mutate("seminars", () => [
      {
        id: "s1",
        title: "취소된 세미나",
        semester: "26-2",
        note: "",
        presenterIds: [],
        externalPresenters: "",
        materials: [],
        photos: [],
        activityId: event.activityId,
        publicationStatus: "cancelled",
        sourceRequestId: null,
      } as never,
    ]);

    const result = await actions.applyActivity(
      actionEvent({ eventId: event.id }),
    );

    expect(result).toMatchObject({ status: 404 });
    expect((await getTable("events"))[0].applicantIds).toEqual([]);
  });

  it("an unregistered non-alumnus cannot edit their profile", async () => {
    const result = await actions.updateProfile(
      eventAs({ phone: "01012345678", background: "x" }, unregistered),
    );
    expect(result).toMatchObject({ status: 403 });
  });

  it("does not offer an apply button to a member who may not participate", async () => {
    const event = await createEventWithActivity({
      title: "열람 전용",
      startIso: inAnHour(),
      type: "세미나",
      status: "active",
    });
    const alumnus = {
      ...unregistered,
      member: {
        ...unregistered.member!,
        isAlumni: true,
        capabilities: capabilitiesFor({ isAlumni: true, registered: false }),
      },
    } as unknown as App.Locals;

    const data = await load({
      ...actionEvent({}),
      locals: alumnus,
    } as unknown as Parameters<typeof load>[0]);
    const dashboard = (
      data as {
        streamed: {
          dashboard: {
            activities: { eventId: string | null; canApply: boolean }[];
          };
        };
      }
    ).streamed.dashboard;
    const row = dashboard.activities.find((a) => a.eventId === event.id);

    expect(row?.canApply).toBe(false);
  });

  it.each(["acceptTransfer", "declineTransfer"] as const)(
    "an unregistered member cannot %s from the dashboard",
    async (name) => {
      const result = await actions[name](
        eventAs({ studyId: "st1" }, unregistered),
      );
      expect(result).toMatchObject({ status: 403 });
    },
  );
});

describe("dashboard profile action", () => {
  beforeEach(async () => {
    await mutate("private-info", () => [
      {
        id: "p1",
        memberId: MEMBER_ID,
        email: "m1@snu.ac.kr",
        phone: "010-0000-0000",
        background: "",
        studentId: "",
        mailPrefs: { announcements: true },
        hidePublicPhone: false,
        sourceRequestId: null,
      },
    ]);
  });

  it("returns the saved fields in normalized form", async () => {
    const result = (await actions.updateProfile(
      actionEvent({ phone: "01012345678", background: "  해석학  " }),
    )) as DashboardOperationResult;

    expect(result).toMatchObject({
      operation: "profileUpdated",
      profile: { phone: "010-1234-5678", background: "해석학" },
    });
    expect((await getTable("private-info"))[0].phone).toBe("010-1234-5678");
  });

  it("refuses a malformed phone with a field issue and writes nothing", async () => {
    const result = await actions.updateProfile(
      actionEvent({ phone: "12", background: "" }),
    );

    expect(result).toMatchObject({
      status: 400,
      data: {
        error: "VALIDATION_FAILED",
        issues: { phone: expect.any(String) },
      },
    });
    expect((await getTable("private-info"))[0].phone).toBe("010-0000-0000");
  });
});

/**
 * `updateSeminar` edited a seminar's title and note straight from `/`,
 * bypassing the service layer, validation and audit; its UI was removed long
 * ago and approval-time edits belong to admins (FRONTEND-DECISIONS §3-1).
 * `approvedSeminars` fed that UI and was still serialized into every page.
 */
describe("the dashboard carries no seminar editing", () => {
  it("has no updateSeminar action", () => {
    expect(Object.keys(actions)).not.toContain("updateSeminar");
  });

  it("does not ship approvedSeminars to the browser", async () => {
    const data = await load({
      ...actionEvent({}),
    } as unknown as Parameters<typeof load>[0]);
    const dashboard = (data as { streamed: { dashboard: object } }).streamed
      .dashboard;
    expect(Object.keys(dashboard)).not.toContain("approvedSeminars");
  });
});
