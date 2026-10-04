import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const list = read("./(public)/archive/seminars/+page.svelte"),
  index = read("../lib/components/public/SeminarArchiveIndex.svelte"),
  detail = read("./(public)/archive/seminars/[id]/+page.svelte"),
  error = read("./(public)/archive/seminars/+error.svelte");
describe("public seminar UI source safeguards,not browser verification", () => {
  it("keeps the existing search and ordering model", () => {
    expect(index).toContain("seminarIndexItems(records)");
    expect(index).toContain("filterPublicIndex(items, query)");
    expect(index).toContain("bind:value={query}");
    expect(index).toContain('type="search"');
    expect(index).toContain('aria-describedby="seminar-search-help"');
    expect(index).toContain('aria-live="polite"');
  });
  it("provides search clearing and distinguishes no matches from no published records", () => {
    expect(index).toContain("function clearSearch()");
    expect(index).toContain('query = ""');
    expect(index).toContain("searchInput?.focus()");
    expect(index).toContain("검색에 맞는 세미나가 없습니다");
    expect(index).toContain("아직 공개된 세미나 기록이 없습니다");
  });
  it("keeps snapshot failure explicit with actual retry", () => {
    expect(list).toContain("data.dataAvailable");
    expect(list).toContain("세미나 목록을 불러오지 못했습니다");
    expect(list).toContain('href="/archive/seminars" data-sveltekit-reload');
  });
  it("puts actual facts above overview/materials and defers the existing poster", () => {
    expect(detail.indexOf("seminar-primary-facts")).toBeLessThan(
      detail.indexOf('id="seminar-overview"'),
    );
    expect(detail).toContain('id="seminar-materials"');
    expect(detail).toContain("<details");
    expect(detail).toContain("publicSeminarSchedule");
    expect(detail).toContain("시각 기록 없음");
    expect(detail).toContain("seminar.prerequisites");
    expect(detail).toContain('href="/archive/seminars"');
  });
  it("preserves source file URLs and new-window safety without empty-link guessing", () => {
    expect(detail).toContain("publicSeminarFiles(seminar.materials)");
    expect(detail).toContain("{#if file.href}");
    expect(detail).toContain("href={file.href}");
    expect(detail).toContain('rel="noopener noreferrer"');
    expect(detail).toContain("(file.key)");
    expect(detail).toContain("등록된 공개 자료가 없습니다");
  });
  it("distinguishes 404 and503 without showing raw backend error messages", () => {
    expect(error).toContain("page.status === 404");
    expect(error).toContain("page.status === 503");
    expect(error).not.toContain("page.error");
    expect(error).toContain("data-sveltekit-reload");
    expect(error).toContain('href="/archive/seminars"');
  });
});
