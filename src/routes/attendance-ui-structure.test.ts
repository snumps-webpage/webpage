import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (name: string) =>
  readFileSync(new URL(name, import.meta.url), "utf8");
const member = source("./(member)/events/[id]/[type]/+page.svelte");
const sheet = source("./(member)/study/[id]/attendance/+page.svelte");

describe("attendance UI source safeguards, not browser verification", () => {
  it.each([member, sheet])(
    "preserves native form feedback and auth redirects",
    (source) => {
      expect(source).toContain("data, form");
      expect(source).toContain("form?.success");
      expect(source).toContain('result.type === "redirect"');
      expect(source).toContain("} finally {");
    },
  );
  it("member local feedback resets on event navigation", () => {
    expect(member).toContain("requestPath === page.url.pathname");
    expect(member).toContain("received = false");
    expect(member).toContain("submissions.current(ticket, page.url.pathname)");
  });
  it("organizer only reconciles matching submission and remains busy during reload", () => {
    expect(sheet).toContain(
      "submissions.current(ticket, selectedSession?.eventId",
    );
    expect(sheet).toContain("savingEventId === submittedEventId");
    expect(sheet).toContain("await update({ reset: false })");
    expect(sheet).toContain("disabled={processing || !data.canSave}");
  });
  it("native sheet POST retains the selected event in its action URL", () => {
    expect(sheet).toContain(
      "?event=${encodeURIComponent(selectedSession.eventId)}&/saveAttendance",
    );
    expect(sheet).toContain('name="eventId"');
    expect(sheet).toContain('name="attendeeIds"');
  });
  it("only an active session shares a request link, without locking historical correction", () => {
    expect(sheet).toContain('selectedSession.status === "active"');
    expect(sheet).not.toContain("isStudyClosed");
    expect(sheet).toContain("저장된 출석");
  });
});
