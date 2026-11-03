// @vitest-environment node
import { expect, it } from "vitest";
import { render } from "svelte/server";
import {
  filterStudyActivityGroups,
  groupStudyActivities,
} from "$lib/domain/admin-activity-groups";
import EmptyState from "./StudySessionEmpty.svelte";

it("does not describe a study as having no sessions when only its linked activity matches the search", () => {
  const { studyGroups } = groupStudyActivities(
    [{ id: "s1", title: "해석학", semester: "26-2", participantCount: 1 }],
    [
      {
        id: "a1",
        studyId: "s1",
        title: "회차 활동",
        date: { start: "2026-11-01" },
      },
      {
        id: "legacy",
        studyId: "s1",
        title: "이주된 기록",
        date: { start: "2025-03-01" },
      },
    ],
    [
      {
        id: "e1",
        studyId: "s1",
        activityId: "a1",
        title: "회차",
        sessionNo: 1,
        status: "active",
        date: { start: "2026-11-01" },
      },
    ],
  );
  const filtered = filterStudyActivityGroups(studyGroups, "이주된 기록");
  expect(filtered).toHaveLength(1);
  expect(filtered[0].sessions).toHaveLength(0);
  expect(filtered[0].linkedActivities.map((a) => a.id)).toEqual(["legacy"]);
  const body = render(EmptyState, {
    props: { totalSessions: studyGroups[0].sessions.length } as never,
  }).body;
  expect(body).toContain("검색 조건에 맞는 회차가 없습니다.");
  expect(body).not.toContain("아직 회차가 없습니다.");
});

it("still offers session creation when the original study has no sessions", () => {
  const body = render(EmptyState, {
    props: { totalSessions: 0 } as never,
  }).body;
  expect(body).toContain("아직 회차가 없습니다.");
  expect(body).toContain("스터디 관리에서 회차를 추가");
});
