import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./store", () => import("./store-memory"));

import { __reset } from "./store-memory";
import { _resetDataLayerForTests, getTable } from "./tables";
import { ensureCreated } from "./idempotency";
import { invalidateCache } from "$lib/server/cache";
import { newId } from "$lib/server/core/id";
import type { Seminar } from "./schemas";

const buildSeminar = (sourceRequestId: string): Seminar => ({
  id: newId(),
  title: "테스트 세미나",
  semester: "26-2",
  note: "",
  presenterIds: [],
  externalPresenters: "",
  materials: [],
  photos: [],
  posterKey: "",
  activityId: null,
  sourceRequestId,
});

beforeEach(async () => {
  __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  await invalidateCache("table_seminars");
});

describe("ensureCreated — §1-6 check-before-create", () => {
  it("creates once and returns the existing record on re-run", async () => {
    const source = newId();
    const first = await ensureCreated("seminars", source, () => buildSeminar(source));
    const second = await ensureCreated("seminars", source, () => buildSeminar(source));
    expect(second.id).toBe(first.id);
    expect(await getTable("seminars")).toHaveLength(1);
  });

  it("creates independently for distinct source ids, even concurrently", async () => {
    const sources = Array.from({ length: 5 }, () => newId());
    await Promise.all(
      sources.map((s) => ensureCreated("seminars", s, () => buildSeminar(s))),
    );
    expect(await getTable("seminars")).toHaveLength(5);
  });
});
