import { describe, expect, it } from "vitest";
import {
  seminarScheduleInputSchema,
  validateSeminarScheduleForm,
} from "./admin-seminars";

// The "has the schedule changed" rule lives in flow_update_seminar_schedule;
// flow-contracts.test.ts pins it (audit LC04-2).

describe("seminarScheduleInputSchema", () => {
  it("accepts a valid KST-local schedule form", () => {
    const result = seminarScheduleInputSchema.safeParse({
      startsAtLocal: "2026-09-09T18:30",
      endsAtLocal: "2026-09-09T20:00",
      location: "27동 220호",
    });

    expect(result.success).toBe(true);
  });

  it("allows an omitted end time", () => {
    const result = seminarScheduleInputSchema.safeParse({
      startsAtLocal: "2026-09-09T18:30",
      endsAtLocal: "",
      location: "27동 220호",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an end time that is not after the start", () => {
    const result = seminarScheduleInputSchema.safeParse({
      startsAtLocal: "2026-09-09T18:30",
      endsAtLocal: "2026-09-09T18:00",
      location: "27동 220호",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["endsAtLocal"]);
    }
  });
});

// Audit LA09-3 / LC04-4: this schema copied the datetime-local regex without
// the calendar check, so 02-30 or 24:00 passed the form and kstInputToIso then
// refused it with no field issue. It now uses the shared rule.
describe("seminarScheduleInputSchema: impossible times", () => {
  it.each(["2026-02-30T18:30", "2026-01-01T24:00", "1999-12-31T18:30"])(
    "refuses a start of %s on its field",
    (startsAtLocal) => {
      const result = seminarScheduleInputSchema.safeParse({
        startsAtLocal,
        endsAtLocal: "",
        location: "27동 220호",
      });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues.map((i) => i.path)).toEqual([
          ["startsAtLocal"],
        ]);
    },
  );

  it("reports an impossible end on its field, not as an order", () => {
    const result = seminarScheduleInputSchema.safeParse({
      startsAtLocal: "2026-09-09T18:30",
      endsAtLocal: "2026-09-31T20:00",
      location: "27동 220호",
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((i) => i.path)).toEqual([["endsAtLocal"]]);
  });
});

describe("validateSeminarScheduleForm", () => {
  it("returns field issues and submitted values", () => {
    const formData = new FormData();
    formData.set("startsAtLocal", "");
    formData.set("endsAtLocal", "");
    formData.set("location", "");

    const result = validateSeminarScheduleForm(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.issues).toMatchObject({
        startsAtLocal: expect.any(String),
        location: expect.any(String),
      });
      expect(result.failure.values.location).toBe("");
    }
  });
});
