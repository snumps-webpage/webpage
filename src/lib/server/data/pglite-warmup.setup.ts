/**
 * vitest setupFiles: open the PGlite database (from the run's snapshot) in a
 * beforeAll, so the few hundred ms — seconds under a full parallel run — are
 * not charged to whichever test happens to touch the store first. That test
 * used to time out and leave its writes running into the next test.
 *
 * It also turns on the flow write check for every test file: any flow a test
 * runs fails if it wrote a table or queue its `touched` lists leave out
 * (audit LA32-2, store-memory.ts).
 */
import { beforeAll } from "vitest";

beforeAll(async () => {
  const store = await import("./store-memory");
  store.__checkFlowWrites(true);
  await store.__ready();
}, 120_000);
