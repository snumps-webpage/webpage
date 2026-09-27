import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The real (PostgREST) queue listing against a fake Supabase client that
 * behaves like the server: a response holds at most MAX_ROWS rows (the
 * project's "Max rows", 1000 by default) and is cut WITHOUT an error, and
 * without `.order()` the rows come back in whatever order the table has.
 */

const MAX_ROWS = 1000;

const fake = vi.hoisted(() => ({
  ids: [] as string[],
  calls: [] as { order?: string; range?: [number, number] }[],
}));

vi.mock("./supabase", () => ({
  isMemoryBackend: () => false,
  getSupabase: () => ({
    from: (table: string) => {
      if (table !== "app_queues") throw new Error(`unexpected ${table}`);
      return {
        select: () => {
          const call: { order?: string; range?: [number, number] } = {};
          fake.calls.push(call);
          const run = () => {
            let rows = fake.ids.map((event_id) => ({ event_id }));
            if (call.order)
              rows = [...rows].sort((a, b) =>
                a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0,
              );
            const [from, to] = call.range ?? [0, rows.length - 1];
            const page = rows.slice(from, Math.min(to + 1, from + MAX_ROWS));
            return { data: page, error: null };
          };
          const query = {
            order: (column: string) => {
              call.order = column;
              return query;
            },
            range: (from: number, to: number) => {
              call.range = [from, to];
              return query;
            },
            then: (
              resolve: (v: unknown) => unknown,
              reject?: (e: unknown) => unknown,
            ) => Promise.resolve(run()).then(resolve, reject),
          };
          return query;
        },
      };
    },
  }),
}));

import { listQueueIds } from "./store";

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `e${String(i).padStart(5, "0")}`);

beforeEach(() => {
  fake.ids = [];
  fake.calls = [];
});

describe("listQueueIds against PostgREST", () => {
  // LA40-2: one `select` with no paging — past Max rows the queue list was
  // silently cut, and with no order the events that fell off were arbitrary
  // (the admin pending-attendance list lost them without a trace).
  it("pages past the server's row limit, in event_id order", async () => {
    fake.ids = ids(2500).reverse(); // the table's own order is not sorted

    const got = await listQueueIds();

    expect(got).toHaveLength(2500);
    expect(got).toEqual(ids(2500));
  });

  it("stops after a short page", async () => {
    fake.ids = ids(3);

    expect(await listQueueIds()).toEqual(ids(3));
    expect(fake.calls).toHaveLength(1);
  });
});
