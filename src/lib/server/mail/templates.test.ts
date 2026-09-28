import { beforeEach, describe, expect, it, vi } from "vitest";

const emit = vi.hoisted(() => ({ ok: true, calls: 0 }));
vi.mock("./dispatch", () => ({
  emitMailEvent: async () => {
    emit.calls++;
    return emit.ok;
  },
}));

import * as templates from "./templates";

// Decision #16 / audit LB14-1: every adapter dropped emitMailEvent's boolean,
// so a failed notice left no trace but the log. They now pass it through for
// the admin screens to surface as `mailFailed`.
describe("mail adapters pass the send result through (#16, LB14-1)", () => {
  const calls: [string, () => Promise<unknown>][] = [
    ["sendSignupNotification", () => templates.sendSignupNotification("홍")],
    [
      "sendAttendanceNotification",
      () => templates.sendAttendanceNotification("홍", "정기 회의"),
    ],
    [
      "sendSeminarStatusNotification",
      () =>
        templates.sendSeminarStatusNotification(
          "a@b.c",
          "홍",
          "제목",
          "approved",
        ),
    ],
    [
      "sendStudyStatusNotification",
      () =>
        templates.sendStudyStatusNotification(
          "a@b.c",
          "홍",
          "제목",
          "rejected",
        ),
    ],
    [
      "sendApplicationRejectedEmail",
      () => templates.sendApplicationRejectedEmail("a@b.c", "홍"),
    ],
    [
      "sendSeminarApplicationNotification",
      () => templates.sendSeminarApplicationNotification("홍", "제목"),
    ],
    [
      "sendStudyApplicationNotification",
      () => templates.sendStudyApplicationNotification("홍", "제목"),
    ],
    ["sendWelcomeEmail", () => templates.sendWelcomeEmail("a@b.c", "홍")],
  ];

  beforeEach(() => {
    emit.calls = 0;
  });

  it.each(calls)("%s resolves false when the send fails", async (_, call) => {
    emit.ok = false;
    expect(await call()).toBe(false);
    expect(emit.calls).toBe(1);
  });

  it.each(calls)("%s resolves true when the send succeeds", async (_, call) => {
    emit.ok = true;
    expect(await call()).toBe(true);
  });
});
