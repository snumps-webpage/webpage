/**
 * vitest setupFiles: open the PGlite database (from the run's snapshot) in a
 * beforeAll, so the few hundred ms — seconds under a full parallel run — are
 * not charged to whichever test happens to touch the store first. That test
 * used to time out and leave its writes running into the next test.
 */
import { beforeAll } from "vitest";

beforeAll(async () => {
  const store = await import("./store-memory");
  await store.__ready();
}, 120_000);
