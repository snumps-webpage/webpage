import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const archive = vi.hoisted(() => ({ getPublicExecutives: vi.fn() }));
vi.mock("$lib/server/public/archive", () => archive);
vi.mock("$lib/server/core/semester", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/server/core/semester")>()),
  currentTerm: () => "26-2",
}));

import { load } from "./+page.server";

beforeEach(() => {
  archive.getPublicExecutives.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("public executive history current-term context", () => {
  it.each(["25-2", "27-1", "26-2"])(
    "returns actual currentTerm even when newest history is %s",
    async (term) => {
      const terms = [
        {
          term,
          holders: [
            {
              term,
              title: "회장",
              name: "회원",
              contact: term === "26-2" ? "010-1111-2222" : null,
            },
          ],
        },
      ];
      archive.getPublicExecutives.mockResolvedValue(terms);
      const data = await load({} as never);
      expect(data).toEqual({ terms, dataAvailable: true, currentTerm: "26-2" });
      expect((data as { terms: unknown[] }).terms).toBe(terms);
      expect(archive.getPublicExecutives).toHaveBeenCalledOnce();
    },
  );

  it("returns currentTerm when history is empty", async () => {
    archive.getPublicExecutives.mockResolvedValue([]);
    expect(await load({} as never)).toEqual({
      terms: [],
      dataAvailable: true,
      currentTerm: "26-2",
    });
  });

  it("keeps unavailable fallback and currentTerm without exposing internal failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    archive.getPublicExecutives.mockRejectedValue(
      new Error("private storage failure"),
    );
    expect(await load({} as never)).toEqual({
      terms: [],
      dataAvailable: false,
      currentTerm: "26-2",
    });
  });
});
