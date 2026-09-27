import { z } from "zod/v4";

export type PresenterAttendanceOperationResult = {
  success: true;
  operation: "presenterAttendanceSaved";
  eventId: string;
  applicantAttendeeIds: string[];
  totalAttendanceCount: number;
};

export const managedEventIdSchema = z
  .string()
  .trim()
  .min(1, "대상을 선택해 주세요.")
  .max(200, "대상 id를 확인해 주세요.");

export function mergeManagedAttendance(
  existingAttendeeIds: string[],
  submittedAttendeeIds: string[],
  managedMemberIds: string[],
) {
  const managed = new Set(managedMemberIds);
  const unknownMemberId = submittedAttendeeIds.find((id) => !managed.has(id));
  if (unknownMemberId) {
    return {
      success: false as const,
      error: "VALIDATION_FAILED" as const,
      unknownMemberId,
    };
  }

  const preserved = existingAttendeeIds.filter((id) => !managed.has(id));
  return {
    success: true as const,
    attendeeIds: [...new Set([...preserved, ...submittedAttendeeIds])],
  };
}
