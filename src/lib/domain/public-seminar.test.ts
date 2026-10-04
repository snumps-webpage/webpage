import { describe, expect, it } from "vitest";
import { publicSeminarFiles, publicSeminarSchedule } from "./public-seminar";

describe("public seminar factual display", () => {
  it("keeps a known KST time", () => {
    const v = publicSeminarSchedule("2026-10-14T09:30:00Z", true);
    expect(v.text).toContain("06:30");
    expect(v.dateTime).toBe("2026-10-14T09:30:00Z");
    expect(v.timeKnown).toBe(true);
  });
  it("does not invent midnight for date-only records", () => {
    const v = publicSeminarSchedule("2026-10-14T00:00:00+09:00", false);
    expect(v.text).toContain("14일");
    expect(v.text).not.toMatch(/오전|오후|00:00|12:00/);
    expect(v.dateTime).toBeNull();
    expect(v.timeKnown).toBe(false);
  });
  it("does not assume a time when the list DTO flag is absent", () =>
    expect(publicSeminarSchedule("2026-10-14T18:30:00+09:00").timeKnown).toBe(
      false,
    ));
  it("distinguishes missing and invalid schedule facts", () => {
    expect(publicSeminarSchedule(null).text).toBe("일정 기록 없음");
    expect(publicSeminarSchedule("invalid").text).toBe("일정 기록 확인 필요");
  });
  it("keeps existing guarded media URLs unchanged", () => {
    const f = publicSeminarFiles(["/media/seminars/public/notes.pdf"])[0];
    expect(f.href).toBe("/media/seminars/public/notes.pdf");
    expect(f.name).toBe("notes.pdf");
    expect(f.kind).toBe("PDF");
  });
  it("decodes names without rewriting a URL", () => {
    const url = "/media/seminars/public/%EA%B0%95%EC%9D%98.pdf";
    expect(publicSeminarFiles([url])[0]).toMatchObject({
      name: "강의.pdf",
      href: url,
    });
  });
  it("keeps duplicate recorded file values with unique display keys", () => {
    const f = publicSeminarFiles(["/media/a.pdf", "/media/a.pdf"]);
    expect(f.map((v) => v.key)).toEqual([0, 1]);
    expect(f.map((v) => v.href)).toEqual(["/media/a.pdf", "/media/a.pdf"]);
  });
  it("does not create a clickable empty link", () =>
    expect(publicSeminarFiles([""])[0]).toMatchObject({
      href: null,
      name: "자료 연결 확인 필요",
    }));
  it("malformed filename encoding cannot throw during UI display", () =>
    expect(publicSeminarFiles(["/media/raw%invalid.pdf"])[0].name).toBe(
      "raw%invalid.pdf",
    ));
  it("labels image and other assets without changing their addresses", () => {
    expect(publicSeminarFiles(["/media/photo.WEBP"])[0].kind).toBe("이미지");
    expect(publicSeminarFiles(["/media/notes.txt"])[0].kind).toBe("자료");
  });
});
