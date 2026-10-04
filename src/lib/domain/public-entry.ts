import { ARCHIVE_DIRECTORY } from "$lib/public-navigation";

export interface PublicRecordLink {
  href: string;
  title: string;
  description: string;
}

const purposes: Record<string, string> = {
  "/archive/seminars": "발표 주제와 발표자, 일정, 공개 자료를 찾아봅니다.",
  "/archive/studies": "교재와 공부 주제, 스터디 소개를 살펴봅니다.",
  "/archive/activities": "날짜와 활동 종류를 따라 동아리의 기록을 읽습니다.",
  "/archive/gallery": "공개된 세미나·스터디·회식 사진을 둘러봅니다.",
  "/archive/projects": "회원들이 공개한 수학·개발 프로젝트를 찾아봅니다.",
  "/archive/misc":
    "Integration Bee와 문제 창작, 수학 논의 기록 안내를 확인합니다.",
};

/** Presentation only: the existing directory owns destinations and titles. */
export const publicRecordLinks: PublicRecordLink[] = ARCHIVE_DIRECTORY.map(
  ({ href, title }) => ({ href, title, description: purposes[href] ?? title }),
);

export const primaryPublicRecords = publicRecordLinks.slice(0, 3);

export const publicRecordGroups = [
  { title: "발표와 함께한 공부", links: primaryPublicRecords },
  { title: "사진과 회원 작업", links: publicRecordLinks.slice(3, 5) },
  { title: "그 밖의 수학 기록", links: publicRecordLinks.slice(5) },
];
