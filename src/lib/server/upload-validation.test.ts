import { describe, expect, it } from "vitest";
import { validateContentFile } from "./upload-validation";

describe("content file validation", () => {
  it("accepts PDF and image files within their limits", () => {
    expect(
      validateContentFile(
        new File(["pdf"], "notes.pdf", { type: "application/pdf" }),
      ),
    ).toMatchObject({ success: true, file: { kind: "pdf" } });
    expect(
      validateContentFile(
        new File(["png"], "photo.png", { type: "image/png" }),
      ),
    ).toMatchObject({ success: true, file: { kind: "image" } });
  });

  it("rejects unsupported and empty files", () => {
    expect(
      validateContentFile(
        new File([], "empty.pdf", { type: "application/pdf" }),
      ),
    ).toMatchObject({ success: false, status: 400 });
    expect(
      validateContentFile(new File(["x"], "sheet.csv", { type: "text/csv" })),
    ).toMatchObject({ success: false, status: 400 });
  });

  it("can restrict a record to images", () => {
    const pdf = new File(["pdf"], "notes.pdf", { type: "application/pdf" });
    expect(validateContentFile(pdf, { allowPdf: false })).toMatchObject({
      success: false,
      status: 400,
    });
  });
});
