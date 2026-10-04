import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, mutate } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { capabilitiesFor } from "$lib/server/core/capabilities";
import { SeminarRequestSchema, SeminarSchema } from "$lib/server/data/schemas";
import { ownSeminarRequests } from "$lib/server/data/dashboard-seminars";
import type { OwnSeminarRequestItem } from "$lib/domain/seminar-progress";
import { load } from "./+page.server";

const request = (id: string, extra: Record<string, unknown> = {}) =>
  SeminarRequestSchema.parse({
    id,
    title: `제안 ${id}`,
    description: "private proposal body",
    prerequisites: "private prerequisite",
    duration: "60분",
    preferredTiming: "",
    presenterIds: ["presenter"],
    attachment: "https://example.com/private.pdf",
    posterKey: "private/poster.png",
    requesterId: "member",
    status: "approved",
    createdAt: "2026-09-20T10:00:00+09:00",
    ...extra,
  });
const schedule = {
  startsAt: "2026-10-10T15:00:00+09:00",
  startTime: "15:00",
  endsAt: null,
  location: "27동 220호",
};
const seminar = (id: string, extra: Record<string, unknown> = {}) =>
  SeminarSchema.parse({
    id: `seminar-${id}`,
    title: `제안 ${id}`,
    semester: "26-2",
    note: "",
    presenterIds: ["presenter"],
    externalPresenters: "",
    materials: ["private/storage.pdf"],
    photos: [],
    publicationStatus: "scheduled",
    kind: "regular",
    durationMinutes: null,
    prerequisites: "",
    announce: true,
    schedule,
    activityId: null,
    sourceRequestId: id,
    ...extra,
  });
const ids = new Set(["member", "legacy"]);
const project = (
  requests: ReturnType<typeof request>[],
  seminars: ReturnType<typeof seminar>[] = [],
  mayWrite = true,
) => ownSeminarRequests(requests, seminars, ids, "member", mayWrite);

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const table of [
    "members",
    "private-info",
    "seminar-requests",
    "seminars",
    "activities",
    "events",
    "studies",
  ])
    await invalidateCache(`table_${table}`);
});

describe("own seminar summary boundary", () => {
  it("filters requester and presenter, including legacy history, before projection", () => {
    const rows = project([
      request("own"),
      request("presenter", { requesterId: "other", presenterIds: ["member"] }),
      request("legacy-requester", { requesterId: "legacy" }),
      request("legacy-presenter", {
        requesterId: "other",
        presenterIds: ["legacy"],
      }),
      request("unrelated", { requesterId: "other", presenterIds: ["other"] }),
    ]);
    expect(rows.map((r) => r.id)).toEqual([
      "own",
      "presenter",
      "legacy-requester",
      "legacy-presenter",
    ]);
  });
  it("projects only summary and schedule keys, never raw rows", () => {
    const row = project([request("own")], [seminar("own")])[0];
    expect(Object.keys(row).sort()).toEqual(
      [
        "id",
        "title",
        "status",
        "submittedAt",
        "publicationStatus",
        "schedule",
        "publicPath",
        "editPath",
      ].sort(),
    );
    expect(Object.keys(row.schedule!).sort()).toEqual(
      ["startsAt", "startTime", "endsAt", "location"].sort(),
    );
    expect(JSON.stringify(row)).not.toMatch(
      /private|presenter|activityId|announcedAt|posterKey/,
    );
  });
  it.each(["pending", "rejected", "withdrawn"] as const)(
    "%s does not infer a linked seminar state",
    (status) => {
      const row = project([request("own", { status })], [seminar("own")])[0];
      expect(row).toMatchObject({
        status,
        publicationStatus: null,
        schedule: null,
        publicPath: null,
      });
    },
  );
  it("approved without a seminar remains unknown, rather than invented unscheduled", () => {
    expect(project([request("own")])[0]).toMatchObject({
      status: "approved",
      publicationStatus: null,
      schedule: null,
      publicPath: null,
    });
  });
  it.each(["unscheduled", "scheduled", "published"] as const)(
    "joins %s by source ID, not matching titles",
    (publicationStatus) => {
      const row = project(
        [request("own")],
        [
          seminar("other", { title: "제안 own" }),
          seminar("own", {
            title: "운영진이 수정한 제목",
            publicationStatus,
            schedule: publicationStatus === "unscheduled" ? null : schedule,
          }),
        ],
      )[0];
      expect(row.publicationStatus).toBe(publicationStatus);
      expect(row.publicPath).toBe(
        publicationStatus === "published"
          ? "/archive/seminars/seminar-own"
          : null,
      );
    },
  );
  it.each(["cancelled", "deleted"] as const)(
    "closedAs %s wins and hides schedule/public link",
    (closedAs) => {
      expect(
        project(
          [request("own", { closedAs })],
          [seminar("own", { publicationStatus: "published" })],
        )[0],
      ).toMatchObject({
        status: "cancelled",
        publicationStatus: "cancelled",
        schedule: null,
        publicPath: null,
        editPath: null,
      });
    },
  );
  it("linked cancellation retains the existing override even on an inconsistent pending row", () => {
    expect(
      project(
        [request("own", { status: "pending" })],
        [seminar("own", { publicationStatus: "cancelled" })],
      )[0],
    ).toMatchObject({ status: "cancelled", schedule: null, editPath: null });
  });
  it("a published legacy seminar without a schedule stays published", () => {
    expect(
      project(
        [request("own")],
        [seminar("own", { publicationStatus: "published", schedule: null })],
      )[0],
    ).toMatchObject({
      publicationStatus: "published",
      schedule: null,
      publicPath: "/archive/seminars/seminar-own",
    });
  });
  it("only the pending current requester with write capability gets an edit link", () => {
    const pending = request("own", { status: "pending" });
    expect(project([pending])[0].editPath).toBe("/seminar/edit/own");
    expect(project([pending], [], false)[0].editPath).toBeNull();
    expect(
      project([
        request("presenter", {
          status: "pending",
          requesterId: "other",
          presenterIds: ["member"],
        }),
      ])[0].editPath,
    ).toBeNull();
    expect(
      project([
        request("legacy", { status: "pending", requesterId: "legacy" }),
      ])[0].editPath,
    ).toBeNull();
    expect(project([request("own")])[0].editPath).toBeNull();
  });
  it("empty own set yields no proposals even when many private seminars exist", () => {
    expect(
      ownSeminarRequests(
        [request("other")],
        [seminar("other")],
        new Set(),
        "unknown",
        true,
      ),
    ).toEqual([]);
  });
});

describe("actual dashboard load privacy", () => {
  const event = (isAlumni = false) =>
    ({
      locals: {
        member: {
          memberId: "member",
          name: "예시 회원",
          isAdmin: false,
          capabilities: capabilitiesFor({ isAlumni, registered: !isAlumni }),
        },
        auth: async () => ({
          user: { email: "fixture@snu.ac.kr", name: "예시 회원" },
        }),
      },
      cookies: { get: () => undefined },
      url: new URL("http://localhost/"),
    }) as unknown as Parameters<typeof load>[0];
  async function payload(isAlumni = false) {
    const data = await load(event(isAlumni));
    return (
      data as {
        streamed: { dashboard: { seminarRequests: OwnSeminarRequestItem[] } };
      }
    ).streamed.dashboard;
  }
  it("no unrelated draft content or schedule is serialized", async () => {
    await mutate("seminar-requests", () => [
      request("own"),
      request("secret", {
        requesterId: "other",
        presenterIds: ["other"],
        title: "UNRELATED_SECRET_TITLE",
      }),
    ]);
    await mutate("seminars", () => [
      seminar("own"),
      seminar("secret", {
        location: undefined,
        schedule: { ...schedule, location: "UNRELATED_SECRET_LOCATION" },
      }),
    ]);
    const data = await payload();
    expect(data.seminarRequests.map((r) => r.id)).toEqual(["own"]);
    expect(JSON.stringify(data)).not.toContain("UNRELATED_SECRET");
    expect(data.seminarRequests[0].schedule?.location).toBe("27동 220호");
  });
  it("co-presenter sees a private saved schedule but gets no edit action", async () => {
    await mutate("seminar-requests", () => [
      request("own", { requesterId: "other", presenterIds: ["member"] }),
    ]);
    await mutate("seminars", () => [seminar("own")]);
    expect((await payload()).seminarRequests[0]).toMatchObject({
      publicationStatus: "scheduled",
      editPath: null,
      publicPath: null,
      schedule,
    });
  });
  it("read-only members retain own pending history without a write link", async () => {
    await mutate("seminar-requests", () => [
      request("own", { status: "pending" }),
    ]);
    expect((await payload(true)).seminarRequests[0]).toMatchObject({
      status: "pending",
      editPath: null,
    });
  });
  it("a guest receives no dashboard payload", async () => {
    const guest = event();
    guest.locals.auth = async () => null;
    const data = await load(guest);
    expect(
      (data as { streamed: { dashboard: null } }).streamed.dashboard,
    ).toBeNull();
  });
});
