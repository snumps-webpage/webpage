import type { AdminSeminarRequestItem } from "$lib/domain/admin-seminars";
import type {
  MemberPickerItem,
  SeminarRequestInput,
  SeminarRequestItem,
  SeminarRequestStatus,
} from "$lib/domain/seminars";

interface DevSeminarRequestRecord extends Omit<
  AdminSeminarRequestItem,
  "canApprove" | "canReject"
> {
  status: SeminarRequestStatus;
}

function initialRequests(): DevSeminarRequestRecord[] {
  return [
    {
      id: "request-regular-1",
      kind: "regular",
      title: "조합론에서의 확률적 방법",
      description:
        "확률적 방법으로 존재성을 보이는 기본 아이디어와 대표 예제를 소개합니다.",
      prerequisites: "이산수학, 기초 확률론",
      duration: "90분",
      attachmentUrl: "https://drive.google.com/example-probability",
      presenters: [
        { id: "member-president", name: "김회장", department: "수리과학부" },
      ],
      requester: {
        id: "member-president",
        name: "김회장",
        department: "수리과학부",
      },
      createdAt: "2026-08-25T14:20:00+09:00",
      status: "pending",
    },
    {
      id: "request-irregular-1",
      kind: "irregular",
      title: "매듭 군과 코호몰로지",
      description:
        "매듭 불변량이 코호몰로지 이론과 만나는 지점을 짧은 계산으로 살펴봅니다.",
      prerequisites: "군론, 선형대수",
      duration: "60분",
      attachmentUrl: null,
      presenters: [
        { id: "member-editor", name: "이편집", department: "수리과학부" },
        { id: "dev-member", name: "Dev Member", department: "수리과학부" },
      ],
      requester: {
        id: "member-editor",
        name: "이편집",
        department: "수리과학부",
      },
      createdAt: "2026-08-27T11:05:00+09:00",
      status: "pending",
    },
    {
      id: "dashboard-seminar-request-topology",
      kind: "regular",
      title: "대수위상수학의 기본군과 피복공간",
      description:
        "기본군의 계산과 피복공간의 분류 정리를 구체적인 예제와 함께 살펴봅니다.",
      prerequisites: "점집합 위상수학의 연결성·콤팩트성",
      duration: "90분",
      attachmentUrl: "https://drive.google.com/example",
      presenters: [
        { id: "dev-member", name: "Dev Member", department: "수리과학부" },
        { id: "member-editor", name: "이편집", department: "수리과학부" },
      ],
      requester: {
        id: "dev-member",
        name: "Dev Member",
        department: "수리과학부",
      },
      createdAt: "2026-08-24T14:20:00+09:00",
      status: "pending",
    },
  ];
}

let requests = initialRequests();
const clone = <T>(value: T): T => structuredClone(value);

export function getDevAdminSeminarRequests() {
  return clone(
    requests
      .filter((request) => request.status === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((request) => ({
        id: request.id,
        kind: request.kind,
        title: request.title,
        description: request.description,
        prerequisites: request.prerequisites,
        duration: request.duration,
        attachmentUrl: request.attachmentUrl,
        presenters: request.presenters,
        requester: request.requester,
        createdAt: request.createdAt,
        canApprove: true,
        canReject: true,
      })),
  );
}

export function getDevAdminSeminarRequest(id: string) {
  return getDevAdminSeminarRequests().find((item) => item.id === id) ?? null;
}

export function resolveDevAdminSeminarRequest(
  id: string,
  status: Extract<SeminarRequestStatus, "approved" | "rejected"> = "approved",
) {
  const request = requests.find(
    (item) => item.id === id && item.status === "pending",
  );
  if (!request) return false;
  request.status = status;
  return true;
}

export function getDevSeminarRequest(id: string) {
  const request = requests.find((item) => item.id === id);
  if (!request) return null;
  return clone({
    id: request.id,
    kind: request.kind,
    title: request.title,
    description: request.description,
    prerequisites: request.prerequisites,
    duration: request.duration,
    attachmentUrl: request.attachmentUrl ?? "",
    presenterIds: request.presenters.map((presenter) => presenter.id),
    requesterId: request.requester.id,
    status: request.status,
    submittedAt: request.createdAt,
    canEdit: request.status === "pending",
    canWithdraw: request.status === "pending",
  } satisfies SeminarRequestItem);
}

export function getDevSeminarRequestsForMember(memberId: string) {
  return requests
    .filter((request) => request.requester.id === memberId)
    .map((request) => getDevSeminarRequest(request.id)!)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export function createDevSeminarRequest(input: {
  values: SeminarRequestInput;
  requester: AdminSeminarRequestItem["requester"];
  presenters: MemberPickerItem[];
}) {
  const request: DevSeminarRequestRecord = {
    id: `seminar-request-${crypto.randomUUID()}`,
    kind: input.values.kind,
    title: input.values.title,
    description: input.values.description,
    prerequisites: input.values.prerequisites,
    duration: input.values.duration,
    attachmentUrl: input.values.attachmentUrl || null,
    presenters: clone(input.presenters),
    requester: clone(input.requester),
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  requests = [...requests, request];
  return getDevSeminarRequest(request.id)!;
}

export function updateDevSeminarRequest(
  id: string,
  values: SeminarRequestInput,
  presenters: MemberPickerItem[],
) {
  const request = requests.find(
    (item) => item.id === id && item.status === "pending",
  );
  if (!request) return null;
  Object.assign(request, {
    kind: values.kind,
    title: values.title,
    description: values.description,
    prerequisites: values.prerequisites,
    duration: values.duration,
    attachmentUrl: values.attachmentUrl || null,
    presenters: clone(presenters),
  });
  return getDevSeminarRequest(id);
}

export function withdrawDevSeminarRequest(id: string) {
  const request = requests.find(
    (item) => item.id === id && item.status === "pending",
  );
  if (!request) return false;
  request.status = "withdrawn";
  return true;
}

export function resetDevAdminSeminarRequests() {
  requests = initialRequests();
}
