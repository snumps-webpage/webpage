import { describe, it, expect } from "vitest";
import { getPropertyValue } from "./utils";

describe("Notion Utils - getPropertyValue", () => {
  it("should parse title properties", () => {
    const prop = {
      type: "title",
      title: [{ plain_text: "Hello" }, { plain_text: " World" }],
    };
    expect(getPropertyValue(prop)).toBe("Hello World");
  });

  it("should parse rich_text properties", () => {
    const prop = {
      type: "rich_text",
      rich_text: [{ plain_text: "Some " }, { plain_text: "text" }],
    };
    expect(getPropertyValue(prop)).toBe("Some text");
  });

  it("should parse number properties", () => {
    const prop = { type: "number", number: 42 };
    expect(getPropertyValue(prop)).toBe(42);
    expect(getPropertyValue({ type: "number", number: 0 })).toBe(0);
    expect(getPropertyValue({ type: "number", number: null })).toBe(0);
  });

  it("should parse select properties", () => {
    const prop = { type: "select", select: { name: "Option 1" } };
    expect(getPropertyValue(prop)).toBe("Option 1");
    expect(getPropertyValue({ type: "select", select: null })).toBe("");
  });

  it("should parse multi_select properties", () => {
    const prop = {
      type: "multi_select",
      multi_select: [{ name: "A" }, { name: "B" }],
    };
    expect(getPropertyValue(prop)).toBe("A, B");
  });

  it("should parse date properties", () => {
    const prop = { type: "date", date: { start: "2024-01-01" } };
    expect(getPropertyValue(prop)).toBe("2024-01-01");
    expect(getPropertyValue({ type: "date", date: null })).toBe("");
  });

  it("should parse checkbox properties", () => {
    expect(getPropertyValue({ type: "checkbox", checkbox: true })).toBe(true);
    expect(getPropertyValue({ type: "checkbox", checkbox: false })).toBe(false);
  });

  it("should return empty string for unknown or null properties", () => {
    expect(getPropertyValue(null)).toBe("");
    expect(getPropertyValue({ type: "unknown" })).toBe("");
  });
});
