import { describe, expect, it } from "vitest";
import {
  groupStudies,
  studyParticipationAction,
  type StudyRelationship,
} from "./study-navigation";
import type { StudyStatus } from "./studies";
describe("task-oriented study navigation", () => {
  it("partitions every study without losing ended or unrelated ongoing records", () => {
    const studies = [
      { id: "a", status: "recruiting", myState: "none" },
      { id: "b", status: "ongoing", myState: "organizer" },
      { id: "c", status: "finished", myState: "participant" },
      { id: "d", status: "cancelled", myState: "none" },
      { id: "e", status: "ongoing", myState: "none" },
      { id: "f", status: "recruiting", myState: "pending" },
    ] as const;
    const groups = groupStudies(studies);
    expect(groups.joinable.map((s) => s.id)).toEqual(["a"]);
    expect(groups.mine.map((s) => s.id)).toEqual(["b", "c", "f"]);
    expect(groups.other.map((s) => s.id)).toEqual(["d", "e"]);
    expect(Object.values(groups).flat()).toHaveLength(studies.length);
  });
  it("handles an empty list", () => {
    expect(groupStudies([])).toEqual({ joinable: [], mine: [], other: [] });
  });
  for (const status of [
    "recruiting",
    "ongoing",
    "finished",
    "cancelled",
  ] as StudyStatus[])
    for (const relationship of [
      "organizer",
      "participant",
      "pending",
      "none",
    ] as StudyRelationship[])
      for (const capable of [true, false])
        it(`${status}/${relationship}/participate=${capable} has a single valid action`, () => {
          const action = studyParticipationAction(
            status,
            relationship,
            capable,
          );
          if (relationship === "organizer") expect(action).toBe("manage");
          else if (
            ["finished", "cancelled"].includes(status) &&
            relationship !== "none"
          )
            expect(action).toBe("closed");
          else if (!capable) expect(action).toBe("readOnly");
          else if (relationship === "participant") expect(action).toBe("leave");
          else if (relationship === "pending") expect(action).toBe("cancel");
          else
            expect(action).toBe(
              status === "recruiting" ? "join" : "unavailable",
            );
        });
});
