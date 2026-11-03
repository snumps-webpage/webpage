// @vitest-environment node
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import Page from "./+page.svelte";

/**
 * 활동 카드의 기본 정보 폼: 스터디에 연결된 활동의 종류 칸은 '스터디'·'회식'만
 * 보이고 안내가 붙으며, 스터디 회차 활동은 종류 칸이 잠긴다(snumps-webpage/
 * D-000129·138, D-000107 대체). 스터디 연결 칸은 '스터디'·'회식' 활동에만
 * 있다(D-000135). 수정이 거절되면 그 카드가 입력한 값으로 다시 열린다(D-000098).
 */

const activity = (
  id: string,
  type: string,
  studyId: string | null,
  sessionStudyId: string | null = null,
) => ({
  id,
  title: `저장된 ${id}`,
  date: { start: "2025-03-01T19:00:00+09:00", end: null },
  type,
  attendeeIds: [],
  studyId,
  sourceRequestId: null,
  linkedEventIds: [],
  sessionStudyId,
  formerAttendees: [],
});

const data = {
  activities: [
    activity("a-linked", "스터디", "s1"),
    activity("a-free", "회의", null),
    activity("a-linked-meeting", "회의", "s1"),
    activity("a-session", "스터디", "s1", "s1"),
    activity("a-session-meeting", "회의", "s1", "s1"),
    activity("a-dinner", "회식", null),
  ],
  members: [],
  studies: [{ id: "s1", title: "해석학", semester: "25-1" }],
  activityTypes: ["세미나", "스터디", "회식", "회의", "기타"],
  generatedAt: "2025-03-02T00:00:00+09:00",
};

const LINKED_NOTE =
  /스터디에 연결된 활동은 종류를 '스터디'나 '회식'으로만\s+바꿀\s+수\s+있습니다/;
const SESSION_NOTE = "스터디 회차 활동은 종류를 바꿀 수 없습니다.";

const html = (form: unknown = null) =>
  render(Page, { props: { data, form } as never }).body;

/** The markup of one activity's card, from its <details> to the next. */
function card(body: string, id: string) {
  const start = body.indexOf(`value="${id}"`);
  const open = body.lastIndexOf("<details", start);
  return body.slice(open, body.indexOf("</details>", start));
}

const typeSelect = (cardHtml: string) => {
  const at = cardHtml.indexOf('name="type"');
  return cardHtml.slice(
    cardHtml.lastIndexOf("<select", at),
    cardHtml.indexOf("</select>", at),
  );
};

const optionsOf = (select: string) =>
  [...select.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);

describe("activity card type select (D-000138)", () => {
  it("offers only 스터디 and 회식 on a study-linked activity, with a note", () => {
    const linked = card(html(), "a-linked");
    expect(typeSelect(linked)).not.toContain("disabled");
    expect(optionsOf(typeSelect(linked))).toEqual(["스터디", "회식"]);
    expect(typeSelect(linked)).toMatch(/<option value="스터디"[^>]*selected/);
    expect(linked).toMatch(LINKED_NOTE);
  });

  it("shows an old linked type as it is stored, beside 스터디 and 회식", () => {
    const old = typeSelect(card(html(), "a-linked-meeting"));
    expect(optionsOf(old)).toEqual(["회의", "스터디", "회식"]);
    expect(old).toMatch(/<option value="회의"[^>]*selected/);
  });

  it("locks a study-session activity's type with the session note (D-000129)", () => {
    const session = card(html(), "a-session");
    expect(typeSelect(session)).toContain("disabled");
    expect(session).toContain(SESSION_NOTE);
    expect(session).not.toMatch(LINKED_NOTE);
  });

  // D-000237: an old session activity no longer typed 스터디 can be moved back
  it("opens a session activity of another type to its type and 스터디 only", () => {
    const strayed = typeSelect(card(html(), "a-session-meeting"));
    expect(strayed).not.toContain("disabled");
    expect(optionsOf(strayed)).toEqual(["회의", "스터디"]);
    expect(strayed).toMatch(/<option value="회의"[^>]*selected/);
  });

  it("stays editable on an unlinked activity, every type offered", () => {
    const free = card(html(), "a-free");
    expect(typeSelect(free)).not.toContain("disabled");
    expect(optionsOf(typeSelect(free))).toEqual(data.activityTypes);
    expect(free).not.toMatch(LINKED_NOTE);
    expect(free).not.toContain(SESSION_NOTE);
  });
});

describe("study link select (D-000135)", () => {
  const hasLinkForm = (id: string) =>
    card(html(), id).includes('action="?/setStudy"');

  it("shows on 스터디 and 회식 activities only", () => {
    expect(hasLinkForm("a-linked")).toBe(true);
    expect(hasLinkForm("a-dinner")).toBe(true);
    expect(hasLinkForm("a-free")).toBe(false);
    // a session's study is shown read-only instead (D-000088)
    expect(hasLinkForm("a-session")).toBe(false);
  });
});

describe("refused ?/update (D-000098)", () => {
  const refused = {
    error: "CONFLICT",
    message: "세미나 활동의 제목·일정은 세미나 관리에서 수정해 주세요.",
    id: "a-free",
    values: {
      title: "입력한 제목",
      type: "기타",
      start: "2025-04-05T00:00",
      end: "",
    },
  };

  it("opens that card filled with the submitted values", () => {
    const free = card(html(refused), "a-free");
    expect(free.slice(0, free.indexOf(">"))).toContain("open");
    expect(free).toContain('value="입력한 제목"');
    expect(free).not.toContain('value="저장된 a-free"');
    expect(free).toMatch(/<option value="기타"[^>]*selected/);
    expect(free).toContain('value="2025-04-05"');
  });

  it("leaves the other cards closed with their stored values", () => {
    const linked = card(html(refused), "a-linked");
    expect(linked.slice(0, linked.indexOf(">"))).not.toContain("open");
    expect(linked).toContain('value="저장된 a-linked"');
  });

  it("keeps the stored date and type when the form left them out", () => {
    const free = card(
      html({
        ...refused,
        values: { title: "x", type: "", start: "", end: "" },
      }),
      "a-free",
    );
    expect(free).toContain('value="2025-03-01"');
    expect(free).toMatch(/<option value="회의"[^>]*selected/);
  });
});
