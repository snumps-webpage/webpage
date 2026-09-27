import { beforeEach, describe, expect, it } from "vitest";
import { __putRawDoc, __reset } from "./store-memory";
import { expectTablesValid } from "./expect-tables-valid";

const activity = {
  id: "a1",
  title: "활동",
  date: { start: "2026-09-01T19:00:00+09:00", end: null },
  type: "세미나",
  attendeeIds: [],
  sourceRequestId: null,
};
const put = (rows: unknown[]) =>
  __putRawDoc("table", "activities", { schemaVersion: 1, rows });

beforeEach(async () => {
  await __reset();
});

describe("expectTablesValid", () => {
  it("passes rows that carry exactly the schema's keys", async () => {
    await put([activity]);
    await expectTablesValid();
  });

  it("refuses a key the schema does not know", async () => {
    await put([{ ...activity, atendeeIds: [] }]);
    await expect(expectTablesValid()).rejects.toThrow(
      /atendeeIds|Unrecognized/,
    );
  });

  it("refuses a row that leaves a defaulted key out", async () => {
    await __putRawDoc("table", "seminar-requests", {
      schemaVersion: 1,
      rows: [
        {
          id: "r1",
          title: "t",
          description: "",
          prerequisites: "",
          duration: "",
          preferredTiming: "",
          presenterIds: [],
          attachment: "",
          posterKey: "",
          requesterId: "m1",
          status: "pending",
          createdAt: "2026-09-01T19:00:00+09:00",
        },
      ],
    });
    await expect(expectTablesValid()).rejects.toThrow(/missing/);
  });

  it("refuses a wrong type", async () => {
    await put([{ ...activity, attendeeIds: "m1" }]);
    await expect(expectTablesValid()).rejects.toThrow(/attendeeIds/);
  });
});
