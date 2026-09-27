import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);

import { __reset } from "$lib/server/data/store-memory";
import { _resetDataLayerForTests, getTable } from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { effectiveRules } from "$lib/server/mail/dispatch";
import { addMailRule, removeMailRule, setMailRuleEnabled } from "./mail-admin";

/**
 * An event with no rule rows uses the code's default rules. Removing an
 * event's last rule therefore left zero rows — and the default mail went out
 * again, while the page said "규칙을 제거했습니다". Removing a rule that had
 * been switched off first even brought the default back switched on
 * (audit 🔴 LB23-1, reproduced).
 */

const EVENT = "application.submitted"; // one default rule: signup-received → admins

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  for (const t of ["mail-rules", "mail-rule-history", "mail-templates"])
    await invalidateCache(`table_${t}`);
});

const sending = async () =>
  (await effectiveRules(EVENT)).filter((r) => r.enabled);

describe("removing an event's last mail rule", () => {
  it("leaves the event sending nothing", async () => {
    expect(await sending()).toHaveLength(1); // the default

    const out = await removeMailRule({
      event: EVENT,
      ruleId: null,
      templateKey: "signup-received",
      recipient: "admins",
    });

    expect(await sending()).toEqual([]);
    expect(out.keptDisabled).toBe(true);
  });

  it("does not revive a rule that was switched off first", async () => {
    await setMailRuleEnabled({
      event: EVENT,
      ruleId: null,
      templateKey: "signup-received",
      recipient: "admins",
      enabled: false,
    });
    const [rule] = await getTable("mail-rules");

    await removeMailRule({ event: EVENT, ruleId: rule.id });

    expect(await sending()).toEqual([]);
  });

  it("really deletes a rule when others remain for the event", async () => {
    await addMailRule({
      event: EVENT,
      templateKey: "signup-received",
      recipient: "executives",
    });
    const rows = (await getTable("mail-rules")).filter(
      (r) => r.event === EVENT,
    );
    expect(rows).toHaveLength(2);

    const out = await removeMailRule({
      event: EVENT,
      ruleId: rows.find((r) => r.recipient === "executives")!.id,
    });

    expect(out.keptDisabled).toBe(false);
    expect(
      (await getTable("mail-rules")).filter((r) => r.event === EVENT),
    ).toHaveLength(1);
    expect(await sending()).toHaveLength(1);
  });
});
