import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { fieldIssues, formText, localDateTimeInput } from "./form-data";

const schema = z.object({
  title: z.string().min(1, "제목"),
  note: z.string().max(3, "비고"),
  tags: z.array(z.string().min(1, "태그")),
});
const errorOf = (v: unknown) => schema.safeParse(v).error!;

describe("fieldIssues", () => {
  it("keeps the first message per top-level field", () => {
    const e = errorOf({ title: "", note: "길다길다", tags: ["", ""] });
    expect(fieldIssues(e)).toEqual({
      title: "제목",
      note: "비고",
      tags: "태그",
    });
  });

  it("puts fields outside the list, and path-less issues, under _form", () => {
    const e = errorOf({ title: "", note: "길다길다", tags: [] });
    expect(fieldIssues(e, ["title"] as const)).toEqual({
      title: "제목",
      _form: "비고",
    });
    const root = z
      .object({ a: z.string() })
      .refine(() => false, "전체")
      .safeParse({ a: "x" }).error!;
    expect(fieldIssues(root)).toEqual({ _form: "전체" });
  });
});

describe("formText", () => {
  it("reads missing fields and files as empty strings", () => {
    const f = new FormData();
    f.set("a", "값");
    f.set("file", new Blob(["x"]));
    expect([
      formText(f, "a"),
      formText(f, "file"),
      formText(f, "none"),
    ]).toEqual(["값", "", ""]);
  });
});

// Audit LC04-4: three forms had their own copy of this field; one guarded the
// calendar refine, two aborted on the shape. The shared piece keeps each
// form's shape message and reports one issue per bad value.
describe("localDateTimeInput", () => {
  const field = localDateTimeInput("날짜와 시작 시간을 입력해 주세요.");
  const messages = (v: string) =>
    field.safeParse(v).error?.issues.map((issue) => issue.message);

  it("gives a malformed value the form's shape message alone", () => {
    expect(messages("")).toEqual(["날짜와 시작 시간을 입력해 주세요."]);
    expect(messages("2026-09-03 18:30")).toEqual([
      "날짜와 시작 시간을 입력해 주세요.",
    ]);
  });

  it("gives a well-formed impossible time the calendar message", () => {
    expect(messages("2026-02-30T10:00")).toEqual([
      "존재하지 않는 날짜나 시각입니다.",
    ]);
  });

  it("trims and accepts a real time", () => {
    expect(field.parse(" 2026-09-03T18:30 ")).toBe("2026-09-03T18:30");
  });
});
