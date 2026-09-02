import type { ActivityType } from "$lib/constants";

export interface PublicFileReference {
  id: string;
  name: string;
  url: string;
  kind: "pdf" | "slides" | "image" | "link";
}

export interface PublicSeminarRecord {
  id: string;
  title: string;
  term: string;
  description: string;
  prerequisites: string;
  durationMinutes: number | null;
  presenterNames: string[];
  scheduledAt: string | null;
  location: string | null;
  files: PublicFileReference[];
}

export interface PublicStudyRecord {
  id: string;
  title: string;
  term: string;
  description: string;
  material: string | null;
  organizerNames: string[];
  files: PublicFileReference[];
}

export interface PublicActivityRecord {
  id: string;
  title: string;
  type: ActivityType;
  date: string;
}

export interface PublicGalleryRecord {
  id: string;
  title: string;
  category: "seminar" | "study" | "dinner";
  date: string;
  thumbnailUrl: string | null;
  displayUrl: string | null;
  alt: string;
}

export interface PublicProjectRecord {
  memberId: string;
  memberName: string;
  department: string;
  title: string;
  url: string | null;
}

export interface PublicArchiveSnapshot {
  seminars: PublicSeminarRecord[];
  studies: PublicStudyRecord[];
  activities: PublicActivityRecord[];
  gallery: PublicGalleryRecord[];
  projects: PublicProjectRecord[];
}

export interface PublicIndexItem {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  metadata: string[];
  href?: string;
}

export function formatArchiveTerm(term: string) {
  const match = /^(\d{2})-([12SW])$/.exec(term);
  if (!match) return term;
  const label = { "1": "1학기", "2": "2학기", S: "여름학기", W: "겨울학기" }[match[2]];
  return `20${match[1]}년 ${label}`;
}

export function filterPublicIndex(items: PublicIndexItem[], query: string) {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  if (!normalized) return items;
  return items.filter((item) =>
    [item.title, item.eyebrow, item.description, ...item.metadata].some(
      (value) => value.toLocaleLowerCase("ko-KR").includes(normalized),
    ),
  );
}

export function seminarIndexItems(
  seminars: PublicSeminarRecord[],
): PublicIndexItem[] {
  return [...seminars]
    .sort((a, b) =>
      (b.scheduledAt ?? b.term).localeCompare(a.scheduledAt ?? a.term, "ko-KR"),
    )
    .map((seminar) => ({
      id: seminar.id,
      title: seminar.title,
      eyebrow: formatArchiveTerm(seminar.term),
      description: seminar.description,
      metadata: [
        seminar.presenterNames.join(", "),
        seminar.prerequisites,
        seminar.location ?? "장소 기록 없음",
      ],
      href: `/archive/seminars/${encodeURIComponent(seminar.id)}`,
    }));
}

export function studyIndexItems(
  studies: PublicStudyRecord[],
): PublicIndexItem[] {
  return [...studies]
    .sort((a, b) => b.term.localeCompare(a.term, "ko-KR"))
    .map((study) => ({
      id: study.id,
      title: study.title,
      eyebrow: formatArchiveTerm(study.term),
      description: study.description,
      metadata: [
        study.organizerNames.join(", "),
        study.material ?? "교재 기록 없음",
      ],
    }));
}

export function projectIndexItems(
  projects: PublicProjectRecord[],
): PublicIndexItem[] {
  return [...projects]
    .sort((a, b) => a.memberName.localeCompare(b.memberName, "ko-KR"))
    .map((project) => ({
      id: project.memberId,
      title: project.title,
      eyebrow: project.memberName,
      description: project.department,
      metadata: [],
      href: project.url ?? undefined,
    }));
}
