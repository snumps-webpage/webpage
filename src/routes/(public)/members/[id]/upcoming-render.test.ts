// @vitest-environment node
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import Page from "./+page.svelte";

/** 참석 활동 목록의 아직 열리지 않은 활동에 '예정' (snumps-webpage/D-000113). */

const item = (id: string, upcoming: boolean) => ({
  id,
  title: `활동 ${id}`,
  type: "회식",
  start: "2026-10-20T19:00:00+09:00",
  end: null,
  upcoming,
});

const html = () =>
  render(Page, {
    props: {
      data: {
        member: {
          id: "m1",
          name: "김수학",
          department: "수리과학부",
          joinedAt: "2024-03-01",
          roles: [],
        },
        standing: "associate",
        activity: {
          hostedSeminars: [],
          hostedStudies: [],
          attended: [item("next", true), item("past", false)],
          records: 1,
          recordsByType: { 회식: 1 },
        },
        generatedAt: "2026-10-17T00:00:00+09:00",
      },
    } as never,
  }).body;

/** The list item that holds this activity's title. */
function row(body: string, title: string) {
  const at = body.indexOf(title);
  return body.slice(body.lastIndexOf("<li", at), body.indexOf("</li>", at));
}

describe("public member page attended list", () => {
  it("marks only the activity that has not started", () => {
    const body = html();
    expect(row(body, "활동 next")).toContain("예정");
    expect(row(body, "활동 past")).not.toContain("예정");
  });
});
