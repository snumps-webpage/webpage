import { beforeEach, describe, expect, it } from "vitest";
import {
  createDevSeminarRequest,
  getDevAdminSeminarRequest,
  getDevAdminSeminarRequests,
  getDevSeminarRequest,
  getDevSeminarRequestsForMember,
  resetDevAdminSeminarRequests,
  resolveDevAdminSeminarRequest,
  updateDevSeminarRequest,
  withdrawDevSeminarRequest,
} from "./dev-admin-seminar-fixtures";

describe("dev admin seminar request queue", () => {
  beforeEach(resetDevAdminSeminarRequests);

  it("returns oldest pending requests first and resolves one idempotently", () => {
    const requests = getDevAdminSeminarRequests();
    expect(requests[0].createdAt <= requests[1].createdAt).toBe(true);
    expect(getDevAdminSeminarRequest(requests[0].id)).toEqual(requests[0]);
    expect(resolveDevAdminSeminarRequest(requests[0].id)).toBe(true);
    expect(resolveDevAdminSeminarRequest(requests[0].id)).toBe(false);
  });

  it("connects member submission, editing, withdrawal, and the admin queue", () => {
    const requester = {
      id: "dev-member",
      name: "Dev Member",
      department: "수리과학부",
    };
    const presenters = [requester];
    const request = createDevSeminarRequest({
      requester,
      presenters,
      values: {
        kind: "irregular",
        title: "새 세미나",
        description: "설명",
        prerequisites: "",
        duration: "60분",
        preferredTiming: "협의 후 결정",
        attachmentUrl: "https://example.com/plan.pdf",
        presenterIds: [requester.id],
      },
    });
    expect(getDevAdminSeminarRequest(request.id)?.title).toBe("새 세미나");
    expect(getDevSeminarRequestsForMember(requester.id)).toContainEqual(
      request,
    );

    const updated = updateDevSeminarRequest(
      request.id,
      { ...request, title: "수정한 세미나" },
      presenters,
    );
    expect(updated?.title).toBe("수정한 세미나");
    expect(updated?.attachmentUrl).toBe("https://example.com/plan.pdf");

    expect(withdrawDevSeminarRequest(request.id)).toBe(true);
    expect(getDevSeminarRequest(request.id)).toMatchObject({
      status: "withdrawn",
      canEdit: false,
    });
    expect(getDevAdminSeminarRequest(request.id)).toBeNull();
  });
});
