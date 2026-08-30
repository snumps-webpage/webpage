import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminQueuePoller } from "./admin-queue-poller";

describe("admin queue poller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });
  afterEach(() => vi.useRealTimers());

  it("polls every 30 seconds and refreshes immediately when returning online", async () => {
    const refresh = vi.fn(async () => {});
    const poller = createAdminQueuePoller(refresh);
    poller.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("online"));
    await vi.runAllTicks();
    expect(refresh).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("does not poll while hidden and refreshes once visible", async () => {
    const refresh = vi.fn(async () => {});
    const poller = createAdminQueuePoller(refresh);
    poller.start();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(refresh).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.runAllTicks();
    expect(refresh).toHaveBeenCalledTimes(1);
    poller.stop();
  });
});
