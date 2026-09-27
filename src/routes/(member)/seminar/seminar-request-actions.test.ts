import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
const mail = vi.hoisted(() => ({
  sendSeminarApplicationNotification: vi.fn(async () => undefined),
}));
vi.mock("$lib/server/mail", () => mail);

import { __reset } from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { nowKstIso } from "$lib/server/core/time";
import { invalidateCache } from "$lib/server/cache";
import {
  submitSeminarRequest,
  withdrawSeminarRequest,
} from "$lib/server/services/seminar-requests";
import { actions as apply, load as applyLoad } from "./apply/+page.server";
import { actions as edit, load as editLoad } from "./edit/[id]/+page.server";

/**
 * The seminar request form already renders per-field issues (kind, title,
 * description, prerequisites, duration, attachmentUrl, presenterIds), but the
 * actions checked only title and description, one message at a time. They
 * now validate with seminarRequestInputSchema — the single source of the
 * rules — and answer {error, issues, values}.
 */

const MEMBER_ID = "m1";
const locals = {
  member: {
    memberId: MEMBER_ID,
    name: "회원",
    isAdmin: false,
  },
  auth: async () => ({
    user: { email: "m1@snu.ac.kr", name: "회원" },
    expires: "",
  }),
} as unknown as App.Locals;

function post(fields: Record<string, string>, params = {}) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return {
    request: new Request("http://localhost/seminar", { method: "POST", body }),
    locals,
    params,
    url: new URL("http://localhost/seminar"),
  } as never;
}

type Failure = {
  status: number;
  data: {
    error: string;
    issues: Record<string, string>;
    values: Record<string, unknown>;
  };
};

const valid = {
  kind: "regular",
  title: "  대수위상 세미나  ",
  description: "  기본군과 피복공간을 소개합니다.  ",
  prerequisites: "  점집합 위상수학 ",
  duration: " 90분 ",
  preferredTiming: "9월 중반",
  attachment: "  https://drive.google.com/example  ",
  speakerIds: "m1, m2,m1",
};

const badFields: [string, Record<string, string>][] = [
  ["kind", { kind: "" }],
  ["kind", { kind: "weekly" }],
  ["title", { title: "   " }],
  ["title", { title: "가".repeat(201) }],
  ["description", { description: "" }],
  ["description", { description: "가".repeat(5001) }],
  ["prerequisites", { prerequisites: "가".repeat(2001) }],
  ["duration", { duration: "" }],
  ["duration", { duration: "가".repeat(81) }],
  ["attachmentUrl", { attachment: "http://example.com/notes.pdf" }],
  ["attachmentUrl", { attachment: "not a url" }],
  ["attachmentUrl", { attachment: `https://a.b/${"c".repeat(2100)}` }],
  ["presenterIds", { speakerIds: "" }],
  [
    "presenterIds",
    {
      speakerIds: Array.from({ length: 21 }, (_, i) => `m${i}`).join(","),
    },
  ],
  ["_form", { preferredTiming: "아무 때나" }],
];

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  await invalidateCache("table_seminar-requests");
  await invalidateCache("table_members");
  mail.sendSeminarApplicationNotification.mockClear();
});

describe("seminar/apply", () => {
  // The action used to make the requester the presenter when none was
  // picked; the schema now requires one, so the form starts with the
  // requester already picked — the same default, visible and removable.
  it("load hands the form the requester as the starting presenter", async () => {
    await mutate("members", () => [
      {
        id: MEMBER_ID,
        name: "회원",
        department: "수리과학부",
        joinedAt: null,
        status: "regular" as const,
        statusChangedAt: nowKstIso(),
        withdrawal: null,
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

    const data = (await applyLoad({
      locals,
      url: new URL("http://localhost/seminar/apply"),
    } as never)) as { initialPresenters: unknown[] };

    expect(data.initialPresenters).toEqual([
      { id: MEMBER_ID, name: "회원", department: "수리과학부" },
    ]);
  });

  it("stores a valid request, trimmed, with its kind", async () => {
    const result = await apply.default(post(valid));

    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("seminar-requests");
    expect(row).toMatchObject({
      title: "대수위상 세미나",
      description: "기본군과 피복공간을 소개합니다.",
      prerequisites: "점집합 위상수학",
      duration: "90분",
      preferredTiming: "9월 중반",
      attachment: "https://drive.google.com/example",
      presenterIds: ["m1", "m2"],
      requesterId: MEMBER_ID,
      status: "pending",
      kind: "regular",
    });
    expect(mail.sendSeminarApplicationNotification).toHaveBeenCalledWith(
      "회원",
      "대수위상 세미나",
    );
  });

  it("accepts an empty attachment and no preferred timing", async () => {
    const result = await apply.default(
      post({ ...valid, attachment: "", preferredTiming: "" }),
    );

    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("seminar-requests");
    expect(row).toMatchObject({ attachment: "", preferredTiming: "" });
  });

  it.each(badFields)(
    "refuses a bad %s with a field issue, writes nothing and sends no mail",
    async (field, over) => {
      const result = (await apply.default(
        post({ ...valid, ...over }),
      )) as unknown as Failure;

      expect(result).toMatchObject({
        status: 400,
        data: {
          error: "VALIDATION_FAILED",
          issues: { [field]: expect.any(String) },
          values: { title: expect.any(String) },
        },
      });
      expect(await getTable("seminar-requests")).toEqual([]);
      expect(mail.sendSeminarApplicationNotification).not.toHaveBeenCalled();
    },
  );

  it("echoes the submitted values in the form's shape", async () => {
    const result = (await apply.default(
      post({ ...valid, kind: "" }),
    )) as unknown as Failure;

    expect(result.data.values).toEqual({
      kind: "",
      title: valid.title,
      description: valid.description,
      prerequisites: valid.prerequisites,
      duration: valid.duration,
      preferredTiming: valid.preferredTiming,
      attachmentUrl: valid.attachment,
      presenterIds: ["m1", "m2"],
    });
  });

  it("reports every bad field at once, not the first one", async () => {
    const result = (await apply.default(
      post({
        kind: "",
        title: "",
        description: "",
        prerequisites: "",
        duration: "",
        preferredTiming: "",
        attachment: "ftp://x",
        speakerIds: "",
      }),
    )) as unknown as Failure;

    expect(Object.keys(result.data.issues).sort()).toEqual([
      "attachmentUrl",
      "description",
      "duration",
      "kind",
      "presenterIds",
      "title",
    ]);
  });
});

describe("seminar/edit/[id]", () => {
  let id: string;

  beforeEach(async () => {
    const row = await submitSeminarRequest({
      title: "원래 제목",
      description: "원래 설명",
      prerequisites: "",
      duration: "60분",
      preferredTiming: "",
      presenterIds: [MEMBER_ID],
      attachment: "",
      requesterId: MEMBER_ID,
    });
    id = row.id;
  });

  it("updates the own pending request, trimmed, with its kind", async () => {
    const result = await edit.update(post(valid, { id }));

    expect(result).toMatchObject({ success: true });
    const [row] = await getTable("seminar-requests");
    expect(row).toMatchObject({
      title: "대수위상 세미나",
      description: "기본군과 피복공간을 소개합니다.",
      duration: "90분",
      attachment: "https://drive.google.com/example",
      presenterIds: ["m1", "m2"],
      kind: "regular",
    });
  });

  // The edit form starts from what load returns: without kind and timing,
  // every edit had to re-pick the kind and silently cleared the timing.
  it("load hands the edit form the stored kind and preferred timing", async () => {
    await edit.update(post({ ...valid, kind: "irregular" }, { id }));

    const data = (await editLoad({
      locals,
      params: { id },
      url: new URL("http://localhost/seminar/edit"),
    } as never)) as { request: { kind: string; preferredTiming: string } };

    expect(data.request).toMatchObject({
      kind: "irregular",
      preferredTiming: "9월 중반",
    });
  });

  it.each(badFields)(
    "refuses a bad %s with a field issue and keeps the row",
    async (field, over) => {
      const result = await edit.update(post({ ...valid, ...over }, { id }));

      expect(result).toMatchObject({
        status: 400,
        data: {
          error: "VALIDATION_FAILED",
          issues: { [field]: expect.any(String) },
          values: { title: expect.any(String) },
        },
      });
      const [row] = await getTable("seminar-requests");
      expect(row).toMatchObject({ title: "원래 제목", duration: "60분" });
    },
  );

  it("still answers CONFLICT for a request that is no longer pending", async () => {
    await withdrawSeminarRequest(id, MEMBER_ID);

    const result = await edit.update(post(valid, { id }));

    expect(result).toMatchObject({ status: 409, data: { error: "CONFLICT" } });
  });
});
