import type { PublicArchiveSnapshot } from "$lib/domain/public-content";
import type { ActivityType } from "$lib/constants";

const snapshot: PublicArchiveSnapshot = {
  seminars: [
    {
      id: "seminar-published-1",
      title: "그래프 스펙트럼 입문",
      term: "26-2",
      description: "라플라시안 행렬의 고유치와 그래프의 구조를 연결합니다.",
      prerequisites: "선형대수",
      durationMinutes: 60,
      presenterNames: ["Dev Member"],
      scheduledAt: "2026-09-03T18:30:00+09:00",
      location: "27동 220호",
      files: [],
    },
  ],
  studies: [
    {
      id: "study-algebraic-topology",
      title: "대수위상 스터디",
      term: "26-2",
      description: "기본군과 호몰로지를 예제 중심으로 공부하는 스터디입니다.",
      material: "Hatcher, Algebraic Topology",
      organizerNames: ["이편집"],
      files: [],
    },
    {
      id: "study-probability",
      title: "확률론 문제풀이",
      term: "26-1",
      description: "측도론적 확률론의 핵심 정리와 예제를 함께 공부했습니다.",
      material: "Durrett, Probability: Theory and Examples",
      organizerNames: ["박부회장"],
      files: [],
    },
  ],
  activities: [
    {
      id: "activity-seminar-graph",
      title: "그래프 스펙트럼 입문",
      type: "세미나",
      date: "2026-09-03",
    },
    {
      id: "activity-2",
      title: "대수위상 스터디 1회차",
      type: "스터디",
      date: "2026-09-03",
    },
    {
      id: "activity-3",
      title: "함수방정식 문제 창작",
      type: "문제 창작",
      date: "2026-08-19",
    },
    {
      id: "activity-4",
      title: "2학기 개강 회식",
      type: "회식",
      date: "2026-09-01",
    },
  ],
  gallery: [
    {
      id: "gallery-seminar-1",
      title: "그래프 스펙트럼 세미나",
      category: "seminar",
      date: "2026-05-14",
      thumbnailUrl: null,
      displayUrl: null,
      alt: "그래프 스펙트럼 세미나 활동 사진",
    },
    {
      id: "gallery-study-1",
      title: "확률론 문제풀이 스터디",
      category: "study",
      date: "2026-05-02",
      thumbnailUrl: null,
      displayUrl: null,
      alt: "확률론 스터디 활동 사진",
    },
    {
      id: "gallery-dinner-1",
      title: "2026년 1학기 종강 회식",
      category: "dinner",
      date: "2026-06-18",
      thumbnailUrl: null,
      displayUrl: null,
      alt: "2026년 1학기 종강 회식 단체 사진",
    },
  ],
  projects: [
    {
      memberId: "member-president",
      memberName: "김회장",
      department: "수리과학부",
      title: "SNUMPS 강의 노트",
      url: "https://example.com/snumps-notes",
    },
  ],
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function getDevPublicArchive(): PublicArchiveSnapshot {
  return clone(snapshot);
}

export function getDevPublicSeminar(id: string) {
  const seminar = snapshot.seminars.find((record) => record.id === id);
  return seminar ? clone(seminar) : null;
}

export function createDevPublicActivity(input: {
  id: string;
  title: string;
  type: ActivityType;
  date: string;
}) {
  snapshot.activities = [
    {
      id: input.id,
      title: input.title,
      type: input.type,
      date: input.date,
    },
    ...snapshot.activities,
  ];
}

export function updateDevPublicActivity(
  id: string,
  input: { title: string; type: ActivityType; date: string },
) {
  const activity = snapshot.activities.find((record) => record.id === id);
  if (!activity) return false;
  Object.assign(activity, structuredClone(input));
  return true;
}

export function deleteDevPublicActivity(id: string) {
  const before = snapshot.activities.length;
  snapshot.activities = snapshot.activities.filter(
    (record) => record.id !== id,
  );
  return snapshot.activities.length !== before;
}

export function createDevPublicGalleryRecord(input: {
  id: string;
  title: string;
  category: "seminar" | "study" | "dinner";
  date: string;
  alt: string;
}) {
  snapshot.gallery = [
    {
      id: input.id,
      title: input.title,
      category: input.category,
      date: input.date,
      alt: input.alt,
      thumbnailUrl: null,
      displayUrl: null,
    },
    ...snapshot.gallery,
  ];
}

export function updateDevPublicGalleryRecord(
  id: string,
  input: {
    title: string;
    category: "seminar" | "study" | "dinner";
    date: string;
    alt: string;
  },
) {
  const record = snapshot.gallery.find((item) => item.id === id);
  if (!record) return false;
  Object.assign(record, structuredClone(input));
  return true;
}

export function deleteDevPublicGalleryRecord(id: string) {
  const before = snapshot.gallery.length;
  snapshot.gallery = snapshot.gallery.filter((record) => record.id !== id);
  return snapshot.gallery.length !== before;
}

export function upsertDevPublicSeminar(input: {
  id: string;
  title: string;
  term: string;
  description: string;
  prerequisites: string;
  durationMinutes: number;
  presenterNames: string[];
  scheduledAt: string | null;
  location: string | null;
  files: PublicArchiveSnapshot["seminars"][number]["files"];
}) {
  const next = structuredClone(input);
  const index = snapshot.seminars.findIndex((record) => record.id === input.id);
  if (index === -1) snapshot.seminars = [next, ...snapshot.seminars];
  else snapshot.seminars[index] = { ...snapshot.seminars[index], ...next };
}

export function deleteDevPublicSeminar(id: string) {
  const before = snapshot.seminars.length;
  snapshot.seminars = snapshot.seminars.filter((record) => record.id !== id);
  return snapshot.seminars.length !== before;
}

export function upsertDevPublicStudy(input: {
  id: string;
  title: string;
  term: string;
  description: string;
  material: string;
  organizerNames: string[];
  files: PublicArchiveSnapshot["studies"][number]["files"];
}) {
  const next = {
    id: input.id,
    title: input.title,
    term: input.term,
    description: input.description,
    material: input.material,
    organizerNames: [...input.organizerNames],
    files: structuredClone(input.files),
  };
  const index = snapshot.studies.findIndex((record) => record.id === input.id);
  if (index === -1) snapshot.studies = [next, ...snapshot.studies];
  else snapshot.studies[index] = { ...snapshot.studies[index], ...next };
}

export function deleteDevPublicStudy(id: string) {
  const before = snapshot.studies.length;
  snapshot.studies = snapshot.studies.filter((record) => record.id !== id);
  return snapshot.studies.length !== before;
}
