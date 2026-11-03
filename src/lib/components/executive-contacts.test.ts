// @vitest-environment node
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import ExecutiveContacts from "./ExecutiveContacts.svelte";

for (const variant of ["cover", "footer"] as const) {
  describe(`executive contacts ${variant}`, () => {
    it("does not claim a vacancy or missing contact after a failed lookup", () => {
      const { body } = render(ExecutiveContacts, {
        props: { roster: null, variant, loaded: false },
      });
      expect(body).not.toContain("공석");
      expect(body).not.toContain("공개 연락처 미등록");
      expect(body).toContain("불러오지 못했습니다");
    });

    it("does not claim missing executives while the lookup is pending", () => {
      const { body } = render(ExecutiveContacts, {
        props: { roster: null, variant, loaded: false, pending: true },
      });
      expect(body).not.toContain("공석");
      expect(body).not.toContain("공개 연락처 미등록");
      expect(body).toContain("확인하고 있습니다");
    });

    it("shows a real vacancy only after a successful empty lookup", () => {
      const { body } = render(ExecutiveContacts, {
        props: { roster: null, variant, loaded: true },
      });
      expect(body.match(/공석/g)).toHaveLength(2);
      expect(body).not.toContain("불러오지 못했습니다");
    });

    it("keeps a known executive visible when no contact is public", () => {
      const { body } = render(ExecutiveContacts, {
        props: {
          roster: {
            term: "26-2",
            president: {
              id: "chair",
              title: "회장",
              name: "등록된 회장",
              phone: null,
              email: null,
            },
            vicePresident: null,
          },
          variant,
          loaded: true,
        },
      });
      expect(body).toContain("등록된 회장");
      expect(body.match(/공석/g)).toHaveLength(1);
      expect(body).not.toContain('href="tel:');
    });
  });
}
