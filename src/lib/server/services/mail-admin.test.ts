import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => [] as { to: string[]; body: string }[]);
vi.mock(
  "$lib/server/data/store",
  () => import("$lib/server/data/store-memory"),
);
vi.mock("$lib/server/mail/client", () => ({
  getAdminAccessToken: async () => "token",
  dispatchEmail: async (
    _t: string,
    to: string[],
    _subject: string,
    body: string,
  ) => {
    sent.push({ to, body });
  },
}));

import { __reset } from "$lib/server/data/store-memory";
import {
  _resetDataLayerForTests,
  getTable,
  mutate,
} from "$lib/server/data/tables";
import { invalidateCache } from "$lib/server/cache";
import { effectiveRules } from "$lib/server/mail/dispatch";
import {
  addMailRule,
  createMailTemplate,
  deleteMailTemplate,
  removeMailRule,
  revertMailEvent,
  saveMailVariable,
  sendTestTemplate,
  setMailRuleEnabled,
} from "./mail-admin";

const EVENT = "application.submitted"; // one default rule: signup-received → admins
const OTHER = "application.approved"; // one default rule: welcome → party

beforeEach(async () => {
  await __reset();
  _resetDataLayerForTests({ backoffBaseMs: 1 });
  sent.length = 0;
  for (const t of [
    "mail-rules",
    "mail-rule-history",
    "mail-templates",
    "mail-variables",
  ])
    await invalidateCache(`table_${t}`);
});

const rulesOf = async (event: string) =>
  (await getTable("mail-rules")).filter((r) => r.event === event);
const historyOf = async (event: string) =>
  (await getTable("mail-rule-history")).find((h) => h.event === event)?.rules ??
  null;

const DEFAULT_SET = [
  { templateKey: "signup-received", recipient: "admins", enabled: true },
];

// A rule edit wrote the undo history first, then materialized, then checked:
// a refused edit (duplicate, not found) or an edit that changed nothing still
// overwrote the one-step history with the current set and materialized the
// event, so undo did nothing and the real previous set was gone (audit LB23-2).
describe("rule edits and the one-step undo history", () => {
  it("a refused duplicate add leaves history and materialization alone", async () => {
    await expect(
      addMailRule({
        event: EVENT,
        templateKey: "signup-received",
        recipient: "admins",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await rulesOf(EVENT)).toEqual([]);
    expect(await historyOf(EVENT)).toBeNull();
  });

  it("a refused add after a real change keeps the real previous set", async () => {
    await addMailRule({
      event: EVENT,
      templateKey: "signup-received",
      recipient: "executives",
    });
    expect(await historyOf(EVENT)).toEqual(DEFAULT_SET);

    await expect(
      addMailRule({
        event: EVENT,
        templateKey: "signup-received",
        recipient: "executives",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await historyOf(EVENT)).toEqual(DEFAULT_SET);
  });

  it("a toggle to the value a rule already has does not touch history", async () => {
    await setMailRuleEnabled({
      event: EVENT,
      ruleId: null,
      templateKey: "signup-received",
      recipient: "admins",
      enabled: true,
    });

    expect(await rulesOf(EVENT)).toEqual([]);
    expect(await historyOf(EVENT)).toBeNull();
  });

  it("revert still swaps the current and previous sets", async () => {
    await addMailRule({
      event: EVENT,
      templateKey: "signup-received",
      recipient: "executives",
    });
    await revertMailEvent(EVENT);

    expect(
      (await effectiveRules(EVENT)).map((r) => r.recipient).sort(),
    ).toEqual(["admins"]);
    expect((await historyOf(EVENT))!.map((r) => r.recipient).sort()).toEqual([
      "admins",
      "executives",
    ]);
  });
});

// A ruleId was looked up without its event: event=A with B's rule id removed
// or toggled B's rule, recorded no undo history for B, and materialized A for
// nothing (audit LB23-3).
describe("a rule id given with the wrong event", () => {
  async function ruleOfEvent() {
    await addMailRule({
      event: EVENT,
      templateKey: "signup-received",
      recipient: "executives",
    });
    return (await rulesOf(EVENT)).find((r) => r.recipient === "executives")!;
  }

  it("is not removed", async () => {
    const rule = await ruleOfEvent();

    await expect(
      removeMailRule({ event: OTHER, ruleId: rule.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await rulesOf(EVENT)).toHaveLength(2);
    expect(await rulesOf(OTHER)).toEqual([]);
  });

  it("is not toggled", async () => {
    const rule = await ruleOfEvent();

    await expect(
      setMailRuleEnabled({ event: OTHER, ruleId: rule.id, enabled: false }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect((await rulesOf(EVENT)).every((r) => r.enabled)).toBe(true);
    expect(await rulesOf(OTHER)).toEqual([]);
  });
});

// The template test filled every token with a sample, shared variables too,
// and the sample won over the real value: the welcome test mail showed
// "[예시 noticeChatLink]" instead of the chat link the admin had just edited
// (audit LB23-5).
describe("sending a template test", () => {
  it("shows the shared variables' real values", async () => {
    await saveMailVariable({
      key: "noticeChatLink",
      value: "https://open.kakao.com/o/test-notice",
      description: "",
    });

    await sendTestTemplate("me@snu.ac.kr", "welcome");

    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain("https://open.kakao.com/o/test-notice");
    expect(sent[0].body).not.toContain("[예시 noticeChatLink]");
    expect(sent[0].body).toContain("[예시 name]");
  });
});

// Deleting a custom template checked the live rules only. The undo history
// could still hold a rule using it, and revert brought that rule back
// pointing at nothing — skipped when sending, shown by its raw key (audit
// LB23-7).
describe("a custom template the undo history still uses", () => {
  it("cannot be deleted", async () => {
    const key = await createMailTemplate({
      name: "리마인더",
      subject: "S",
      body: "B",
    });
    await addMailRule({ event: EVENT, templateKey: key, recipient: "admins" });
    const rule = (await rulesOf(EVENT)).find((r) => r.templateKey === key)!;
    await removeMailRule({ event: EVENT, ruleId: rule.id });
    expect((await rulesOf(EVENT)).some((r) => r.templateKey === key)).toBe(
      false,
    );

    await expect(deleteMailTemplate(key)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("is not revived by revert once it is gone", async () => {
    await mutate("mail-rule-history", () => [
      {
        event: EVENT,
        rules: [
          { templateKey: "custom-gone", recipient: "admins", enabled: true },
        ],
        updatedAt: "2026-09-01T00:00:00+09:00",
      },
    ]);

    await expect(revertMailEvent(EVENT)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    expect(await rulesOf(EVENT)).toEqual([]);
  });
});
