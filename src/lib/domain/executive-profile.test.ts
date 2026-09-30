import { describe, expect, it } from "vitest";
import {
  cohortFromStudentId,
  parseExecutiveProfileForm,
} from "./executive-profile";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const allHidden = {
  "department.source": "hidden",
  "cohort.source": "hidden",
  "email.source": "hidden",
  "bio.source": "hidden",
};

describe("parseExecutiveProfileForm", () => {
  it("reads each field's source and keeps a value only for custom", () => {
    const result = parseExecutiveProfileForm(
      form({
        "department.source": "member",
        "department.value": "무시됨",
        "cohort.source": "custom",
        "cohort.value": "18",
        "email.source": "hidden",
        "bio.source": "custom",
        "bio.value": "  대학원에서 정수론을 공부합니다.  ",
      }),
    );
    expect(result).toEqual({
      success: true,
      data: {
        department: { source: "member" },
        cohort: { source: "custom", value: "18" },
        email: { source: "hidden" },
        bio: { source: "custom", value: "대학원에서 정수론을 공부합니다." },
      },
    });
  });

  it("refuses an unknown source, and member for the bio (it has no source)", () => {
    const result = parseExecutiveProfileForm(
      form({ ...allHidden, "email.source": "public", "bio.source": "member" }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(Object.keys(result.failure.issues).sort()).toEqual(["bio", "email"]);
  });

  it("refuses an empty custom value — hiding is its own choice", () => {
    const result = parseExecutiveProfileForm(
      form({
        ...allHidden,
        "department.source": "custom",
        "department.value": "\u200B  ",
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.failure.issues.department).toBeTruthy();
  });

  it.each([
    ["cohort", "2018", false],
    ["cohort", "18", true],
    ["email", "not-an-email", false],
    ["email", "a@snu.ac.kr", true],
    ["department", "가".repeat(41), false],
    ["department", "가".repeat(40), true],
    ["bio", "가".repeat(201), false],
    ["bio", "가".repeat(200), true],
  ])("custom %s %j → valid %s", (field, value, ok) => {
    const result = parseExecutiveProfileForm(
      form({
        ...allHidden,
        [`${field}.source`]: "custom",
        [`${field}.value`]: value,
      }),
    );
    expect(result.success).toBe(ok);
  });

  it("strips invisible characters from custom values", () => {
    const result = parseExecutiveProfileForm(
      form({
        ...allHidden,
        "department.source": "custom",
        "department.value": "수리\u200B과학부",
      }),
    );
    expect(result.success && result.data.department).toEqual({
      source: "custom",
      value: "수리과학부",
    });
  });

  it("echoes the submitted values on failure so the form keeps them", () => {
    const result = parseExecutiveProfileForm(
      form({ ...allHidden, "email.source": "custom", "email.value": "x" }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.failure.values.email).toEqual({
      source: "custom",
      value: "x",
    });
  });
});

describe("cohortFromStudentId", () => {
  it.each([
    ["2018-12345", "18"],
    ["201812345", "18"],
    ["1999-10101", "99"],
    [" 2020-00000", "20"],
    ["18-123", null],
    ["", null],
    ["abcd", null],
  ])("%j → %j", (studentId, cohort) => {
    expect(cohortFromStudentId(studentId)).toBe(cohort);
  });
});
