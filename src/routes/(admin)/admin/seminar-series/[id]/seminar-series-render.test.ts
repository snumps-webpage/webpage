// @vitest-environment node
import { expect, it } from "vitest";
import { render } from "svelte/server";
import Page from "./+page.svelte";
const data = {
  parent: { id: "series", title: "위상", description: "소개" },
  members: [],
  pickers: [],
  currentTerm: "26-2",
  sessions: [],
};
it("offers a first session without creating a fictional activity", () => {
  const html = render(Page, { props: { data } as never }).body;
  expect(html).toContain('action="?/createSession"');
  expect(html).toContain("회차가 없습니다");
  expect(html).toContain("위상");
});
it("lets the current term and vacation semesters pass the rendered browser pattern", () => {
  const html = render(Page, { props: { data } as never }).body;
  const pattern = html.match(/name="semester"[^>]*pattern="([^"]+)"/)![1];
  const accepts = new RegExp(`^(?:${pattern})$`, "v");
  for (const semester of [data.currentTerm, "26-1", "26-S", "26-W"])
    expect(accepts.test(semester), semester).toBe(true);
  expect(accepts.test("26-3")).toBe(false);
});
it("links each existing session to its own operations and hides cancelled attendance", () => {
  const sessions = [
    {
      id: "one",
      title: "첫 회차",
      sessionNo: 1,
      presenterNames: ["발표"],
      presenterIds: ["p"],
      schedule: null,
      publicationStatus: "published",
      attendeeIds: [],
      eventId: "e1",
    },
    {
      id: "two",
      title: "취소 회차",
      sessionNo: 2,
      presenterNames: [],
      presenterIds: [],
      schedule: null,
      publicationStatus: "cancelled",
      attendeeIds: [],
      eventId: "e2",
    },
  ];
  const html = render(Page, {
    props: { data: { ...data, sessions } } as never,
  }).body;
  expect(html).toContain("/admin/seminars#seminar-one");
  expect(html).toContain("/admin/seminars#seminar-record-one");
  expect(html).toContain("/archive/seminars/one");
  expect(html.match(/action="\?\/saveAttendance"/g)).toHaveLength(1);
  expect(html).toContain("취소 회차");
});
it("submits recorded legacy attendance id for a rejoined member", () => {
  const sessions = [
    {
      id: "one",
      title: "회차",
      sessionNo: 1,
      presenterNames: [],
      presenterIds: [],
      schedule: null,
      publicationStatus: "published",
      attendeeIds: ["legacy"],
      eventId: "e1",
    },
  ];
  const html = render(Page, {
    props: {
      data: {
        ...data,
        sessions,
        pickers: [
          {
            id: "current",
            legacyMemberId: "legacy",
            name: "재가입",
            department: "수리",
            former: false,
          },
        ],
      },
    } as never,
  }).body;
  expect(html).toMatch(/name="attendeeIds" value="legacy" checked/);
  expect(html).not.toMatch(/name="attendeeIds" value="current" checked/);
});
