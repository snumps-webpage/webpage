import { describe, expect, it } from "vitest";
import {
  adminSeminarRequestItem,
  contentFileFromKey,
} from "./admin-queue-views";
import type { SeminarRequest } from "./schemas";

/**
 * The request's kind has been stored since a877404, but the admin queue kept
 * answering "irregular" for every request, so the review card marked a
 * regular request 비정기 (audit LA29-1).
 */

const request = (kind: SeminarRequest["kind"]): SeminarRequest => ({
  id: "r1",
  title: "세미나",
  description: "",
  prerequisites: "",
  duration: "60분",
  preferredTiming: "",
  presenterIds: [],
  attachment: "",
  posterKey: "",
  requesterId: "m1",
  status: "pending",
  closedAs: null,
  kind,
  createdAt: "2026-09-01T10:00:00+09:00",
});

describe("adminSeminarRequestItem", () => {
  it("shows the kind the requester chose", () => {
    expect(adminSeminarRequestItem(request("regular"), new Map()).kind).toBe(
      "regular",
    );
    expect(adminSeminarRequestItem(request("irregular"), new Map()).kind).toBe(
      "irregular",
    );
  });

  it("preserves an unknown legacy request kind as null", () => {
    expect(adminSeminarRequestItem(request(null), new Map()).kind).toBeNull();
  });
});

// The https check lives only in the member form; the migration copied
// Notion URLs as they were, and the card renders this as a link (LA29-7).
describe("adminSeminarRequestItem attachment link", () => {
  it("keeps an https attachment and drops a script URL", () => {
    const withAttachment = (attachment: string) =>
      adminSeminarRequestItem({ ...request("regular"), attachment }, new Map())
        .attachmentUrl;
    expect(withAttachment("https://drive.example/a")).toBe(
      "https://drive.example/a",
    );
    expect(withAttachment("javascript:alert(1)")).toBeNull();
    expect(withAttachment("")).toBeNull();
  });
});

// Storage does not report sizes here; the 0 stood in for "unknown" and the
// record editors printed "0.0 KB" for every file (audit LA29-2).
describe("contentFileFromKey", () => {
  it("leaves an untracked size unknown", () => {
    expect(contentFileFromKey("seminars/s1/notes.pdf", "pdf").size).toBeNull();
  });
});
