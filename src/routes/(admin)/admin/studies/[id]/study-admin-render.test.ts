// @vitest-environment node
import { expect, it } from "vitest";
import { render } from "svelte/server";
import Page from "./+page.svelte";
const record = {
  id: "s1",
  title: "해석학",
  term: "26-2",
  status: "finished",
  organizerIds: ["org"],
  organizerNames: ["주최"],
  participantIds: ["org"],
  participantPeople: [{ id: "org", name: "주최", department: "수리" }],
  attendeeCandidates: [],
};
it("shows an admin session creation path even with zero sessions", () => {
  const html = render(Page, {
    props: {
      data: { record, members: [], pickers: [], sessions: [] },
    } as never,
  }).body;
  expect(html).toContain('action="?/createSession"');
  expect(html).toContain("회차가 없습니다");
  expect(html).toContain("참가자 편집");
});
it("offers edit and attendance only for non-cancelled sessions", () => {
  const session = {
    id: "e1",
    title: "취소된 회차",
    status: "cancelled",
    effectiveStatus: "cancelled",
    sessionNo: 1,
    date: { start: "2026-11-03T19:00:00+09:00" },
    attendeeIds: [],
  };
  const html = render(Page, {
    props: {
      data: { record, members: [], pickers: [], sessions: [session] },
    } as never,
  }).body;
  expect(html).toContain("취소된 회차");
  expect(html).not.toContain('action="?/saveAttendance"');
  expect(html).not.toContain('action="?/updateSession"');
});
