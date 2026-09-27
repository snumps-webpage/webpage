import { compareSemesters } from "./semester-order";
import { externalHref } from "./links";
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
  /** null when the record carries no derivable date — never a stand-in date. */
  date: string | null;
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
  const label = { "1": "1학기", "2": "2학기", S: "여름학기", W: "겨울학기" }[
    match[2]
  ];
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
  /**
   * **하나의 키로** 정렬한다: 학기가 먼저, 같은 학기 안에서 날짜가 그다음.
   *
   * 예전에는 "둘 다 날짜가 있으면 날짜로, 아니면 학기로" 비교했는데, 그렇게 키를
   * 섞으면 순서가 전이적이지 않다 — 날짜 없는 항목 하나만 끼어도 같은 목록이 입력
   * 순서에 따라 다르게 정렬된다(그때 `Array.sort`의 결과는 엔진이 정한다).
   */
  return [...seminars]
    .sort((a, b) => {
      const byTerm = compareSemesters(b.term, a.term);
      if (byTerm !== 0) return byTerm;
      return (b.scheduledAt ?? "").localeCompare(a.scheduledAt ?? "", "ko-KR");
    })
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
    .sort((a, b) => compareSemesters(b.term, a.term))
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
      href: externalHref(project.url) ?? undefined,
    }));
}
