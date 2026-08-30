// run: npx tsx scripts/seed-dev.ts
//
// dev 프로젝트 시드 스크립트 (SUPABASE-MIGRATION-SPEC.md T8 / 결정 S4).
// 대상: supabase/migrations/20260901000000_documents.sql이 적용된 **dev** Supabase 프로젝트.
// 필요 env: SUPABASE_URL, SUPABASE_SECRET_KEY (sb_secret_..., 서버 전용 — 절대 커밋 금지)
//
// 의존성: @supabase/supabase-js (T2에서 추가됨 — 아직 없으면 `pnpm add @supabase/supabase-js`).
// 이 스크립트는 의도적으로 src/를 import하지 않는다($lib alias는 vite 밖에서 깨짐).
// 행 형태는 src/lib/server/data/schemas/*의 Zod 스키마를 수동으로 미러링한 것 —
// 스키마가 바뀌면 여기도 함께 갱신할 것.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

/** 26자 ULID형 id — Crockford base32 알파벳(0-9A-HJKMNP-TV-Z), 의존성 0. */
const ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function id(): string {
  const bytes = randomBytes(26);
  let out = "";
  for (let i = 0; i < 26; i++) out += ID_ALPHABET[bytes[i] & 31];
  return out;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** ISO 8601 instant with the +09:00 (KST) offset — schemas/common.ts DateTime 형식. */
function kstISO(d: Date): string {
  const shifted = new Date(d.getTime() + KST_OFFSET_MS);
  return shifted.toISOString().slice(0, 19) + "+09:00";
}

/** Date-only "YYYY-MM-DD" (KST 기준). */
function kstDateOnly(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function hoursLater(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

/**
 * 현재 학기 — src/lib/server/core/semester.ts의 규칙을 미러링:
 * 3~8월 = "YY-1", 9~2월 = "YY-2" (1·2월은 전년도 2학기), 경계는 KST.
 */
function currentTerm(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  if (month >= 3 && month <= 8) return `${String(year % 100).padStart(2, "0")}-1`;
  const termYear = month >= 9 ? year : year - 1;
  return `${String(termYear % 100).padStart(2, "0")}-2`;
}

// ---------------------------------------------------------------------------
// 시드 데이터 (schemas/* 형태 미러)
// ---------------------------------------------------------------------------

const term = currentTerm();
const now = new Date();
const nowISO = kstISO(now);

// --- members (4명) ---
const adminId = id(); // 관리자 + 현재 학기 회장
const regularId = id(); // 정회원 (동문)
const associateId = id(); // 준회원
const holdId = id(); // 탈퇴유예

const members = [
  {
    id: adminId,
    name: "김관리",
    department: "수리과학부",
    joinedAt: kstDateOnly(daysFromNow(-700)),
    status: "regular",
    statusChangedAt: kstISO(daysFromNow(-700)),
    withdrawal: null,
    isAlumni: false,
    alumniRevoked: false,
    roles: [{ term, title: "회장" }],
    isAdmin: true,
    publicContact: null,
    project: null,
    legacyMemberId: null,
    sourceRequestId: null,
  },
  {
    id: regularId,
    name: "이정회",
    department: "컴퓨터공학부",
    joinedAt: kstDateOnly(daysFromNow(-1100)),
    status: "regular",
    statusChangedAt: kstISO(daysFromNow(-1100)),
    withdrawal: null,
    isAlumni: true,
    alumniRevoked: false,
    roles: [],
    isAdmin: false,
    publicContact: "github.com/dev-regular",
    project: { title: "졸업 프로젝트", url: "https://example.com/project" },
    legacyMemberId: null,
    sourceRequestId: null,
  },
  {
    id: associateId,
    name: "박준회",
    department: "물리천문학부",
    joinedAt: kstDateOnly(daysFromNow(-30)),
    status: "associate",
    statusChangedAt: kstISO(daysFromNow(-30)),
    withdrawal: null,
    isAlumni: false,
    alumniRevoked: false,
    roles: [],
    isAdmin: false,
    publicContact: null,
    project: null,
    legacyMemberId: null,
    sourceRequestId: null,
  },
  {
    id: holdId,
    name: "최유예",
    department: "통계학과",
    joinedAt: kstDateOnly(daysFromNow(-400)),
    status: "withdrawn",
    statusChangedAt: kstISO(daysFromNow(-3)),
    withdrawal: {
      requestedAt: kstISO(daysFromNow(-3)),
      previousStatus: "regular",
      holdBy: adminId,
      holdAt: kstISO(daysFromNow(-2)),
    },
    isAlumni: false,
    alumniRevoked: false,
    roles: [],
    isAdmin: false,
    publicContact: null,
    project: null,
    legacyMemberId: null,
    sourceRequestId: null,
  },
];

// --- private-info (members와 1:1, 4행) ---
const privateInfo = members.map((m, i) => ({
  id: id(),
  memberId: m.id,
  email: `dev${i + 1}@snu.ac.kr`,
  phone: `010-0000-000${i + 1}`,
  studentId: `2024-1234${i + 1}`,
  background: `시드 데이터 — ${m.name} (${m.department})`,
  mailPrefs: { announcements: true },
  sourceRequestId: null,
}));

// --- activities (3: 세미나 미래 / 스터디 미래 / 회의 과거) ---
const seminarActivityId = id(); // 미래 — active 이벤트와 연결
const studyActivityId = id(); // 미래
const meetingActivityId = id(); // 과거 — 지난 이벤트와 연결

const futureSeminarStart = daysFromNow(7);
const pastMeetingStart = daysFromNow(-14);

const activities = [
  {
    id: seminarActivityId,
    title: "개발 세미나: 타입 안전한 데이터 계층",
    date: { start: kstISO(futureSeminarStart), end: kstISO(hoursLater(futureSeminarStart, 2)) },
    type: "세미나",
    attendeeIds: [],
    sourceRequestId: null,
  },
  {
    id: studyActivityId,
    title: "알고리즘 스터디 1회차",
    date: { start: kstISO(daysFromNow(10)), end: null },
    type: "스터디",
    attendeeIds: [],
    sourceRequestId: null,
  },
  {
    id: meetingActivityId,
    title: "정기 운영 회의",
    date: { start: kstISO(pastMeetingStart), end: kstISO(hoursLater(pastMeetingStart, 1)) },
    type: "회의",
    attendeeIds: [adminId, regularId],
    sourceRequestId: null,
  },
];

// --- events (2: active 미래 세미나 / 지난 회의) ---
const events = [
  {
    id: id(),
    title: "개발 세미나: 타입 안전한 데이터 계층",
    date: { start: kstISO(futureSeminarStart), end: kstISO(hoursLater(futureSeminarStart, 2)) },
    type: "세미나",
    status: "active",
    pathId: "dev-seminar-data-layer",
    attendCode: "1234",
    activityId: seminarActivityId,
    applicantIds: [associateId],
    presenterIds: [adminId],
    studyId: null,
    sessionNo: null,
    autoGenerated: false,
    sourceRequestId: null,
  },
  {
    id: id(),
    title: "정기 운영 회의",
    date: { start: kstISO(pastMeetingStart), end: kstISO(hoursLater(pastMeetingStart, 1)) },
    type: "회의",
    status: "expired",
    pathId: "dev-meeting-past",
    attendCode: "5678",
    activityId: meetingActivityId,
    applicantIds: [adminId, regularId],
    presenterIds: [],
    studyId: null,
    sessionNo: null,
    autoGenerated: false,
    sourceRequestId: null,
  },
];

// --- seminars (아카이브 1) ---
const seminars = [
  {
    id: id(),
    title: "지난 학기 세미나 아카이브",
    semester: term,
    note: "시드 데이터",
    presenterIds: [adminId],
    externalPresenters: "",
    materials: [],
    photos: [],
    activityId: null,
    sourceRequestId: null,
  },
];

// --- studies (1: recruiting, organizer=정회원, 미래 일정 1건) ---
const studies = [
  {
    id: id(),
    title: "알고리즘 스터디",
    semester: term,
    textbook: "Introduction to Algorithms",
    description: "시드용 recruiting 스터디",
    note: "",
    organizerIds: [regularId],
    participantIds: [associateId],
    pendingParticipantIds: [],
    pendingTransfer: null,
    schedule: [{ date: kstISO(daysFromNow(10)), generatedEventId: null }],
    transferHistory: [],
    photos: [],
    status: "recruiting",
    sourceRequestId: null,
  },
];

// --- seminar-requests (1: pending) ---
const seminarRequests = [
  {
    id: id(),
    title: "함수형 프로그래밍 입문",
    description: "하스켈 맛보기 세미나 제안",
    prerequisites: "없음",
    duration: "2시간",
    presenterIds: [regularId],
    attachment: "",
    requesterId: regularId,
    status: "pending",
    createdAt: nowISO,
  },
];

// --- study-requests (1: pending) ---
const studyRequests = [
  {
    id: id(),
    title: "선형대수",
    textbook: "Linear Algebra Done Right",
    description: "다음 학기 선형대수 스터디 제안",
    semester: term,
    requesterId: associateId,
    status: "pending",
    createdAt: nowISO,
  },
];

// --- applications (1: 미처리 가입 신청) ---
const applications = [
  {
    id: id(),
    name: "정지원",
    email: "dev-applicant@snu.ac.kr",
    phone: "010-0000-0099",
    department: "자유전공학부",
    studentId: "2025-98765",
    background: "시드 데이터 — 가입 신청",
    createdAt: nowISO,
  },
];

// --- gallery-dinner (1) ---
const galleryDinner = [
  {
    id: id(),
    year: String(new Date(now.getTime() + KST_OFFSET_MS).getUTCFullYear()),
    photos: [],
    activityId: null,
  },
];

// --- registrations (S9: 학기별 등록 — 시드 회원 전원 이번 학기 등록) ---
const registrations = members.map((m) => ({
  id: id(),
  memberId: m.id,
  term,
  registeredAt: kstISO(daysFromNow(-3)),
  sourceRequestId: null,
}));

// 테이블명 13종 — src/lib/server/data/schemas/index.ts TABLES와 정확히 일치해야 함 (S9: registrations·legacy 포함).
const SEED: Record<string, unknown[]> = {
  members,
  "private-info": privateInfo,
  registrations,
  "legacy-members": [],
  "legacy-private-info": [],
  activities,
  events,
  applications,
  "seminar-requests": seminarRequests,
  "study-requests": studyRequests,
  studies,
  seminars,
  "gallery-dinner": galleryDinner,
};

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------

async function main() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    console.error(
      "환경 변수가 없습니다: SUPABASE_URL 과 SUPABASE_SECRET_KEY 를 설정한 뒤 다시 실행하세요.\n" +
        "예) SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SECRET_KEY=sb_secret_... npx tsx scripts/seed-dev.ts\n" +
        "(dev 프로젝트의 값을 사용할 것 — prod 키로 실행하지 마세요)",
    );
    process.exit(1);
  }

  const supabase = createClient(url, secretKey, { auth: { persistSession: false } });

  const upserts = Object.entries(SEED).map(([name, rows]) => ({
    name,
    version: 1,
    doc: { schemaVersion: 1, rows },
  }));

  const { error } = await supabase.from("app_tables").upsert(upserts);
  if (error) throw new Error(`app_tables upsert 실패: ${error.message}`);

  console.log(`시드 완료 (${url}) — 현재 학기: ${term}\n`);
  console.table(
    Object.entries(SEED).map(([name, rows]) => ({ table: name, rows: rows.length })),
  );
}

main().catch((err) => {
  console.error("시드 실패:", err instanceof Error ? err.message : err);
  process.exit(1);
});
