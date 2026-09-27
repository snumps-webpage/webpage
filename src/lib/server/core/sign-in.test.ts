import { describe, expect, it } from "vitest";
import { signInVerdict } from "./sign-in";

/**
 * The email suffix alone is not proof of an SNU account: Google also says
 * whether the address is verified and which Workspace domain (`hd`) issued it.
 */
describe("signInVerdict", () => {
  const snu = { email_verified: true, hd: "snu.ac.kr" };

  it("admits a verified address from the SNU Workspace", () => {
    expect(signInVerdict("a@snu.ac.kr", snu)).toBe("allow");
  });

  it("refuses another domain", () => {
    expect(signInVerdict("a@gmail.com", { ...snu, hd: undefined })).toBe(
      "invalid-domain",
    );
  });

  it("refuses an unverified address even with the SNU suffix", () => {
    expect(
      signInVerdict("a@snu.ac.kr", { ...snu, email_verified: false }),
    ).toBe("invalid-domain");
  });

  it("refuses an SNU-suffixed address not issued by the SNU Workspace", () => {
    expect(signInVerdict("a@snu.ac.kr", { ...snu, hd: "example.com" })).toBe(
      "invalid-domain",
    );
    expect(signInVerdict("a@snu.ac.kr", { email_verified: true })).toBe(
      "invalid-domain",
    );
  });

  it("refuses a missing email or profile", () => {
    expect(signInVerdict(null, snu)).toBe("deny");
    expect(signInVerdict("a@snu.ac.kr", undefined)).toBe("invalid-domain");
  });

  it("compares case-insensitively", () => {
    expect(signInVerdict("A@SNU.AC.KR", { ...snu, hd: "SNU.ac.kr" })).toBe(
      "allow",
    );
  });
});
