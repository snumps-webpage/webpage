export const ABOUT_NAV = [
  { href: "/about", label: "소개" },
  { href: "/about/charter", label: "회칙" },
  { href: "/about/executives", label: "회장단" },
  { href: "/about/elections", label: "선거" },
  { href: "/about/press", label: "홍보" },
  { href: "/about/finance", label: "자금" },
] as const;

export const ARCHIVE_NAV = [
  { href: "/archive", label: "아카이브" },
  { href: "/archive/seminars", label: "세미나" },
  { href: "/archive/studies", label: "스터디" },
  { href: "/archive/activities", label: "활동" },
  { href: "/archive/gallery", label: "갤러리" },
  { href: "/archive/projects", label: "프로젝트" },
  { href: "/archive/misc", label: "기타" },
] as const;

export interface PublicDirectoryEntry {
  href: string;
  code: string;
  title: string;
  description: string;
  status: "available" | "source-pending";
}

export const ABOUT_DIRECTORY: PublicDirectoryEntry[] = [
  {
    href: "/about/charter",
    code: "PUB-03·04",
    title: "회칙과 개정 이력",
    description: "현행 회칙과 개정본을 덮어쓰지 않고 시점별로 보존합니다.",
    status: "source-pending",
  },
  {
    href: "/about/executives",
    code: "PUB-05",
    title: "역대 회장단",
    description:
      "학기별 직책 기록과 공개 동의된 현 회장·부회장 연락처를 확인합니다.",
    status: "available",
  },
  {
    href: "/about/elections",
    code: "PUB-06",
    title: "선거 공약",
    description: "회장단 선거의 LaTeX 양식과 역대 공약 PDF를 열람합니다.",
    status: "source-pending",
  },
  {
    href: "/about/press",
    code: "PUB-07",
    title: "홍보 자료",
    description:
      "동아리 홍보문과 포스터, 현재 가입 신청 경로를 한 곳에서 제공합니다.",
    status: "source-pending",
  },
  {
    href: "/about/finance",
    code: "PUB-08",
    title: "자금 내역",
    description: "운영진이 관리하는 자금 내역 시트의 공개 열람 경로입니다.",
    status: "source-pending",
  },
];

export const ARCHIVE_DIRECTORY: PublicDirectoryEntry[] = [
  {
    href: "/archive/seminars",
    code: "PUB-09",
    title: "세미나 기록",
    description:
      "제목, 발표자, 선수지식, 일정과 공개 자료를 학기별로 찾습니다.",
    status: "available",
  },
  {
    href: "/archive/studies",
    code: "PUB-10",
    title: "스터디 기록",
    description: "진행된 스터디의 분야, 교재, 설명과 공개 자료를 보존합니다.",
    status: "available",
  },
  {
    href: "/archive/activities",
    code: "PUB-11",
    title: "활동 대장",
    description:
      "참석자 명단 없이 날짜·제목·활동 유형만 공개하는 연대기입니다.",
    status: "available",
  },
  {
    href: "/archive/gallery",
    code: "PUB-12",
    title: "활동 갤러리",
    description: "세미나·스터디·회식의 공개 사진을 작은 이미지로 탐색합니다.",
    status: "source-pending",
  },
  {
    href: "/archive/projects",
    code: "PUB-13",
    title: "회원 프로젝트",
    description: "회원이 공개한 수학·개발 프로젝트를 연결합니다.",
    status: "available",
  },
  {
    href: "/archive/misc",
    code: "PUB-14",
    title: "기타 기록",
    description:
      "Integration Bee, 문제 창작, 채팅방 논의 등 별도 자료를 모읍니다.",
    status: "source-pending",
  },
];
