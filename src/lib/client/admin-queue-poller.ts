export interface AdminQueuePoller {
  start(): void;
  stop(): void;
  refreshNow(): Promise<void>;
}

export function createAdminQueuePoller(
  refresh: () => Promise<void>,
  intervalMs = 30_000,
): AdminQueuePoller {
  let timer: number | null = null;
  let running = false;
  let started = false;

  const canRefresh = () =>
    document.visibilityState === "visible" && navigator.onLine;

  const refreshNow = async () => {
    if (!canRefresh() || running) return;
    running = true;
    try {
      await refresh();
    } finally {
      running = false;
    }
  };

  const resume = () => {
    if (canRefresh()) void refreshNow();
  };

  return {
    start() {
      if (started) return;
      started = true;
      timer = window.setInterval(() => void refreshNow(), intervalMs);
      document.addEventListener("visibilitychange", resume);
      window.addEventListener("online", resume);
    },
    stop() {
      if (!started) return;
      started = false;
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    },
    refreshNow,
  };
}
