import type { getTable } from "$lib/server/data/tables";

/**
 * Which records hold asset keys, and who may fetch each record's files — the
 * one list both the access check (asset-access.ts) and the delete guard
 * (asset-cleanup.ts) read (audit LB17-1). They were two hand-kept lists, and
 * a field missing from the cleanup copy looked unreferenced: its file, still
 * in use, was deleted. A record that gains a file field is one line here.
 */

export type OwnerAccess = "public" | "admin";

export interface AssetOwner {
  table: "seminars" | "seminar-requests" | "studies" | "gallery-dinner";
  /** Every asset key the record points at (empty strings dropped). */
  keys: string[];
  /** Who may fetch the record's files. */
  access: OwnerAccess;
}

type Reader = typeof getTable;

/**
 * Every record that points at assets. `read` is getTable for the access
 * check and getTableFresh for the delete guard, which must not decide on a
 * cache that is behind another instance's write (audit LB18-1).
 */
export async function listAssetOwners(read: Reader): Promise<AssetOwner[]> {
  const [seminars, requests, studies, dinners] = await Promise.all([
    read("seminars"),
    read("seminar-requests"),
    read("studies"),
    read("gallery-dinner"),
  ]);
  const present = (keys: string[]) => keys.filter((k) => !!k);
  return [
    // A seminar's files share its fate: public only once it is published.
    ...seminars.map((s): AssetOwner => ({
      table: "seminars",
      keys: present([s.posterKey, ...s.materials, ...s.photos]),
      access: s.publicationStatus === "published" ? "public" : "admin",
    })),
    // A request's poster is drawn only on the admin review screen.
    ...requests.map((r): AssetOwner => ({
      table: "seminar-requests",
      keys: present([r.posterKey]),
      access: "admin",
    })),
    ...studies.map((s): AssetOwner => ({
      table: "studies",
      keys: present(s.photos),
      access: "public",
    })),
    ...dinners.map((g): AssetOwner => ({
      table: "gallery-dinner",
      keys: present(g.photos),
      access: "public",
    })),
  ];
}
