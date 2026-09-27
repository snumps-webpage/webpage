import { describe, expect, it } from "vitest";
import { toExecutiveRoster } from "./executive-roster";

// A missing contact became "" and the header and footer drew it as an empty
// `tel:` / `mailto:` link — a nameless link for screen readers, on every page
// (audit LC08-1). "Not public" is now null, and nothing is linked.
describe("toExecutiveRoster contacts", () => {
  const roster = (contact: string | null) =>
    toExecutiveRoster([
      {
        term: "26-2",
        holders: [{ term: "26-2", title: "회장", name: "김회장", contact }],
      },
    ]);

  it("keeps a phone and an email apart", () => {
    expect(roster("010-1234-5678 · a@snu.ac.kr")?.president).toMatchObject({
      phone: "010-1234-5678",
      email: "a@snu.ac.kr",
    });
  });

  it("answers null for a contact that is not public", () => {
    expect(roster(null)?.president).toMatchObject({
      phone: null,
      email: null,
    });
    expect(roster("010-1234-5678")?.president).toMatchObject({
      phone: "010-1234-5678",
      email: null,
    });
  });
});
