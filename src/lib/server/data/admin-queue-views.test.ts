import { describe, expect, it } from "vitest";
import { adminSeminarRequestItem } from "./admin-queue-views";
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

  it("shows a request from before the form asked the kind as 비정기", () => {
    expect(adminSeminarRequestItem(request(null), new Map()).kind).toBe(
      "irregular",
    );
  });
});
