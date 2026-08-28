import type {
  AdminStudyRequestItem,
  StudyAttendancePageData,
  StudyDetailData,
  StudyListItem,
  StudyManagementData,
  StudyMemberSummary,
  StudySessionItem,
  StudyStatus,
  StudyTransferOffer,
  StudyRequestFormValues,
  StudyRequestItem,
} from "$lib/domain/studies";
import type { CheckInEvent } from "$lib/domain/attendance";
import {
  enqueueDevAttendance,
  getDevActivityAttendeeIds,
  publishDevEvent,
  replaceDevActivityAttendees,
  setDevEventStatus,
  updateDevPublishedEvent,
} from "$lib/server/dev-admin-dashboard-fixtures";
import {
  linkDevAdminActivityEvent,
  registerDevAdminActivity,
  updateDevAdminActivity,
} from "$lib/server/dev-admin-record-fixtures";

const organizer: StudyMemberSummary = {
  id: "dev-member",
  name: "Dev Member",
  department: "수리과학부",
};

const numberTheoryOrganizer: StudyMemberSummary = {
  id: "member-number-organizer",
  name: "윤정수",
  department: "수리과학부",
};

const allStudyMembers: StudyMemberSummary[] = [
  organizer,
  numberTheoryOrganizer,
  { id: "member-study-1", name: "박해석", department: "수리과학부" },
  { id: "member-study-2", name: "최논리", department: "철학과" },
  { id: "member-study-3", name: "정조합", department: "컴퓨터공학부" },
  { id: "member-study-4", name: "한소수", department: "물리천문학부" },
];

let pendingParticipants: StudyMemberSummary[] = [
  { id: "member-pending-1", name: "김대수", department: "수리과학부" },
  { id: "member-pending-2", name: "이기하", department: "통계학과" },
];

let participants: StudyMemberSummary[] = [
  organizer,
  { id: "member-study-1", name: "박해석", department: "수리과학부" },
  { id: "member-study-2", name: "최논리", department: "철학과" },
  { id: "member-study-3", name: "정조합", department: "컴퓨터공학부" },
];

let studyStatus: StudyStatus = "ongoing";
let algebraPendingTransfer: StudyManagementData["pendingTransfer"] = null;

let numberTheoryOrganizerIds = [numberTheoryOrganizer.id];
let numberTheoryStatus: StudyStatus = "recruiting";
let numberTheoryParticipants = [
  numberTheoryOrganizer,
  allStudyMembers.find((member) => member.id === "member-study-4")!,
];
let numberTheoryPendingParticipantIds: string[] = [];
let numberTheoryPendingTransfer: StudyManagementData["pendingTransfer"] = null;
let numberTheoryTransfer: StudyTransferOffer | null = {
  studyId: "study-number-theory-1",
  studyTitle: "해석적 정수론 문제풀이",
  fromMember: numberTheoryOrganizer,
  requestedAt: "2026-08-27T20:10:00+09:00",
};

let studyRequests: AdminStudyRequestItem[] = [
  {
    id: "study-request-category-1",
    title: "범주론 입문 읽기 모임",
    textbook: "Emily Riehl, Category Theory in Context",
    description:
      "범주와 함자의 기본 정의를 예제 중심으로 읽고 연습문제를 토론합니다.",
    semester: "26-2",
    requester: {
      id: "member-editor",
      name: "이편집",
      department: "수리과학부",
    },
    status: "pending",
    createdAt: "2026-08-26T13:20:00+09:00",
    canWithdraw: false,
    canApprove: true,
    canReject: true,
  },
  {
    id: "study-request-geometry-1",
    title: "리만기하 세미나",
    textbook: "do Carmo, Riemannian Geometry",
    description:
      "미분기하학 수강자를 대상으로 곡률과 측지선의 기본 예제를 공부합니다.",
    semester: "26-2",
    requester: {
      id: "dev-member",
      name: "Dev Member",
      department: "수리과학부",
    },
    status: "pending",
    createdAt: "2026-08-28T09:40:00+09:00",
    canWithdraw: false,
    canApprove: true,
    canReject: true,
  },
];

const approvedPreviewStudies: StudyListItem[] = [];
const approvedPreviewParticipants = new Map<string, StudyMemberSummary[]>();
const approvedPreviewPendingMemberIds = new Map<string, string[]>();

let sessions: StudySessionItem[] = [
  {
    id: "session-study-algebra-2",
    sessionNo: 2,
    title: "2회차",
    startedAt: "2026-08-26T18:32:00+09:00",
    status: "active",
    activityId: "activity-study-algebra-2",
    eventId: "event-study-algebra-2",
    attendancePath: "/events/study-algebra-s2/checkin-s2",
    attendanceCount: 2,
    canEdit: true,
    canCancel: true,
  },
  {
    id: "session-study-algebra-1",
    sessionNo: 1,
    title: "1회차",
    startedAt: "2026-08-19T18:28:00+09:00",
    status: "expired",
    activityId: "activity-study-algebra-1",
    eventId: "event-study-algebra-1",
    attendancePath: "/events/study-algebra-s1/checkin-s1",
    attendanceCount: 3,
    canEdit: true,
    canCancel: false,
  },
];
let numberTheorySessions: StudySessionItem[] = [];

const sessionByOperationId = new Map<string, StudySessionItem>();
function clone<T>(value: T): T {
  return structuredClone(value);
}

function projectSessionAttendance(sessionList: StudySessionItem[]) {
  return sessionList.map((session) => ({
    ...session,
    attendanceCount: getDevActivityAttendeeIds(session.activityId).length,
  }));
}

function nowKstIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}+09:00`;
}

export const DEV_STUDY_ID = "study-algebra-1";

export function getDevStudyManagementData(
  studyId = DEV_STUDY_ID,
): StudyManagementData {
  if (studyId === "study-number-theory-1") {
    const organizers = numberTheoryOrganizerIds
      .map((id) => allStudyMembers.find((member) => member.id === id))
      .filter((member): member is StudyMemberSummary => !!member);
    const pending = numberTheoryPendingParticipantIds
      .map((id) => allStudyMembers.find((member) => member.id === id))
      .filter((member): member is StudyMemberSummary => !!member);
    return clone({
      id: studyId,
      title: "해석적 정수론 문제풀이",
      semester: "26-2",
      textbook: "Tom M. Apostol, Introduction to Analytic Number Theory",
      description:
        "소수 분포와 산술 함수의 기본 문제를 함께 풀고 풀이를 비교합니다.",
      note: "정해진 반복 일정 없이 모일 때마다 회차를 생성합니다.",
      status: numberTheoryStatus,
      organizers,
      participants: numberTheoryParticipants,
      pendingParticipants: pending,
      sessions: projectSessionAttendance(numberTheorySessions).sort(
        (a, b) => b.sessionNo - a.sessionNo,
      ),
      pendingTransfer: numberTheoryPendingTransfer,
      capabilities: {
        canCreateSession: numberTheoryStatus !== "finished",
        canManageParticipants: numberTheoryStatus !== "finished",
        canChangeStatus: numberTheoryStatus !== "finished",
        canTransferOrganizer: numberTheoryStatus !== "finished",
      },
      generatedAt: new Date().toISOString(),
    });
  }

  return clone({
    id: DEV_STUDY_ID,
    title: "대수적 위상수학 읽기 모임",
    semester: "26-2",
    textbook: "Allen Hatcher, Algebraic Topology",
    description:
      "기본군과 호몰로지를 구체적인 계산과 함께 읽고, 매 회차 핵심 예제를 함께 풉니다.",
    note: "회차는 실제 모임이 시작될 때 생성합니다.",
    status: studyStatus,
    organizers: [organizer],
    participants,
    pendingParticipants,
    sessions: projectSessionAttendance(sessions).sort(
      (a, b) => b.sessionNo - a.sessionNo,
    ),
    pendingTransfer: algebraPendingTransfer,
    capabilities: {
      canCreateSession: studyStatus !== "finished",
      canManageParticipants: studyStatus !== "finished",
      canChangeStatus: studyStatus !== "finished",
      canTransferOrganizer: studyStatus !== "finished",
    },
    generatedAt: new Date().toISOString(),
  });
}

export function getDevStudyList(): StudyListItem[] {
  const study = getDevStudyManagementData();
  return [
    {
      id: study.id,
      title: study.title,
      semester: study.semester,
      textbook: study.textbook,
      description: study.description,
      status: study.status,
      participantCount: study.participants.length,
      organizerNames: study.organizers.map((member) => member.name),
      relationship: "organizer",
      canManage: true,
    },
    {
      id: "study-number-theory-1",
      title: "해석적 정수론 문제풀이",
      semester: "26-2",
      textbook: "Tom M. Apostol, Introduction to Analytic Number Theory",
      description:
        "소수 분포와 산술 함수의 기본 문제를 함께 풀고 풀이를 비교합니다.",
      status: numberTheoryStatus,
      participantCount: numberTheoryParticipants.length,
      organizerNames: numberTheoryOrganizerIds.map(
        (id) =>
          allStudyMembers.find((member) => member.id === id)?.name ?? "Unknown",
      ),
      relationship: numberTheoryOrganizerIds.includes(organizer.id)
        ? "organizer"
        : numberTheoryParticipants.some((member) => member.id === organizer.id)
          ? "participant"
          : numberTheoryPendingParticipantIds.includes(organizer.id)
            ? "pending"
            : "none",
      canManage: numberTheoryOrganizerIds.includes(organizer.id),
    },
    ...approvedPreviewStudies.map((item) => {
      const participantList = approvedPreviewParticipants.get(item.id) ?? [];
      const pendingIds = approvedPreviewPendingMemberIds.get(item.id) ?? [];
      const request = studyRequests.find(
        (candidate) => `approved-${candidate.id}` === item.id,
      );
      const isOrganizer = request?.requester.id === organizer.id;
      return clone({
        ...item,
        participantCount: participantList.length,
        relationship: isOrganizer
          ? "organizer"
          : participantList.some((member) => member.id === organizer.id)
            ? "participant"
            : pendingIds.includes(organizer.id)
              ? "pending"
              : "none",
        canManage: isOrganizer,
      } satisfies StudyListItem);
    }),
  ];
}

export function getDevOrganizedStudyTitles(memberId: string) {
  const titles: string[] = [];
  if (memberId === organizer.id && studyStatus !== "finished") {
    titles.push("대수적 위상수학 읽기 모임");
  }
  if (
    numberTheoryOrganizerIds.includes(memberId) &&
    numberTheoryStatus !== "finished"
  ) {
    titles.push("해석적 정수론 문제풀이");
  }
  for (const study of approvedPreviewStudies) {
    const request = studyRequests.find(
      (item) => `approved-${item.id}` === study.id,
    );
    if (request?.requester.id === memberId && study.status !== "finished") {
      titles.push(study.title);
    }
  }
  return [...titles];
}

export function getDevStudyDetail(
  studyId: string,
  memberId = organizer.id,
): StudyDetailData | null {
  if (studyId === DEV_STUDY_ID) {
    const management = getDevStudyManagementData();
    const isOrganizer = management.organizers.some(
      (member) => member.id === memberId,
    );
    const isParticipant = management.participants.some(
      (member) => member.id === memberId,
    );
    const isPending = management.pendingParticipants.some(
      (member) => member.id === memberId,
    );
    return clone({
      id: management.id,
      title: management.title,
      semester: management.semester,
      textbook: management.textbook,
      description: management.description,
      note: management.note,
      status: management.status,
      organizers: management.organizers,
      participantCount: management.participants.length,
      relationship: isOrganizer
        ? "organizer"
        : isParticipant
          ? "participant"
          : isPending
            ? "pending"
            : "none",
      canJoin:
        management.status === "recruiting" &&
        !isOrganizer &&
        !isParticipant &&
        !isPending,
      canLeave: !isOrganizer && (isParticipant || isPending),
      canManage: isOrganizer,
    });
  }

  if (studyId !== "study-number-theory-1") {
    const approved = approvedPreviewStudies.find(
      (study) => study.id === studyId,
    );
    if (!approved) return null;
    const request = studyRequests.find(
      (item) => `approved-${item.id}` === studyId,
    );
    const participantList = approvedPreviewParticipants.get(studyId) ?? [];
    const pendingIds = approvedPreviewPendingMemberIds.get(studyId) ?? [];
    const isOrganizer = request?.requester.id === memberId;
    const isParticipant = participantList.some(
      (member) => member.id === memberId,
    );
    const isPending = pendingIds.includes(memberId);
    return clone({
      id: approved.id,
      title: approved.title,
      semester: approved.semester,
      textbook: approved.textbook,
      description: approved.description,
      note: "실제 모임이 시작될 때마다 주최자가 회차를 생성합니다.",
      status: approved.status,
      organizers: request ? [request.requester] : [],
      participantCount: participantList.length,
      relationship: isOrganizer
        ? "organizer"
        : isParticipant
          ? "participant"
          : isPending
            ? "pending"
            : "none",
      canJoin:
        approved.status === "recruiting" &&
        !isOrganizer &&
        !isParticipant &&
        !isPending,
      canLeave: !isOrganizer && (isParticipant || isPending),
      canManage: isOrganizer,
    });
  }
  const isOrganizer = numberTheoryOrganizerIds.includes(memberId);
  const isParticipant = numberTheoryParticipants.some(
    (member) => member.id === memberId,
  );
  const isPending = numberTheoryPendingParticipantIds.includes(memberId);
  return clone({
    id: studyId,
    title: "해석적 정수론 문제풀이",
    semester: "26-2",
    textbook: "Tom M. Apostol, Introduction to Analytic Number Theory",
    description:
      "소수 분포와 산술 함수의 기본 문제를 함께 풀고 풀이를 비교합니다.",
    note: "정해진 반복 일정 없이 모일 때마다 회차를 생성합니다.",
    status: numberTheoryStatus,
    organizers: numberTheoryOrganizerIds
      .map((id) => allStudyMembers.find((member) => member.id === id))
      .filter((member): member is StudyMemberSummary => !!member),
    participantCount: numberTheoryParticipants.length,
    relationship: isOrganizer
      ? "organizer"
      : isParticipant
        ? "participant"
        : isPending
          ? "pending"
          : "none",
    canJoin:
      numberTheoryStatus === "recruiting" &&
      !isOrganizer &&
      !isParticipant &&
      !isPending,
    canLeave: !isOrganizer && (isParticipant || isPending),
    canManage: isOrganizer,
  });
}

export function joinDevStudy(studyId: string, memberId = organizer.id) {
  if (studyId !== "study-number-theory-1") {
    const approved = approvedPreviewStudies.find(
      (study) => study.id === studyId,
    );
    if (!approved || approved.status !== "recruiting") return false;
    const request = studyRequests.find(
      (item) => `approved-${item.id}` === studyId,
    );
    const participantList = approvedPreviewParticipants.get(studyId) ?? [];
    const pendingIds = approvedPreviewPendingMemberIds.get(studyId) ?? [];
    if (
      request?.requester.id === memberId ||
      participantList.some((member) => member.id === memberId) ||
      pendingIds.includes(memberId)
    ) {
      return true;
    }
    approvedPreviewPendingMemberIds.set(studyId, [...pendingIds, memberId]);
    return true;
  }
  if (numberTheoryStatus !== "recruiting") return false;
  if (
    numberTheoryOrganizerIds.includes(memberId) ||
    numberTheoryParticipants.some((member) => member.id === memberId) ||
    numberTheoryPendingParticipantIds.includes(memberId)
  ) {
    return true;
  }
  numberTheoryPendingParticipantIds = [
    ...numberTheoryPendingParticipantIds,
    memberId,
  ];
  return true;
}

export function leaveDevStudy(studyId: string, memberId = organizer.id) {
  if (studyId !== "study-number-theory-1") {
    const approved = approvedPreviewStudies.find(
      (study) => study.id === studyId,
    );
    const request = studyRequests.find(
      (item) => `approved-${item.id}` === studyId,
    );
    if (!approved || request?.requester.id === memberId) return false;
    approvedPreviewPendingMemberIds.set(
      studyId,
      (approvedPreviewPendingMemberIds.get(studyId) ?? []).filter(
        (id) => id !== memberId,
      ),
    );
    approvedPreviewParticipants.set(
      studyId,
      (approvedPreviewParticipants.get(studyId) ?? []).filter(
        (member) => member.id !== memberId,
      ),
    );
    return true;
  }
  if (numberTheoryOrganizerIds.includes(memberId)) {
    return false;
  }
  numberTheoryPendingParticipantIds = numberTheoryPendingParticipantIds.filter(
    (id) => id !== memberId,
  );
  numberTheoryParticipants = numberTheoryParticipants.filter(
    (member) => member.id !== memberId,
  );
  return true;
}

export function getDevTransferOffers(memberId = organizer.id) {
  return numberTheoryTransfer && memberId === organizer.id
    ? [clone(numberTheoryTransfer)]
    : [];
}

export function acceptDevTransfer(studyId: string, memberId = organizer.id) {
  if (!numberTheoryTransfer || studyId !== numberTheoryTransfer.studyId)
    return false;
  numberTheoryOrganizerIds = [memberId];
  if (!numberTheoryParticipants.some((member) => member.id === memberId)) {
    numberTheoryParticipants = [...numberTheoryParticipants, organizer];
  }
  numberTheoryPendingParticipantIds = numberTheoryPendingParticipantIds.filter(
    (id) => id !== memberId,
  );
  numberTheoryTransfer = null;
  return true;
}

export function declineDevTransfer(studyId: string) {
  if (!numberTheoryTransfer || studyId !== numberTheoryTransfer.studyId)
    return false;
  numberTheoryTransfer = null;
  return true;
}

export function proposeDevStudyTransfer(studyId: string, toMemberId: string) {
  const isNumberTheory = studyId === "study-number-theory-1";
  const pendingTransfer = isNumberTheory
    ? numberTheoryPendingTransfer
    : algebraPendingTransfer;
  const participantList = isNumberTheory
    ? numberTheoryParticipants
    : participants;
  const organizerIds = isNumberTheory
    ? numberTheoryOrganizerIds
    : [organizer.id];
  if (pendingTransfer) return null;
  const target = participantList.find(
    (member) => member.id === toMemberId && !organizerIds.includes(member.id),
  );
  if (!target) return null;
  const transfer = {
    toMember: target,
    requestedAt: nowKstIso(),
  };
  if (isNumberTheory) numberTheoryPendingTransfer = transfer;
  else algebraPendingTransfer = transfer;
  return clone(transfer);
}

export function cancelDevStudyTransfer(studyId: string) {
  const isNumberTheory = studyId === "study-number-theory-1";
  const existed = isNumberTheory
    ? !!numberTheoryPendingTransfer
    : !!algebraPendingTransfer;
  if (isNumberTheory) numberTheoryPendingTransfer = null;
  else algebraPendingTransfer = null;
  return existed;
}

export function getDevStudyTransferCandidates(studyId = DEV_STUDY_ID) {
  const management = getDevStudyManagementData(studyId);
  const organizerIds = new Set(
    management.organizers.map((member) => member.id),
  );
  return clone(
    management.participants.filter((member) => !organizerIds.has(member.id)),
  );
}

export function getDevStudyRequestsForMember(
  memberId = organizer.id,
): StudyRequestItem[] {
  return clone(
    studyRequests
      .filter((request) => request.requester.id === memberId)
      .map((request) => ({
        ...request,
        canWithdraw: request.status === "pending",
      })),
  );
}

export function getDevAdminStudyRequests() {
  return clone(studyRequests.filter((request) => request.status === "pending"));
}

export function createDevStudyRequest(
  values: StudyRequestFormValues,
  requester: StudyMemberSummary = organizer,
) {
  const request: AdminStudyRequestItem = {
    id: `study-request-${crypto.randomUUID()}`,
    ...values,
    requester,
    status: "pending",
    createdAt: nowKstIso(),
    canWithdraw: true,
    canApprove: true,
    canReject: true,
  };
  studyRequests = [...studyRequests, request];
  return clone(request);
}

export function withdrawDevStudyRequest(
  requestId: string,
  memberId = organizer.id,
) {
  const request = studyRequests.find(
    (item) => item.id === requestId && item.requester.id === memberId,
  );
  if (!request || request.status !== "pending") return false;
  studyRequests = studyRequests.map((item) =>
    item.id === requestId
      ? { ...item, status: "withdrawn", canWithdraw: false }
      : item,
  );
  return true;
}

export function approveDevStudyRequest(requestId: string) {
  const request = studyRequests.find(
    (item) => item.id === requestId && item.status === "pending",
  );
  if (!request) return null;
  studyRequests = studyRequests.map((item) =>
    item.id === requestId
      ? { ...item, status: "approved", canApprove: false, canReject: false }
      : item,
  );
  const study: StudyListItem = {
    id: `approved-${request.id}`,
    title: request.title,
    semester: request.semester,
    textbook: request.textbook,
    description: request.description,
    status: "recruiting",
    participantCount: 1,
    organizerNames: [request.requester.name],
    relationship: request.requester.id === organizer.id ? "organizer" : "none",
    canManage: request.requester.id === organizer.id,
  };
  approvedPreviewStudies.push(study);
  approvedPreviewParticipants.set(study.id, [request.requester]);
  approvedPreviewPendingMemberIds.set(study.id, []);
  return clone(study);
}

export function rejectDevStudyRequest(requestId: string) {
  const request = studyRequests.find(
    (item) => item.id === requestId && item.status === "pending",
  );
  if (!request) return false;
  studyRequests = studyRequests.map((item) =>
    item.id === requestId
      ? { ...item, status: "rejected", canApprove: false, canReject: false }
      : item,
  );
  return true;
}

export function acceptDevStudyParticipant(
  memberId: string,
  studyId = DEV_STUDY_ID,
) {
  if (studyId === "study-number-theory-1") {
    if (!numberTheoryPendingParticipantIds.includes(memberId)) return null;
    const member = allStudyMembers.find((item) => item.id === memberId);
    if (!member) return null;
    numberTheoryPendingParticipantIds =
      numberTheoryPendingParticipantIds.filter((id) => id !== memberId);
    if (!numberTheoryParticipants.some((item) => item.id === memberId)) {
      numberTheoryParticipants = [...numberTheoryParticipants, member];
    }
    return clone(member);
  }
  const member = pendingParticipants.find((item) => item.id === memberId);
  if (!member) return null;
  pendingParticipants = pendingParticipants.filter(
    (item) => item.id !== memberId,
  );
  if (!participants.some((item) => item.id === memberId)) {
    participants = [...participants, member];
  }
  return clone(member);
}

export function removeDevStudyParticipant(
  memberId: string,
  studyId = DEV_STUDY_ID,
) {
  if (studyId === "study-number-theory-1") {
    if (numberTheoryOrganizerIds.includes(memberId)) return false;
    const existed =
      numberTheoryPendingParticipantIds.includes(memberId) ||
      numberTheoryParticipants.some((item) => item.id === memberId);
    numberTheoryPendingParticipantIds =
      numberTheoryPendingParticipantIds.filter((id) => id !== memberId);
    numberTheoryParticipants = numberTheoryParticipants.filter(
      (member) => member.id !== memberId,
    );
    return existed;
  }
  const existed =
    pendingParticipants.some((item) => item.id === memberId) ||
    participants.some((item) => item.id === memberId);
  pendingParticipants = pendingParticipants.filter(
    (item) => item.id !== memberId,
  );
  participants = participants.filter(
    (item) => item.id === organizer.id || item.id !== memberId,
  );
  return existed;
}

export function setDevStudyStatus(status: StudyStatus, studyId = DEV_STUDY_ID) {
  if (studyId === "study-number-theory-1") numberTheoryStatus = status;
  else studyStatus = status;
}

export function createDevStudySession(
  operationId: string,
  studyId = DEV_STUDY_ID,
) {
  const operationKey = `${studyId}:${operationId}`;
  const existing = sessionByOperationId.get(operationKey);
  if (existing) return clone(existing);

  const isNumberTheory = studyId === "study-number-theory-1";
  const sessionList = isNumberTheory ? numberTheorySessions : sessions;
  const sessionNo =
    Math.max(0, ...sessionList.map((item) => item.sessionNo)) + 1;
  const studySlug = isNumberTheory ? "study-number-theory" : "study-algebra";
  const pathId = `${studySlug}-s${sessionNo}`;
  const session: StudySessionItem = {
    id: `session-${studySlug}-${sessionNo}`,
    sessionNo,
    title: `${sessionNo}회차`,
    startedAt: nowKstIso(),
    status: "active",
    activityId: `activity-${studySlug}-${sessionNo}`,
    eventId: `event-${studySlug}-${sessionNo}`,
    attendancePath: `/events/${pathId}/checkin-s${sessionNo}`,
    attendanceCount: 0,
    canEdit: true,
    canCancel: true,
  };

  if (isNumberTheory) numberTheorySessions = [session, ...numberTheorySessions];
  else sessions = [session, ...sessions];
  sessionByOperationId.set(operationKey, session);
  const study = getDevStudyManagementData(studyId);
  const eventTitle = `${study.title} ${session.title}`;
  registerDevAdminActivity({
    id: session.activityId,
    title: eventTitle,
    type: "스터디",
    date: session.startedAt.slice(0, 10),
  });
  publishDevEvent({
    id: session.eventId,
    activityId: session.activityId,
    title: eventTitle,
    type: "스터디",
    startsAt: session.startedAt,
    endsAt: null,
  });
  linkDevAdminActivityEvent(session.activityId, session.eventId);
  return clone(session);
}

export function updateDevStudySession(
  sessionId: string,
  updates: Pick<StudySessionItem, "title" | "startedAt">,
  studyId = DEV_STUDY_ID,
) {
  const isNumberTheory = studyId === "study-number-theory-1";
  const sessionList = isNumberTheory ? numberTheorySessions : sessions;
  const existing = sessionList.find((item) => item.id === sessionId);
  if (!existing) return null;
  const updatedSessions = sessionList.map((item) =>
    item.id === sessionId ? { ...item, ...updates } : item,
  );
  if (isNumberTheory) numberTheorySessions = updatedSessions;
  else sessions = updatedSessions;
  const study = getDevStudyManagementData(studyId);
  const eventTitle = `${study.title} ${updates.title}`;
  updateDevAdminActivity(existing.activityId, {
    title: eventTitle,
    type: "스터디",
    date: updates.startedAt.slice(0, 10),
  });
  updateDevPublishedEvent(existing.eventId, {
    title: eventTitle,
    startsAt: updates.startedAt,
    endsAt: null,
  });
  return clone({ ...existing, ...updates });
}

export function cancelDevStudySession(
  sessionId: string,
  studyId = DEV_STUDY_ID,
) {
  const isNumberTheory = studyId === "study-number-theory-1";
  const sessionList = isNumberTheory ? numberTheorySessions : sessions;
  const existing = sessionList.find((item) => item.id === sessionId);
  if (!existing || !existing.canCancel) return false;
  const updatedSessions: StudySessionItem[] = sessionList.map((item) =>
    item.id === sessionId
      ? {
          ...item,
          status: "cancelled" as const,
          canEdit: false,
          canCancel: false,
        }
      : item,
  );
  if (isNumberTheory) numberTheorySessions = updatedSessions;
  else sessions = updatedSessions;
  setDevEventStatus(existing.eventId, "expired");
  return true;
}

export function getDevStudyAttendanceData(
  eventId?: string | null,
  studyId = DEV_STUDY_ID,
): StudyAttendancePageData | null {
  const isNumberTheory = studyId === "study-number-theory-1";
  const management = getDevStudyManagementData(studyId);
  const sessionList = isNumberTheory ? numberTheorySessions : sessions;
  const availableSessions = [...sessionList]
    .filter((item) => item.status !== "cancelled")
    .sort((a, b) => b.sessionNo - a.sessionNo);
  const selectedSession =
    availableSessions.find((item) => item.eventId === eventId) ??
    availableSessions[0];
  if (!selectedSession) return null;

  const attended = new Set(
    getDevActivityAttendeeIds(selectedSession.activityId),
  );
  const projectedSessions = projectSessionAttendance(availableSessions);
  const projectedSelected = projectedSessions.find(
    (session) => session.id === selectedSession.id,
  )!;

  return clone({
    study: {
      id: management.id,
      title: management.title,
      semester: management.semester,
    },
    sessions: projectedSessions,
    selectedSession: projectedSelected,
    attendees: management.participants.map((member) => ({
      ...member,
      attended: attended.has(member.id),
      checkedInAt: attended.has(member.id) ? selectedSession.startedAt : null,
    })),
    canSave: management.status !== "finished",
  });
}

export function getDevStudyAttendeeIds(eventId: string) {
  const session = [...sessions, ...numberTheorySessions].find(
    (item) => item.eventId === eventId,
  );
  return session ? getDevActivityAttendeeIds(session.activityId) : [];
}

export function saveDevStudyAttendance(eventId: string, attendeeIds: string[]) {
  const session = [...sessions, ...numberTheorySessions].find(
    (item) => item.eventId === eventId,
  );
  if (!session) return;
  replaceDevActivityAttendees(session.activityId, attendeeIds);
  sessions = sessions.map((item) =>
    item.eventId === eventId
      ? { ...item, attendanceCount: attendeeIds.length }
      : item,
  );
  numberTheorySessions = numberTheorySessions.map((item) =>
    item.eventId === eventId
      ? { ...item, attendanceCount: attendeeIds.length }
      : item,
  );
}

export function getDevStudyCheckInEvent(pathId: string, attendCode: string) {
  const candidates = [
    ...sessions.map((session) => ({ session, studyId: DEV_STUDY_ID })),
    ...numberTheorySessions.map((session) => ({
      session,
      studyId: "study-number-theory-1",
    })),
  ];
  const match = candidates.find(
    ({ session }) =>
      session.attendancePath === `/events/${pathId}/${attendCode}`,
  );
  if (!match) return null;
  const study = getDevStudyManagementData(match.studyId);
  const event: CheckInEvent = {
    id: match.session.eventId,
    title: `${study.title} ${match.session.title}`,
    date: match.session.startedAt,
    type: "스터디",
    status:
      match.session.status === "cancelled" ? "expired" : match.session.status,
    pathId,
    attendCode,
  };
  return clone({
    event,
    context: {
      studyTitle: study.title,
      sessionTitle: match.session.title,
      semester: study.semester,
    },
  });
}

export function recordDevStudyCheckIn(
  eventId: string,
  member: {
    id: string;
    name: string;
    department: string;
    email: string;
  },
) {
  const session = [...sessions, ...numberTheorySessions].find(
    (item) => item.eventId === eventId,
  );
  if (!session || session.status !== "active") return null;
  const result = enqueueDevAttendance({ eventId, member });
  return result ? ({ isNew: result.isNew } as const) : null;
}
