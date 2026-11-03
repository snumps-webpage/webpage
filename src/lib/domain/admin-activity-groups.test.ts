import { describe, expect, it } from "vitest";
import {
  groupStudyActivities,
  filterStudyActivityGroups,
} from "./admin-activity-groups";
const studies = [
  { id: "s1", title: "해석학", semester: "26-2", participantCount: 3 },
  { id: "s2", title: "대수학", semester: "25-1", participantCount: 1 },
  { id: "s0", title: "위상수학", semester: "26-2", participantCount: 0 },
];
const activities = [
  {
    id: "a1",
    studyId: "s1",
    title: "측도론",
    type: "스터디",
    date: { start: "2026-11-01" },
  },
  {
    id: "legacy",
    studyId: "s1",
    title: "옛 연결",
    type: "스터디",
    date: { start: "2026-10-01" },
  },
  {
    id: "a2",
    studyId: "s1",
    title: "군론",
    type: "스터디",
    date: { start: "2026-11-02" },
  },
  {
    id: "free",
    studyId: null,
    title: "회식",
    type: "회식",
    date: { start: "2026-11-03" },
  },
  {
    id: "orphan",
    studyId: "missing",
    title: "이전 스터디",
    type: "스터디",
    date: { start: "2026-09-01" },
  },
];
const events = [
  {
    id: "e1",
    studyId: "s1",
    activityId: "a1",
    sessionNo: 1,
    status: "cancelled",
    title: "측도론",
    date: { start: "2026-11-01" },
  },
  {
    id: "e2",
    studyId: "s2",
    activityId: "a2",
    sessionNo: 1,
    status: "active",
    title: "군론",
    date: { start: "2026-11-02" },
  },
];
describe("study activity groups", () => {
  it("keeps zero-session studies and separates migrated links from actual sessions", () => {
    const result = groupStudyActivities(studies, activities, events);
    expect(
      result.studyGroups.map((g) => [
        g.study.id,
        g.sessions.length,
        g.linkedActivities.map((a) => a.id),
      ]),
    ).toEqual([
      ["s1", 1, ["legacy"]],
      ["s2", 1, []],
      ["s0", 0, []],
    ]);
    expect(result.studyGroups[0].sessions[0].event.status).toBe("cancelled");
  });
  it("uses event ownership and keeps every activity exactly once, even with stale links", () => {
    const result = groupStudyActivities(studies, activities, events);
    expect(result.studyGroups[1].sessions[0].activity?.id).toBe("a2");
    expect(result.ungroupedActivities.map((a) => a.id)).toEqual([
      "free",
      "orphan",
    ]);
    const ids = result.studyGroups
      .flatMap((g) => [
        ...g.sessions.flatMap((s) => (s.activity ? [s.activity.id] : [])),
        ...g.linkedActivities.map((a) => a.id),
      ])
      .concat(result.ungroupedActivities.map((a) => a.id));
    expect(ids.sort()).toEqual(["a1", "a2", "free", "legacy", "orphan"]);
  });
  it("does not mutate any input while building the read model", () => {
    const before = JSON.stringify({ studies, activities, events });
    groupStudyActivities(studies, activities, events);
    expect(JSON.stringify({ studies, activities, events })).toBe(before);
  });
  it("searches parent titles and semesters, or narrows to matching child activities", () => {
    const { studyGroups } = groupStudyActivities(studies, activities, events);
    expect(
      filterStudyActivityGroups(studyGroups, "위상").map((g) => g.study.id),
    ).toEqual(["s0"]);
    expect(
      filterStudyActivityGroups(studyGroups, "25-1").map((g) => g.study.id),
    ).toEqual(["s2"]);
    const match = filterStudyActivityGroups(studyGroups, "측도론");
    expect(match.map((g) => g.study.id)).toEqual(["s1"]);
    expect(match[0].sessions.map((s) => s.event.id)).toEqual(["e1"]);
    expect(match[0].linkedActivities).toEqual([]);
  });
});
