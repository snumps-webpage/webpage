// @vitest-environment node
import { expect, it } from "vitest";
import { render } from "svelte/server";
import Page from "./+page.svelte";

it("shows a zero-session study with participant count and an admin management link", () => {
  const body = render(Page, {
    props: {
      data: {
        activities: [],
        members: [],
        studies: [],
        studyGroups: [
          {
            study: {
              id: "s-empty",
              title: "위상수학",
              semester: "26-2",
              participantCount: 2,
            },
            sessions: [],
            linkedActivities: [],
          },
        ],
        ungroupedActivities: [],
        activityTypes: ["스터디"],
        generatedAt: "2026-11-03T00:00:00+09:00",
      },
      form: null,
    } as never,
  }).body;
  expect(body).toContain("위상수학");
  expect(body).toContain("26-2");
  expect(body).toContain("참가자 2명");
  expect(body).toContain("회차 0개");
  expect(body).toContain('href="/admin/studies/s-empty"');
});

it("distinguishes cancelled sessions and migrated links without duplicating their activity editors", () => {
  const activity = (id: string, sessionStudyId: string | null) => ({
    id,
    title: id,
    type: "스터디",
    studyId: "s1",
    sessionStudyId,
    attendeeIds: [],
    formerAttendees: [],
    linkedEventIds: [],
    date: { start: "2026-11-01T19:00:00+09:00", end: null },
    sourceRequestId: null,
  });
  const session = activity("session-activity", "s1");
  const legacy = activity("legacy-activity", null);
  const body = render(Page, {
    props: {
      data: {
        activities: [session, legacy],
        members: [],
        studies: [{ id: "s1", title: "해석학", semester: "26-2" }],
        studyGroups: [
          {
            study: {
              id: "s1",
              title: "해석학",
              semester: "26-2",
              participantCount: 1,
            },
            sessions: [
              {
                event: {
                  id: "e1",
                  studyId: "s1",
                  activityId: session.id,
                  sessionNo: 2,
                  status: "cancelled",
                  title: "회차",
                  date: session.date,
                },
                activity: session,
              },
            ],
            linkedActivities: [legacy],
          },
        ],
        ungroupedActivities: [],
        activityTypes: ["스터디", "회식"],
        generatedAt: "2026-11-03T00:00:00+09:00",
      },
      form: { error: "CONFLICT", id: session.id, values: { title: "재입력" } },
    } as never,
  }).body;
  expect(body).toContain("2회차 · 취소");
  expect(body).toContain("연결 활동");
  expect(body).toContain('value="재입력"');
  expect(body.match(/action="\?\/update"/g)).toHaveLength(2);
  expect(body.match(/action="\?\/setAttendees"/g)).toHaveLength(2);
  expect(body.match(/<details[^>]*open/g)).toHaveLength(2);
});
