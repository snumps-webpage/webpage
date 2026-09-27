import { describe, expect, it } from "vitest";
import {
  UPLOAD_PURPOSES,
  uploadAccept,
  uploadFileProblem,
  uploadLimitMb,
  uploadPurposeSchema,
} from "./uploads";
import { presignBodySchema } from "./api";

/** One purpose table for the route schema, the server and the editors (audit LB32-2). */
describe("upload purpose table", () => {
  it("the route schema accepts exactly the table's purposes", () => {
    expect([...uploadPurposeSchema.options].sort()).toEqual(
      Object.keys(UPLOAD_PURPOSES).sort(),
    );
    expect(
      presignBodySchema.safeParse({
        purpose: "seminar-poster",
        filename: "p.png",
        contentType: "image/png",
        size: 1,
      }).success,
    ).toBe(true);
    expect(
      presignBodySchema.safeParse({
        purpose: "study-material",
        filename: "p.pdf",
        contentType: "application/pdf",
        size: 1,
      }).success,
    ).toBe(false);
  });

  it("keeps the limits the server enforced", () => {
    expect(UPLOAD_PURPOSES["seminar-material"].maxBytes).toBe(50_000_000);
    expect(UPLOAD_PURPOSES["seminar-poster"].maxBytes).toBe(15_000_000);
    for (const p of ["seminar-photo", "study-photo", "gallery-photo"] as const)
      expect(UPLOAD_PURPOSES[p].maxBytes).toBe(10_000_000);
    expect(uploadLimitMb("seminar-poster")).toBe(15);
  });

  it("builds an accept list covering every given purpose, once each", () => {
    expect(uploadAccept("seminar-poster")).toBe("image/png,image/jpeg");
    expect(
      uploadAccept("seminar-material", "seminar-photo").split(","),
    ).toEqual(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
    expect(uploadAccept("study-photo", "gallery-photo")).toBe(
      "image/jpeg,image/png,image/webp",
    );
  });

  it("names why a file does not fit", () => {
    const png = (size: number) => ({ type: "image/png", size });
    expect(uploadFileProblem("seminar-poster", png(15_000_000))).toBeNull();
    expect(uploadFileProblem("seminar-poster", png(15_000_001))).toBe("size");
    expect(uploadFileProblem("seminar-poster", png(0))).toBe("empty");
    expect(
      uploadFileProblem("seminar-poster", { type: "image/webp", size: 1 }),
    ).toBe("type");
    expect(
      uploadFileProblem("seminar-material", { type: "image/png", size: 1 }),
    ).toBe("type");
  });
});
