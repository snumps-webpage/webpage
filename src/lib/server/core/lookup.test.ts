import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { AppError } from "./errors";
import { lookupTable } from "./lookup";
import { isUploadPurpose } from "$lib/server/services/uploads";
import { MAIL_EVENTS, RECIPIENTS } from "$lib/server/mail/events";
import {
  MAIL_TEMPLATE_DEFAULTS,
  MAIL_VARIABLE_DEFAULTS,
} from "$lib/server/mail/template-store";
import { addMailRule, removeMailRule } from "$lib/server/services/mail-admin";

/**
 * "constructor", "toString", "__proto__" as keys: on plain object literals
 * they passed `in` checks and indexed to functions — a 500 with a raw
 * TypeError, or a stored rule whose template was "Object" (audit LB23-4,
 * LB32-1, reproduced).
 */

const PROTO_KEYS = ["constructor", "toString", "__proto__", "hasOwnProperty"];

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["mail-rules", "mail-rule-history", "mail-templates"])
    await invalidateCache(`table_${t}`);
});

describe("lookup tables answer only for their own keys", () => {
  it.each(PROTO_KEYS)("%s", (key) => {
    for (const table of [
      MAIL_EVENTS,
      MAIL_TEMPLATE_DEFAULTS,
      MAIL_VARIABLE_DEFAULTS,
      RECIPIENTS,
    ] as Record<string, unknown>[]) {
      expect(key in table).toBe(false);
      expect(table[key]).toBeUndefined();
    }
    expect(isUploadPurpose(key)).toBe(false);
  });

  it("keeps the entries it was given", () => {
    const t = lookupTable({ a: 1 });
    expect(t.a).toBe(1);
    expect(Object.keys(t)).toEqual(["a"]);
  });
});

describe("mail admin with a prototype key", () => {
  const refused = (e: unknown) =>
    e instanceof AppError &&
    (e.code === "VALIDATION_FAILED" || e.code === "NOT_FOUND");

  it.each(PROTO_KEYS)("refuses %s as an event or a template", async (key) => {
    await expect(
      addMailRule({
        event: key,
        templateKey: "signup-received",
        recipient: "admins",
      }),
    ).rejects.toSatisfy(refused);
    await expect(
      addMailRule({
        event: "application.submitted",
        templateKey: key,
        recipient: "admins",
      }),
    ).rejects.toSatisfy(refused);
    await expect(removeMailRule({ event: key, ruleId: "x" })).rejects.toSatisfy(
      refused,
    );
    expect(
      (await getTable("mail-rules")).some((r) => r.templateKey === key),
    ).toBe(false);
  });
});
