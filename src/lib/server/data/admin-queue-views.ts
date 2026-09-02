import type {
  Application,
  Member,
  SeminarRequest,
  StudyRequest,
} from "./schemas";
import type { AdminMembershipApplicationItem } from "$lib/domain/admin-dashboard";
import type { AdminSeminarRequestItem } from "$lib/domain/admin-seminars";
import type { AdminStudyRequestItem } from "$lib/domain/studies";
import { assetUrl } from "$lib/server/public/archive";

/**
 * Admin queue projections shared by the dashboard load, the per-domain
 * review pages, and the /api/admin polling endpoints — one mapping per
 * queue so the three consumers can never drift apart.
 */

export function memberSummaryById(members: Member[]) {
  return new Map(
    members.map((m) => [
      m.id,
      { id: m.id, name: m.name, department: m.department },
    ]),
  );
}

type MemberSummaryMap = ReturnType<typeof memberSummaryById>;

/**
 * S9: 표시용 이름·학과 맵 — 이주된 요청(seminar-requests 등)의 requester/
 * presenter id는 legacy id라서, 운영 members가 아닌 통합 디렉터리 인덱스로
 * 해석한다. 키는 조회에 쓰인 id 그대로 유지한다(요청 행과의 1:1 대응).
 */
export async function directorySummaryIndex(): Promise<MemberSummaryMap> {
  const { getDirectoryIndex } = await import("./directory");
  const index = await getDirectoryIndex();
  return new Map(
    [...index].map(([id, m]) => [id, { id, name: m.name, department: m.department }]),
  );
}

const UNKNOWN_MEMBER = { id: "", name: "알 수 없음", department: "" };

export function adminApplicationItem(
  a: Application,
): AdminMembershipApplicationItem {
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    phone: a.phone,
    department: a.department,
    studentId: a.studentId,
    background: a.background,
    // The table holds only unprocessed rows; consent is given at submission.
    consentAt: a.createdAt,
    submittedAt: a.createdAt,
    canApprove: true,
    canReject: true,
  };
}

export function adminSeminarRequestItem(
  r: SeminarRequest,
  members: MemberSummaryMap,
): AdminSeminarRequestItem {
  return {
    id: r.id,
    // The stored request has no kind — proposals default to 비정기; the
    // reviewer picks the final label in the UI (informational only).
    kind: "irregular",
    title: r.title,
    description: r.description,
    prerequisites: r.prerequisites,
    duration: r.duration,
    preferredTiming: r.preferredTiming,
    attachmentUrl: r.attachment || null,
    posterUrl: r.posterKey ? assetUrl(r.posterKey) : null,
    presenters: r.presenterIds.map(
      (id) => members.get(id) ?? { ...UNKNOWN_MEMBER, id },
    ),
    requester: members.get(r.requesterId) ?? {
      ...UNKNOWN_MEMBER,
      id: r.requesterId,
    },
    createdAt: r.createdAt,
    canApprove: true,
    canReject: true,
  };
}

export function adminStudyRequestItem(
  r: StudyRequest,
  members: MemberSummaryMap,
): AdminStudyRequestItem {
  return {
    id: r.id,
    title: r.title,
    textbook: r.textbook,
    description: r.description,
    semester: r.semester,
    requester: members.get(r.requesterId) ?? {
      ...UNKNOWN_MEMBER,
      id: r.requesterId,
    },
    status: r.status,
    createdAt: r.createdAt,
    canWithdraw: false,
    canApprove: true,
    canReject: true,
  };
}

/** A stored s3Key rendered as an editor file row (size is not tracked). */
export function contentFileFromKey(key: string, kind: "pdf" | "image") {
  const name = key.slice(key.lastIndexOf("/") + 1);
  return {
    id: key,
    name,
    kind,
    url: null as string | null,
    contentType:
      kind === "pdf" ? "application/pdf" : `image/${name.split(".").pop() ?? "jpeg"}`,
    size: 0,
  };
}
