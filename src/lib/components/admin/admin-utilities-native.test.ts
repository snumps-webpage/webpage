// @vitest-environment node
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import Executives from "../../../routes/(admin)/admin/executives/+page.svelte";
import Mail from "../../../routes/(admin)/admin/mail/+page.svelte";
import History from "../../../routes/(public)/about/executives/+page.svelte";
import type { AdminUtilityActionState } from "$lib/domain/admin-utility-state";

const execData = {
  term: "27-1",
  currentTerm: "26-2",
  selectedTitle: "회장",
  titles: [{ title: "회장", isCustom: false }],
  assignments: [],
  candidates: [
    {
      id: "m1",
      name: "예시 회원",
      department: "수리과학부",
      registered: false,
    },
  ],
};
const mailData = {
  templates: [
    {
      key: "welcome",
      name: "예시 환영",
      description: "예시 설명",
      variables: [],
      subject: "saved subject",
      body: "saved body",
      enabled: true,
      customized: false,
      isCustom: false,
      canRevert: false,
      updatedAt: null,
    },
  ],
  variables: [
    {
      key: "room",
      value: "saved room",
      description: "예시 공용 변수",
      customized: false,
      isCustom: false,
      canRevert: false,
      updatedAt: null,
    },
  ],
  events: [
    {
      event: "application.approved",
      name: "예시 승인",
      description: "예시 이벤트",
      variables: [],
      allowedRecipients: [{ key: "party", label: "당사자" }],
      materialized: true,
      canRevert: false,
      rules: [
        {
          id: "r1",
          templateKey: "welcome",
          templateName: "예시 환영",
          recipient: "party",
          recipientLabel: "당사자",
          enabled: true,
        },
      ],
    },
  ],
  generatedAt: "2026-10-03T00:00:00Z",
};
const mailHtml = (form: AdminUtilityActionState | null = null) =>
  render(Mail, { props: { data: mailData as never, form: form as never } })
    .body;

describe("native existing executive and mail workflows", () => {
  it("renders native executive GET choices and named POST with future term/title context", () => {
    const body = render(Executives, {
      props: { data: execData as never, form: null },
    }).body;
    expect(body).toContain('method="GET"');
    expect(body).toContain('name="term"');
    expect(body).toContain('name="title"');
    expect(body).toContain("/assign");
    expect(body).toContain("term=27-1");
    expect(body).toContain('value="27-1"');
  });
  it("does not offer assignment to a removed/absent selected title", () => {
    const body = render(Executives, {
      props: { data: { ...execData, selectedTitle: "" } as never, form: null },
    }).body;
    expect(body).not.toContain("&amp;/assign");
    expect(body).toContain("배정 대상을 조회하세요");
  });
  it("shows native executive failed raw title and its result", () => {
    const body = render(Executives, {
      props: {
        data: execData as never,
        form: {
          scope: "executive",
          action: "addTitle",
          error: "VALIDATION_FAILED",
          values: { title: "  raw title  " },
        } as never,
      },
    }).body;
    expect(body).toContain('value="  raw title  "');
    expect(body).toContain('role="alert"');
  });
  it("offers all existing mail editor and both test forms without JavaScript", () => {
    const body = mailHtml();
    for (const action of [
      "save",
      "createTemplate",
      "saveVariable",
      "addRule",
      "testTemplate",
      "testEvent",
    ])
      expect(body).toContain(`action="?/${action}"`);
    expect(body).toContain("<details");
    expect(body).toContain('name="editor" value="create"');
    expect(body).toContain('name="body"');
  });
  it("renders a failed template's raw body and unchecked state instead of saved values", () => {
    const body = mailHtml({
      scope: "mail-template",
      action: "save",
      targetKey: "welcome",
      error: "VALIDATION_FAILED",
      values: { subject: "  ", body: " RAW_BODY ", enabled: "" },
    });
    expect(body).toContain('value="  "');
    expect(body).toContain(" RAW_BODY ");
    expect(body).not.toMatch(/name="enabled" checked/);
    expect(body).toContain('role="alert"');
  });
  it("keeps failed variable creation raw fields in the correct native disclosure", () => {
    const body = mailHtml({
      scope: "mail-variable-create",
      action: "saveVariable",
      targetKey: "rawkey",
      error: "VALIDATION_FAILED",
      values: {
        key: " raw key ",
        value: " RAW_VALUE ",
        description: " raw description ",
      },
    });
    expect(body).toContain('value=" raw key "');
    expect(body).toContain('value=" RAW_VALUE "');
    expect(body).toContain('value="saved room"');
  });
  it("marks only the actual current history term,not the newest future term", () => {
    const data = {
      currentTerm: "26-2",
      dataAvailable: true,
      terms: [
        {
          term: "27-1",
          holders: [
            {
              term: "27-1",
              title: "회장",
              name: "예시 미래 회장",
              contact: null,
            },
          ],
        },
        {
          term: "26-2",
          holders: [
            {
              term: "26-2",
              title: "회장",
              name: "예시 현재 회장",
              contact: null,
            },
          ],
        },
      ],
    };
    const body = render(History, { props: { data: data as never } }).body;
    expect(body.match(/>Current</g)?.length).toBe(1);
    expect(body).toMatch(/26-2[\s\S]*?>Current</);
    const past = render(History, {
      props: { data: { ...data, terms: [data.terms[0]] } as never },
    }).body;
    expect(past).not.toContain(">Current<");
  });
});
