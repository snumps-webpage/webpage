import { env } from "$env/dynamic/private";
import { getTable } from "$lib/server/data/tables";
import { currentTerm } from "$lib/server/core/semester";

/**
 * Public-zone reads (API-SPEC §3 / BE-60·61). EVERYTHING here is guest-facing:
 * only the D2 public fields ever leave these functions — no private-info
 * fields, no isAdmin, no operational lists, no withdrawn members on the
 * roster. The BE-64 snapshot suite enforces that contract.
 */

export function assetUrl(s3Key: string): string {
  const cdn = env.ASSETS_CDN_URL;
  return cdn ? `${cdn.replace(/\/$/, "")}/${s3Key}` : `/assets-unavailable/${s3Key}`;
}

async function memberNameMap(): Promise<Map<string, string>> {
  const members = await getTable("members");
  return new Map(members.map((m) => [m.id, m.name]));
}

/** PUB-15: the public roster — D2 fields, withdrawn members excluded. */
export async function getPublicMembers() {
  const members = await getTable("members");
  return members
    .filter((m) => m.status !== "withdrawn")
    .map((m) => ({
      name: m.name,
      department: m.department,
      joinedAt: m.joinedAt,
      roles: m.roles,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/** PUB-01/05: executives derived from roles + the consented public contact (D4). */
export async function getPublicExecutives() {
  const term = currentTerm();
  const members = await getTable("members");
  const byTerm = new Map<string, { term: string; title: string; name: string; contact: string | null }[]>();
  for (const m of members) {
    for (const r of m.roles) {
      const list = byTerm.get(r.term) ?? [];
      list.push({
        term: r.term,
        title: r.title,
        name: m.name,
        // publicContact is the ONE sanctioned public contact field (§3).
        contact: r.term === term ? m.publicContact : null,
      });
      byTerm.set(r.term, list);
    }
  }
  return [...byTerm.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([t, holders]) => ({ term: t, holders }));
}

/** PUB-09: seminar archive grouped by term, files resolved to CDN URLs. */
export async function getPublicSeminars() {
  const [seminars, names] = await Promise.all([getTable("seminars"), memberNameMap()]);
  return [...seminars]
    .sort((a, b) => b.semester.localeCompare(a.semester))
    .map((s) => ({
      id: s.id,
      title: s.title,
      semester: s.semester,
      note: s.note,
      presenters: s.presenterIds.map((id) => names.get(id) ?? "Unknown"),
      externalPresenters: s.externalPresenters,
      materialCount: s.materials.length,
      photoCount: s.photos.length,
    }));
}

export async function getPublicSeminar(id: string) {
  const [seminars, names] = await Promise.all([getTable("seminars"), memberNameMap()]);
  const s = seminars.find((row) => row.id === id);
  if (!s) return null;
  return {
    id: s.id,
    title: s.title,
    semester: s.semester,
    note: s.note,
    presenters: s.presenterIds.map((pid) => names.get(pid) ?? "Unknown"),
    externalPresenters: s.externalPresenters,
    materials: s.materials.map(assetUrl),
    photos: s.photos.map(assetUrl),
  };
}

/** PUB-10: study archive — operational fields (pending lists, transfers) never leave. */
export async function getPublicStudies() {
  const [studies, names] = await Promise.all([getTable("studies"), memberNameMap()]);
  return [...studies]
    .sort((a, b) => b.semester.localeCompare(a.semester))
    .map((s) => ({
      id: s.id,
      title: s.title,
      semester: s.semester,
      textbook: s.textbook,
      description: s.description,
      note: s.note,
      status: s.status,
      organizers: s.organizerIds.map((id) => names.get(id) ?? "Unknown"),
      participantCount: s.participantIds.length,
      photos: s.photos.map(assetUrl),
    }));
}

/** PUB-11: the public calendar — schedule only, NEVER attendee lists. */
export async function getPublicActivities() {
  const activities = await getTable("activities");
  return [...activities]
    .sort((a, b) => b.date.start.localeCompare(a.date.start))
    .map((a) => ({
      title: a.title,
      date: a.date,
      type: a.type,
    }));
}

/** PUB-12: one photo grid across the three photo-bearing tables. */
export async function getPublicGallery() {
  const [seminars, studies, dinners] = await Promise.all([
    getTable("seminars"),
    getTable("studies"),
    getTable("gallery-dinner"),
  ]);
  return [
    ...seminars.flatMap((s) =>
      s.photos.map((key) => ({ kind: "세미나" as const, title: s.title, url: assetUrl(key) })),
    ),
    ...studies.flatMap((s) =>
      s.photos.map((key) => ({ kind: "스터디" as const, title: s.title, url: assetUrl(key) })),
    ),
    ...dinners.flatMap((g) =>
      g.photos.map((key) => ({ kind: "회식" as const, title: g.year, url: assetUrl(key) })),
    ),
  ];
}

/** PUB-13: project board — name/department plus the project content only. */
export async function getPublicProjects() {
  const members = await getTable("members");
  return members
    .filter((m) => m.status !== "withdrawn" && m.project !== null)
    .map((m) => ({
      name: m.name,
      department: m.department,
      project: m.project!,
    }));
}
