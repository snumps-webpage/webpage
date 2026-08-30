import type {
  PublicArchiveSnapshot,
  PublicFileReference,
} from "$lib/domain/public-content";
import { assetUrl } from "$lib/server/public/archive";
import { getTable } from "$lib/server/data/tables";
import { termRange } from "$lib/server/core/semester";
import type { LayoutServerLoad } from "./$types";

/**
 * Archive shell: one real snapshot for every /archive child page.
 * Built from the same tables the PUB-09~13 public reads use — only D2-safe
 * fields (titles, terms, names, public files) ever enter the snapshot; no
 * attendee/applicant lists, no member ids, no operational state.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif"]);

function fileReference(s3Key: string): PublicFileReference {
  const name = decodeURIComponent(s3Key.split("/").pop() ?? s3Key);
  const extension = name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
  const kind =
    extension === "pdf" ? ("pdf" as const)
    : IMAGE_EXTENSIONS.has(extension) ? ("image" as const)
    : ("link" as const);
  return { id: s3Key, name, url: assetUrl(s3Key), kind };
}

/** "YYYY-MM-DD" from a stored KST-offset instant. */
function dateOnly(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 10) : null;
}

/** KST first day of a term — coarse but real fallback for undated photos. */
function termStartDate(term: string): string {
  try {
    return new Date(termRange(term).start.getTime() + KST_OFFSET_MS)
      .toISOString()
      .slice(0, 10);
  } catch {
    return "1970-01-01";
  }
}

export const load: LayoutServerLoad = async () => {
  const [seminars, studies, dinners, activities, members, seminarRequests] =
    await Promise.all([
      getTable("seminars"),
      getTable("studies"),
      getTable("gallery-dinner"),
      getTable("activities"),
      getTable("members"),
      getTable("seminar-requests"),
    ]);

  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const activityStart = new Map(activities.map((a) => [a.id, a.date.start]));
  const requestOf = new Map(seminarRequests.map((r) => [r.id, r]));

  const archive: PublicArchiveSnapshot = {
    seminars: [...seminars]
      .sort((a, b) => b.semester.localeCompare(a.semester))
      .map((s) => {
        const request = s.sourceRequestId ? requestOf.get(s.sourceRequestId) : undefined;
        return {
          id: s.id,
          title: s.title,
          term: s.semester,
          description: s.note,
          prerequisites: request?.prerequisites ?? "",
          durationMinutes: null,
          presenterNames: [
            ...s.presenterIds.map((id) => nameOf.get(id) ?? "Unknown"),
            ...(s.externalPresenters ? [s.externalPresenters] : []),
          ],
          scheduledAt: (s.activityId && activityStart.get(s.activityId)) || null,
          location: null,
          files: s.materials.map(fileReference),
        };
      }),
    studies: [...studies]
      .sort((a, b) => b.semester.localeCompare(a.semester))
      .map((s) => ({
        id: s.id,
        title: s.title,
        term: s.semester,
        description: s.description,
        material: s.textbook || null,
        organizerNames: s.organizerIds.map((id) => nameOf.get(id) ?? "Unknown"),
        files: [],
      })),
    activities: [...activities]
      .sort((a, b) => b.date.start.localeCompare(a.date.start))
      .map((a) => ({ id: a.id, title: a.title, type: a.type, date: a.date.start })),
    gallery: [
      ...seminars.flatMap((s) =>
        s.photos.map((key, index) => ({
          id: `seminar-${s.id}-${index}`,
          title: s.title,
          category: "seminar" as const,
          date:
            dateOnly(s.activityId ? activityStart.get(s.activityId) : null) ??
            termStartDate(s.semester),
          thumbnailUrl: assetUrl(key),
          displayUrl: assetUrl(key),
          alt: `${s.title} 활동 사진`,
        })),
      ),
      ...studies.flatMap((s) =>
        s.photos.map((key, index) => ({
          id: `study-${s.id}-${index}`,
          title: s.title,
          category: "study" as const,
          date: dateOnly(s.schedule[0]?.date) ?? termStartDate(s.semester),
          thumbnailUrl: assetUrl(key),
          displayUrl: assetUrl(key),
          alt: `${s.title} 활동 사진`,
        })),
      ),
      ...dinners.flatMap((g) =>
        g.photos.map((key, index) => ({
          id: `dinner-${g.id}-${index}`,
          title: g.year,
          category: "dinner" as const,
          date:
            dateOnly(g.activityId ? activityStart.get(g.activityId) : null) ??
            (/^\d{4}$/.test(g.year) ? `${g.year}-01-01` : "1970-01-01"),
          thumbnailUrl: assetUrl(key),
          displayUrl: assetUrl(key),
          alt: `${g.year} 회식 사진`,
        })),
      ),
    ],
    projects: members
      .filter((m) => m.status !== "withdrawn" && m.project !== null)
      .map((m, index) => ({
        // Opaque list key — member row ids stay out of public payloads (D2).
        memberId: `project-${index}`,
        memberName: m.name,
        department: m.department,
        title: m.project!.title,
        url: m.project!.url ?? null,
      })),
  };

  return {
    archive,
    dataAvailable: true,
    generatedAt: new Date().toISOString(),
  };
};
