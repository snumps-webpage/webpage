import { describe, expect, it } from "vitest";
import { verdict } from "../../../scripts/ops/lib-check-deployed.mjs";

/**
 * scripts/ops/check-deployed.mjs gathers the facts (the live /api/version, the
 * reference commit, git ancestry) and this decides. Exit codes: 0 up to date,
 * 1 not the reference, 2 cannot tell.
 */

const REF = {
  name: "origin/main",
  sha: "r".repeat(40),
  appKey: "k".repeat(40),
};
const OLD = "o".repeat(40);
const OLD_KEY = "q".repeat(40);

const facts = (over = {}) => ({
  deployed: { sha: OLD, appKey: OLD_KEY, builtAt: null },
  ref: REF,
  known: true,
  deployedKeyOfSha: OLD_KEY,
  deployedIsAncestor: true,
  refIsAncestor: false,
  ...over,
});

describe("verdict", () => {
  it("is up to date when the live build is the reference commit", () => {
    const v = verdict(
      facts({
        deployed: { sha: REF.sha, appKey: REF.appKey, builtAt: null },
        deployedKeyOfSha: REF.appKey,
      }),
    );
    expect(v).toMatchObject({ code: 0, state: "latest" });
  });

  it("is up to date when only docs or scripts changed since (same app key)", () => {
    const v = verdict(
      facts({
        deployed: { sha: OLD, appKey: REF.appKey, builtAt: null },
        deployedKeyOfSha: REF.appKey,
      }),
    );
    expect(v).toMatchObject({ code: 0, state: "same-app" });
  });

  it("is behind when the live commit is an ancestor with different app content", () => {
    expect(verdict(facts())).toMatchObject({ code: 1, state: "behind" });
  });

  it("says so when the live build is ahead of the reference", () => {
    const v = verdict(
      facts({ deployedIsAncestor: false, refIsAncestor: true }),
    );
    expect(v).toMatchObject({ code: 1, state: "ahead" });
  });

  it("says so when the live build and the reference have diverged", () => {
    const v = verdict(
      facts({ deployedIsAncestor: false, refIsAncestor: false }),
    );
    expect(v).toMatchObject({ code: 1, state: "diverged" });
  });

  it("cannot tell when the live build carries no stamp", () => {
    for (const deployed of [null, { sha: null, appKey: null, builtAt: null }]) {
      expect(verdict(facts({ deployed }))).toMatchObject({
        code: 2,
        state: "no-stamp",
      });
    }
  });

  it("cannot tell when the live commit is not in this clone", () => {
    const v = verdict(facts({ known: false, deployedKeyOfSha: null }));
    expect(v).toMatchObject({ code: 2, state: "unknown-commit" });
  });

  it("flags a build whose content is not its commit's (built from a dirty tree)", () => {
    const v = verdict(facts({ deployedKeyOfSha: "z".repeat(40) }));
    expect(v).toMatchObject({ code: 2, state: "content-mismatch" });
  });
});
