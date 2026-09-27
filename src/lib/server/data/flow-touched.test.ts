import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./store", () => import("./store-memory"));

import { __reset, __sql } from "./store-memory";
import { callFlow } from "./flows";

/**
 * LA32-2: callFlow drops the cache of exactly the tables and queues a flow
 * REPORTS (`touched`, `touchedQueues`), and every flow builds those lists by
 * hand. A write missing from them left the old rows cached for up to 300s; a
 * misspelt name silently invalidated nothing. Nothing compared the lists with
 * what the function wrote.
 *
 * Under test, the memory store now records every document a flow writes and
 * fails the call when one is unreported (pglite-warmup.setup.ts turns this on
 * for every test file, so every flow any test runs is checked). These tests
 * pin the check itself, with throwaway flows that lie on purpose.
 */

beforeEach(async () => {
  await __reset();
});

/** Defines `flow_<name>(p)` with this plpgsql body. */
const defineFlow = (name: string, body: string) =>
  __sql(`create or replace function flow_${name}(p jsonb) returns jsonb
         language plpgsql set search_path = public as $$ begin ${body} end $$`);

const putEvents = `
  perform app_lock(array['events']);
  perform app_put('events', '[]'::jsonb);`;
const putQueue = `
  insert into app_queues (event_id, version, doc)
    values ('e1', 1, jsonb_build_object('schemaVersion', 1, 'rows', '[]'::jsonb))
    on conflict (event_id) do nothing;
  perform app_queue_put('e1', '[{"id":"q1"}]'::jsonb);`;

describe("flow write check (test backend)", () => {
  it("passes a flow that reports what it wrote", async () => {
    await defineFlow(
      "t_honest",
      `${putEvents} ${putQueue}
       return jsonb_build_object('touched', jsonb_build_array('events'),
                                 'touchedQueues', jsonb_build_array('e1'));`,
    );
    await expect(callFlow("flow_t_honest", {})).resolves.toMatchObject({
      touched: ["events"],
    });
  });

  it("fails a flow that writes a table it does not report", async () => {
    await defineFlow(
      "t_unreported_table",
      `${putEvents} return jsonb_build_object('touched', '[]'::jsonb);`,
    );
    await expect(callFlow("flow_t_unreported_table", {})).rejects.toThrow(
      /table "events"/,
    );
  });

  it("fails a flow that writes a queue it does not report", async () => {
    await defineFlow("t_unreported_queue", `${putQueue} return '{}'::jsonb;`);
    await expect(callFlow("flow_t_unreported_queue", {})).rejects.toThrow(
      /queue "e1"/,
    );
  });

  it("fails a flow that deletes a queue it does not report", async () => {
    await __sql(
      `insert into app_queues (event_id, version, doc)
         values ('e1', 1, '{"schemaVersion":1,"rows":[{"id":"q1"}]}'::jsonb)`,
    );
    await defineFlow(
      "t_unreported_delete",
      `perform app_queue_delete('e1'); return '{}'::jsonb;`,
    );
    await expect(callFlow("flow_t_unreported_delete", {})).rejects.toThrow(
      /queue "e1"/,
    );
  });

  it("fails a flow that reports a table that does not exist", async () => {
    await defineFlow(
      "t_misspelt",
      `${putEvents}
       return jsonb_build_object('touched',
         jsonb_build_array('events', 'seminar_requests'));`,
    );
    await expect(callFlow("flow_t_misspelt", {})).rejects.toThrow(
      /"seminar_requests"/,
    );
  });

  it("does not count the empty placeholder app_lock creates", async () => {
    await defineFlow(
      "t_lock_only",
      `perform app_lock(array['events']); return '{}'::jsonb;`,
    );
    await expect(callFlow("flow_t_lock_only", {})).resolves.toEqual({});
  });

  it("leaves nothing behind when it fails a flow", async () => {
    await defineFlow("t_rolled_back", `${putQueue} return '{}'::jsonb;`);
    await expect(callFlow("flow_t_rolled_back", {})).rejects.toThrow();
    expect(await __sql(`select 1 from app_queues`)).toEqual([]);
  });
});
