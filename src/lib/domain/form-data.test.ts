import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { fieldIssues, formText } from "./form-data";

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
