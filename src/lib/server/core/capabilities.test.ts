import { describe, expect, it } from "vitest";
import { CAPABILITIES, capabilitiesFor } from "./capabilities";

/**
 * Capabilities ignored the withdrawal status, trusting "the guard blocks
 * withdrawn members" — which the api zone does not do (audit LA02-1 =
 * LB05-1, confirmed):
 * - a registered member in the withdrawal grace period kept PARTICIPATE, so
 *   the presign API accepted their uploads;
 * - a withdrawing non-alumnus lost MANAGE_SELF when the term rolled over, so
 *   the self-cancellation the spec says "never expires" answered 403.
 */

const { VIEW_MEMBER_ZONE, PARTICIPATE, MANAGE_SELF } = CAPABILITIES;

describe("capabilitiesFor", () => {
  it("gives a withdrawing member only what cancelling needs, registered or not", () => {
    for (const registered of [true, false]) {
      for (const isAlumni of [true, false]) {
        expect(
          capabilitiesFor({ isAlumni, registered, withdrawn: true }),
        ).toEqual([MANAGE_SELF]);
      }
    }
  });

  it("keeps the S9 rules for everyone else", () => {
    expect(capabilitiesFor({ isAlumni: false, registered: true })).toEqual([
      VIEW_MEMBER_ZONE,
      PARTICIPATE,
      MANAGE_SELF,
    ]);
    expect(capabilitiesFor({ isAlumni: true, registered: false })).toEqual([
      VIEW_MEMBER_ZONE,
      MANAGE_SELF,
    ]);
    expect(capabilitiesFor({ isAlumni: false, registered: false })).toEqual([]);
  });
});
