import { describe, expect, it } from "vitest";
import { createAttendanceSubmissionGate } from "./attendance-submission";
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
};
describe("attendance submission ownership", () => {
  it("navigation invalidates a response even after returning to the same scope", () => {
    const gate = createAttendanceSubmissionGate();
    const old = gate.begin("A");
    gate.invalidate();
    gate.invalidate();
    expect(gate.current(old, "A")).toBe(false);
  });
  it("newer same-scope submission owns feedback and finally cleanup", async () => {
    const gate = createAttendanceSubmissionGate(),
      old = gate.begin("A"),
      wait = deferred();
    let feedback = "",
      busy = true;
    const oldResponse = (async () => {
      await wait.promise;
      if (gate.current(old, "A")) {
        feedback = "old";
        busy = false;
      }
    })();
    const latest = gate.begin("A");
    wait.resolve();
    await oldResponse;
    expect(feedback).toBe("");
    expect(busy).toBe(true);
    expect(gate.current(latest, "A")).toBe(true);
  });
  it("navigation during reload blocks deferred success and cleanup", async () => {
    const gate = createAttendanceSubmissionGate(),
      ticket = gate.begin("A"),
      wait = deferred();
    let scope = "A",
      message = "";
    const reload = (async () => {
      if (!gate.current(ticket, scope)) return;
      await wait.promise;
      if (gate.current(ticket, scope)) message = "saved";
    })();
    scope = "B";
    gate.invalidate();
    wait.resolve();
    await reload;
    expect(message).toBe("");
  });
  it("unrelated scope cannot claim a ticket", () => {
    const gate = createAttendanceSubmissionGate();
    expect(gate.current(gate.begin("A"), "B")).toBe(false);
  });
});
