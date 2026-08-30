import type { PublicExecutive, PublicExecutiveRoster } from "$lib/domain/members";

/** The public executives payload as `getPublicExecutives()` returns it. */
export interface PublicExecutiveTerm {
  term: string;
  holders: { term: string; title: string; name: string; contact: string | null }[];
}

/**
 * Adapts the term-list payload to the roster the header/footer components
 * render. Only the newest term carries contacts (D4 — publicContact is the
 * one sanctioned public field, exposed for the current term only), and the
 * stored value is a single string using the `"phone · email"` join convention.
 */
export function toExecutiveRoster(
  terms: PublicExecutiveTerm[] | null | undefined,
): PublicExecutiveRoster | null {
  const latest = terms?.[0];
  if (!latest) return null;

  const pick = (title: PublicExecutive["title"]): PublicExecutive | null => {
    const holder = latest.holders.find((h) => h.title === title);
    if (!holder) return null;
    const parts = (holder.contact ?? "")
      .split("·")
      .map((p) => p.trim())
      .filter(Boolean);
    const email = parts.find((p) => p.includes("@")) ?? "";
    const phone = parts.find((p) => !p.includes("@")) ?? "";
    return { id: `${latest.term}-${title}`, name: holder.name, title, phone, email };
  };

  return { term: latest.term, president: pick("회장"), vicePresident: pick("부회장") };
}
