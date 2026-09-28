import type {
  PublicExecutive,
  PublicExecutiveRoster,
} from "$lib/domain/members";

/** The public executives payload as `getPublicExecutives()` returns it. */
export interface PublicExecutiveTerm {
  term: string;
  holders: {
    term: string;
    title: string;
    name: string;
    contact: string | null;
  }[];
}

/**
 * Adapts the term-list payload to the roster the header/footer components
 * render. Only the newest term carries contacts: getPublicExecutives
 * (server/public/archive.ts) fills `contact` with the current president's
 * and vice-president's private-info phone unless they opted out
 * (hidePublicPhone — operator decision 2026-09-01), else null. That is the
 * one public contact source; members.publicContact is deprecated and read by
 * nobody (decision #19, audit LB16-3). The `·`/`@` split below still reads
 * a phone-only value correctly, so an email part is simply never present.
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
    // null, not "": the components link only what is there (audit LC08-1)
    const email = parts.find((p) => p.includes("@")) ?? null;
    const phone = parts.find((p) => !p.includes("@")) ?? null;
    return {
      id: `${latest.term}-${title}`,
      name: holder.name,
      title,
      phone,
      email,
    };
  };

  return {
    term: latest.term,
    president: pick("회장"),
    vicePresident: pick("부회장"),
  };
}
