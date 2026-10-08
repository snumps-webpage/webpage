import { describe, expect, it } from "vitest";
import {
  recordCalendarDate,
  recordFieldValue,
  recordPresenterIds,
  recordFailureMessage,
  scopedRecordAction,
} from "./admin-record-editor";

describe("existing record submission display", () => {
  it("restores submitted empty text rather than the stored fallback", () => {
    expect(
      recordFieldValue(
        { scope: "record-update", id: "s1", values: { description: "" } },
        "record-update",
        "s1",
        "description",
        "stored",
      ),
    ).toBe("");
  });
  it("does not leak another record or section draft", () => {
    const form = {
      scope: "record-update",
      id: "s2",
      values: { title: "other draft" },
    };
    expect(scopedRecordAction(form, "record-update", "s1")).toBeNull();
    expect(
      recordFieldValue(form, "record-update", "s1", "title", "saved"),
    ).toBe("saved");
    expect(
      recordFieldValue(form, "record-create", undefined, "title", ""),
    ).toBe("");
  });
  it("preserves raw text and numeric empty values on the matching native form", () => {
    const form = {
      scope: "record-create",
      id: "",
      values: { title: "  raw  ", durationMinutes: "" },
    };
    expect(
      recordFieldValue(form, "record-create", undefined, "title", ""),
    ).toBe("  raw  ");
    expect(
      recordFieldValue(form, "record-create", undefined, "durationMinutes", 60),
    ).toBe("");
  });
  it("preserves explicit empty presenter selection", () => {
    expect(
      recordPresenterIds(
        { scope: "record-update", id: "s1", presenterIds: [] },
        "record-update",
        "s1",
        ["saved"],
      ),
    ).toEqual([]);
    expect(
      recordPresenterIds(
        { scope: "record-update", id: "other", presenterIds: [] },
        "record-update",
        "s1",
        ["saved"],
      ),
    ).toEqual(["saved"]);
  });
  it("shows unavailable result uncertainty and known field errors", () => {
    expect(
      recordFailureMessage({
        scope: "record-update",
        error: "SERVICE_UNAVAILABLE",
      }),
    ).toContain("상태가 바뀌었을 수");
    expect(
      recordFailureMessage({
        scope: "record-create",
        error: "VALIDATION_FAILED",
        issues: { title: "제목 필요", term: "학기 확인" },
      }),
    ).toContain("제목 필요 · 학기 확인");
  });
  it("keeps unrelated seminar publication failures out of record feedback", () => {
    expect(recordFailureMessage({ error: "CONFLICT" })).toBeNull();
    expect(
      recordFailureMessage({ scope: "publication", error: "CONFLICT" }),
    ).toBeNull();
  });
  it("uses the KST calendar day across a UTC date boundary", () => {
    expect(recordCalendarDate("2026-09-30T15:30:00Z")).toBe("2026-10-01");
    expect(recordCalendarDate("2026-10-01T00:30:00+09:00")).toBe("2026-10-01");
  });
});
