// @vitest-environment node
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import Page from "./+page.svelte";

/**
 * 활동 카드의 기본 정보 폼: 스터디에 연결된 활동은 종류 칸이 잠기고 안내가
 * 붙으며(snumps-webpage/D-000107), 수정이 거절되면 그 카드가 입력한 값으로 다시
 * 열린다(D-000098).
 */

const activity = (id: string, type: string, studyId: string | null) => ({
  id,
  title: `저장된 ${id}`,
  date: { start: "2025-03-01T19:00:00+09:00", end: null },
  type,
  attendeeIds: [],
  studyId,
  sourceRequestId: null,
  linkedEventIds: [],
  sessionStudyId: null,
  formerAttendees: [],
});

const data = {
  activities: [
    activity("a-linked", "스터디", "s1"),
    activity("a-free", "회의", null),
  ],
  members: [],
  studies: [{ id: "s1", title: "해석학", semester: "25-1" }],
  activityTypes: ["세미나", "스터디", "회식", "회의", "기타"],
  generatedAt: "2025-03-02T00:00:00+09:00",
};

const UNLINK_FIRST = /먼저 스터디\s+연결을 해제해 주세요/;

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

describe("activity card type select (D-000107)", () => {
  it("is disabled with a note on a study-linked activity", () => {
    const linked = card(html(), "a-linked");
    expect(typeSelect(linked)).toContain("disabled");
    expect(linked).toMatch(UNLINK_FIRST);
  });

  it("stays editable on an unlinked activity", () => {
    const free = card(html(), "a-free");
    expect(typeSelect(free)).not.toContain("disabled");
    expect(free).not.toMatch(UNLINK_FIRST);
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
