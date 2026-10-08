import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (name: string) =>
  readFileSync(new URL(name, import.meta.url), "utf8");

describe("seminar UI source safeguards (not browser behavior)", () => {
  it("does not offer the ignored approval kind mutation", () => {
    const card = source("./SeminarReviewCard.svelte");
    expect(card).not.toContain('name="kind"');
    expect(card).not.toContain('type="radio"');
    expect(card).toContain('action="/admin?/approveSeminar"');
    expect(card).toContain('action="/admin?/rejectSeminar"');
  });
  it("keeps native record feedback visible after POST reload", () => {
    const page = source("../../../routes/(admin)/admin/seminars/+page.svelte");
    expect(page).toContain('<details class="record-tools" open={!!form}>');
  });
  it("guards Escape while the schedule save is pending", () => {
    const dialog = source("./SeminarScheduleDialog.svelte");
    expect(dialog).toMatch(
      /oncancel=\{\(event\) => \{\s*if \(processing\) event\.preventDefault\(\);/,
    );
    expect(dialog).toContain("disabled={processing}");
  });
  it.each([
    "SeminarReviewCard.svelte",
    "SeminarPublicationCard.svelte",
    "SeminarScheduleDialog.svelte",
  ])(
    "%s handles auth redirects and clears busy state after reload failure",
    (file) => {
      const text = source("./" + file);
      expect(text).toContain('result.type === "redirect"');
      expect(text).toContain("await update({ reset: false })");
      expect(text).toContain("} finally {");
      expect(text).toContain("처리 결과를 새로 불러오지 못했습니다");
    },
  );
  it("disables schedule opening during a card mutation", () => {
    expect(source("./SeminarPublicationCard.svelte")).toMatch(
      /disabled=\{processing\}\s+onclick=\{\(\) => onSchedule\(seminar\)\}/,
    );
  });
});
