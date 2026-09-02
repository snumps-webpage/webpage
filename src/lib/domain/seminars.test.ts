import { describe, expect, it } from "vitest";
import {
  seminarRequestInputSchema,
  validateSeminarRequestForm,
} from "./seminars";

describe("seminarRequestInputSchema", () => {
  it("accepts the complete new seminar request contract", () => {
    const result = seminarRequestInputSchema.safeParse({
      kind: "regular",
      title: "대수위상 세미나",
      description: "기본군과 피복공간을 소개합니다.",
      prerequisites: "점집합 위상수학",
      duration: "90분",
      preferredTiming: "9월 중반",
      attachmentUrl: "https://drive.google.com/example",
      presenterIds: ["member-1"],
    });

    expect(result.success).toBe(true);
  });

  it("rejects non-HTTPS attachments", () => {
    const result = seminarRequestInputSchema.safeParse({
      kind: "irregular",
      title: "정수론 세미나",
      description: "설명",
      prerequisites: "",
      duration: "60분",
      preferredTiming: "",
      attachmentUrl: "http://example.com/notes.pdf",
      presenterIds: ["member-1"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["attachmentUrl"]);
    }
  });

  it("returns a validation issue instead of throwing for malformed URLs", () => {
    const input = {
      kind: "irregular" as const,
      title: "정수론 세미나",
      description: "설명",
      prerequisites: "",
      duration: "60분",
      preferredTiming: "",
      attachmentUrl: "not-a-url",
      presenterIds: ["member-1"],
    };

    expect(() => seminarRequestInputSchema.safeParse(input)).not.toThrow();

    const result = seminarRequestInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["attachmentUrl"]);
    }
  });
});

describe("validateSeminarRequestForm", () => {
  it("returns field-level errors and the submitted values", () => {
    const formData = new FormData();
    formData.set("kind", "");
    formData.set("title", "");
    formData.set("description", "");
    formData.set("duration", "");
    formData.set("attachmentUrl", "");
    formData.set("presenterIds", "[]");

    const result = validateSeminarRequestForm(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.issues).toMatchObject({
        kind: expect.any(String),
        title: expect.any(String),
        description: expect.any(String),
        duration: expect.any(String),
        presenterIds: expect.any(String),
      });
      expect(result.failure.values.title).toBe("");
    }
  });
});
