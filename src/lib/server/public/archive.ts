import { env } from "$env/dynamic/private";
import { getMemberDirectory } from "$lib/server/data/directory";
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
  const members = await getMemberDirectory();
  return new Map(members.map((m) => [m.id, m.name]));
}

/** PUB-15: the public roster — D2 fields, withdrawn members excluded. */
export async function getPublicMembers() {
  const members = await getMemberDirectory();
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

/**
 * PUB-01/05: executives derived from roles. 공개 회장단은 회장·부회장 두 직책만,
 * 회장 먼저 노출한다 (부장 등은 관리자 화면에만). 한 학기 같은 직책 복수면 전원.
 *
 * 연락처: **현재 학기 회장·부회장의 개인정보 전화번호를 자동 공개**한다 (운영자
 * 결정, 2026-09-01). private-info는 원칙상 공개 로드에 나가지 않지만(§3), 현
 * 회장단의 전화번호는 이 예외로 노출한다 — 대상은 현재 학기 회장/부회장, 필드는
 * 전화번호로 한정. 과거 학기·다른 직책·다른 필드는 절대 노출하지 않는다.
 */
const PUBLIC_EXECUTIVE_ORDER = ["회장", "부회장"] as const;

export async function getPublicExecutives() {
  const term = currentTerm();
  const [members, infos, legacyInfos] = await Promise.all([
    getMemberDirectory(),
    getTable("private-info"),
    getTable("legacy-private-info"),
  ]);
  // memberId → phone (운영 우선, 없으면 legacy). 현 회장단 전화 조회 전용.
  // hidePublicPhone=true인 회원은 애초에 맵에 넣지 않는다 (거부 존중).
  const phoneByMemberId = new Map<string, string>();
  for (const i of legacyInfos) if (i.phone && !i.hidePublicPhone) phoneByMemberId.set(i.memberId, i.phone);
  for (const i of infos) {
    if (i.hidePublicPhone) phoneByMemberId.delete(i.memberId); // 운영 행이 legacy를 덮는다
    else if (i.phone) phoneByMemberId.set(i.memberId, i.phone);
  }

  const contactFor = (m: (typeof members)[number]): string | null => {
    const phone =
      phoneByMemberId.get(m.id) ??
      (m.legacyMemberId ? phoneByMemberId.get(m.legacyMemberId) : undefined);
    return phone || null;
  };

  const byTerm = new Map<string, { term: string; title: string; name: string; contact: string | null }[]>();
  for (const m of members) {
    for (const r of m.roles) {
      if (!(PUBLIC_EXECUTIVE_ORDER as readonly string[]).includes(r.title)) continue;
      const list = byTerm.get(r.term) ?? [];
      list.push({
        term: r.term,
        title: r.title,
        name: m.name,
        // 현재 학기 회장/부회장만 전화 자동 공개 — 그 외는 null
        contact: r.term === term ? contactFor(m) : null,
      });
      byTerm.set(r.term, list);
    }
  }
  const rank = (title: string) => PUBLIC_EXECUTIVE_ORDER.indexOf(title as "회장");
  return [...byTerm.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([t, holders]) => ({
      term: t,
      holders: holders.sort((x, y) => rank(x.title) - rank(y.title)),
    }));
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
  const members = await getMemberDirectory();
  return members
    .filter((m) => m.status !== "withdrawn" && m.project !== null)
    .map((m) => ({
      name: m.name,
      department: m.department,
      project: m.project!,
    }));
}
