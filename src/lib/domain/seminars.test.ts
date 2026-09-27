import { describe, expect, it } from "vitest";
import {
  seminarRequestInputSchema,
  seminarTimingOptions,
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
    formData.set("attachment", "");
    formData.set("speakerIds", "");

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

  it("reads the form's own wire names and de-duplicates presenters", () => {
    const formData = new FormData();
    formData.set("attachment", "https://example.com/a.pdf");
    formData.set("speakerIds", " m1, m2 ,m1,, ");

    const result = validateSeminarRequestForm(formData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failure.values).toMatchObject({
        attachmentUrl: "https://example.com/a.pdf",
        presenterIds: ["m1", "m2"],
      });
      expect(result.failure.issues.attachmentUrl).toBeUndefined();
      expect(result.failure.issues.presenterIds).toBeUndefined();
    }
  });
});

describe("seminarTimingOptions", () => {
  it("offers the term's teaching months and the open choice", () => {
    expect(seminarTimingOptions("26-2")).toContain("9월 초");
    expect(seminarTimingOptions("26-2")).not.toContain("3월 초");
    expect(seminarTimingOptions("26-2").at(-1)).toBe("협의 후 결정");
  });

  // Editing a request after the term moved on: the stored timing was not
  // among the options, the select posted "", and saving cleared it
  // (audit LC15-1, confirmed).
  it("keeps a stored timing from another term as an option", () => {
    expect(seminarTimingOptions("27-1", "10월 중반")).toContain("10월 중반");
    expect(seminarTimingOptions("27-1", "")).not.toContain("");
    expect(
      seminarTimingOptions("27-1", "3월 초").filter((o) => o === "3월 초"),
    ).toHaveLength(1);
  });

  it("does not add a stored value outside the closed set", () => {
    expect(seminarTimingOptions("27-1", "아무 말")).not.toContain("아무 말");
  });
});
