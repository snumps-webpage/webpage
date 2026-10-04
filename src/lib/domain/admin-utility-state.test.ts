import { describe, expect, it } from "vitest";
import {
  executiveActionUrl,
  executiveNotice,
  utilityFailureMessage,
} from "./admin-utility-state";
describe("existing admin utility feedback", () => {
  it("keeps term/title GET context in native named POST", () => {
    const url = new URL(
      executiveActionUrl("assign", "27-1", "자료관리부장"),
      "https://fixture.invalid/admin/executives",
    );
    expect(url.searchParams.get("term")).toBe("27-1");
    expect(url.searchParams.get("title")).toBe("자료관리부장");
    expect(url.searchParams.get("/assign")).toBe("");
  });
  it("does not invent a title when nothing is selected", () => {
    const url = new URL(
      executiveActionUrl("addTitle", "26-2", ""),
      "https://fixture.invalid/admin/executives",
    );
    expect(url.searchParams.has("title")).toBe(false);
  });
  it("names the real term/title after successful assignment", () => {
    expect(
      executiveNotice({
        scope: "executive",
        success: true,
        operation: "assigned",
        targetKey: "회장",
        viewTerm: "27-1",
      })?.message,
    ).toContain("27-1 회장");
    expect(
      executiveNotice({ scope: "mail-template", success: true }),
    ).toBeNull();
  });
  it("uses the actual submitted target term when it differs from view context", () => {
    expect(
      executiveNotice({
        scope: "executive",
        success: true,
        operation: "assigned",
        targetKey: "회장",
        viewTerm: "27-1",
        targetTerm: "26-2",
      })?.message,
    ).toContain("26-2 회장");
  });
  it("describes option removal as preserving historical assignments", () => {
    expect(
      executiveNotice({
        scope: "executive",
        success: true,
        operation: "title-removed",
      })?.message,
    ).toContain("과거 배정 기록은 유지");
  });
  it("retains business details and reports unavailable result uncertainty", () => {
    expect(
      utilityFailureMessage({ error: "CONFLICT", message: "중복 직위입니다." }),
    ).toBe("중복 직위입니다.");
    expect(utilityFailureMessage({ error: "SERVICE_UNAVAILABLE" })).toContain(
      "상태가 바뀌었을 수",
    );
  });
});
