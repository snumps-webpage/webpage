import type {
  PublicArchiveSnapshot,
  PublicFileReference,
} from "$lib/domain/public-content";
import { thumbUrl } from "$lib/image";
import { assetUrl } from "$lib/server/public/archive";
import { getTable } from "$lib/server/data/tables";
import {
  getDirectoryIndex,
  getMemberDirectory,
} from "$lib/server/data/directory";
import {
  compareSemesters,
  termStartDateOrNull,
} from "$lib/server/core/semester";
import type { LayoutServerLoad } from "./$types";

/**
 * Archive shell: one real snapshot for every /archive child page.
 * Built from the same tables the PUB-09~13 public reads use — only D2-safe
 * fields (titles, terms, names, public files) ever enter the snapshot; no
 * attendee/applicant lists, no member ids, no operational state.
 */

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif"]);

function fileReference(s3Key: string): PublicFileReference {
  const name = decodeURIComponent(s3Key.split("/").pop() ?? s3Key);
  const extension = name.includes(".")
    ? (name.split(".").pop() ?? "").toLowerCase()
    : "";
  const kind =
    extension === "pdf"
      ? ("pdf" as const)
      : IMAGE_EXTENSIONS.has(extension)
        ? ("image" as const)
        : ("link" as const);
  return { id: s3Key, name, url: assetUrl(s3Key), kind };
}

/** "YYYY-MM-DD" from a stored KST-offset instant. */
function dateOnly(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 10) : null;
}

/** `dataAvailable: false`가 실려 나갈 때의 페이로드 — 소비자의 else 분기가 이걸 받는다. */
const EMPTY_ARCHIVE: PublicArchiveSnapshot = {
  seminars: [],
  studies: [],
  activities: [],
  gallery: [],
  projects: [],
};

export const load: LayoutServerLoad = async () => {
  // S9: 아카이브는 과거 기록의 legacy id를 이름으로 풀어야 한다 — 이름
  // 해석은 디렉터리 인덱스, 명단(프로젝트)은 병합 디렉터리를 쓴다.
  //
  // 읽기 실패를 여기서 잡는 이유: 이 레이아웃 아래에는 스냅샷을 화면에 쓰지 않는
  // 공지 페이지들(/archive/problems 등)이 있다. 던지면 그 페이지들까지 500이 된다.
  // `dataAvailable`은 원래 이 실패를 표현하려고 있던 필드인데 생산자가 없어
  // 소비자 다섯 곳의 else 분기가 죽은 코드였다 (ZR-1).
  let tables;
  try {
    tables = await Promise.all([
      getTable("seminars"),
      getTable("studies"),
      getTable("gallery-dinner"),
      getTable("activities"),
      getMemberDirectory(),
      getDirectoryIndex(),
      getTable("seminar-requests"),
    ]);
  } catch (e) {
    console.error("[archive] snapshot unavailable:", e);
    return {
      archive: EMPTY_ARCHIVE,
      dataAvailable: false,
      generatedAt: new Date().toISOString(),
    };
  }
  const [
    seminars,
    studies,
    dinners,
    activities,
    members,
    directoryIndex,
    seminarRequests,
  ] = tables;

  const nameOf = new Map([...directoryIndex].map(([id, m]) => [id, m.name]));
  const activityStart = new Map(activities.map((a) => [a.id, a.date.start]));
  const requestOf = new Map(seminarRequests.map((r) => [r.id, r]));

  // 공개는 명시적 행위다. 이 로드는 공개 접근자(public/archive.ts)를 쓰지 않고
  // 표를 직접 읽어 스냅샷을 만드므로, 필터도 **여기서** 걸어야 한다 — 접근자에만
  // 걸면 아무도 안 보는 페이로드를 지키게 된다(ZR-8의 재발 형태).
  const publicSeminars = seminars.filter(
    (s) => s.publicationStatus === "published",
  );
  const hiddenActivityIds = new Set(
    seminars
      .filter((s) => s.publicationStatus !== "published" && s.activityId)
      .map((s) => s.activityId!),
  );
  const publicActivities = activities.filter(
    (a) => !hiddenActivityIds.has(a.id),
  );

  const archive: PublicArchiveSnapshot = {
    seminars: [...publicSeminars]
      .sort((a, b) => compareSemesters(b.semester, a.semester))
      .map((s) => {
        const request = s.sourceRequestId
          ? requestOf.get(s.sourceRequestId)
          : undefined;
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
          scheduledAt:
            (s.activityId && activityStart.get(s.activityId)) || null,
          location: null,
          files: s.materials.map(fileReference),
        };
      }),
    studies: [...studies]
      .sort((a, b) => compareSemesters(b.semester, a.semester))
      .map((s) => ({
        id: s.id,
        title: s.title,
        term: s.semester,
        description: s.description,
        material: s.textbook || null,
        organizerNames: s.organizerIds.map((id) => nameOf.get(id) ?? "Unknown"),
        files: [],
      })),
    activities: [...publicActivities]
      .sort((a, b) => b.date.start.localeCompare(a.date.start))
      .map((a) => ({
        id: a.id,
        title: a.title,
        type: a.type,
        date: a.date.start,
      })),
    gallery: [
      ...publicSeminars.flatMap((s) =>
        s.photos.map((key, index) => ({
          id: `seminar-${s.id}-${index}`,
          title: s.title,
          category: "seminar" as const,
          date:
            dateOnly(s.activityId ? activityStart.get(s.activityId) : null) ??
            termStartDateOrNull(s.semester),
          thumbnailUrl: thumbUrl(assetUrl(key), 640),
          displayUrl: assetUrl(key),
          alt: `${s.title} 활동 사진`,
        })),
      ),
      ...studies.flatMap((s) =>
        s.photos.map((key, index) => ({
          id: `study-${s.id}-${index}`,
          title: s.title,
          category: "study" as const,
          date:
            dateOnly(s.schedule[0]?.date) ?? termStartDateOrNull(s.semester),
          thumbnailUrl: thumbUrl(assetUrl(key), 640),
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
            (/^\d{4}$/.test(g.year) ? `${g.year}-01-01` : null),
          thumbnailUrl: thumbUrl(assetUrl(key), 640),
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
