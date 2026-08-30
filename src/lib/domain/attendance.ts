import { z } from "zod";

export const MANAGED_EVENT_STATUSES = [
  "draft",
  "active",
  "expired",
  "cancelled",
] as const;
export type ManagedEventStatus = (typeof MANAGED_EVENT_STATUSES)[number];

export interface CheckInEvent {
  id: string;
  title: string;
  date: string;
  type: string;
  status: "draft" | "active" | "expired";
  pathId: string;
  attendCode: string;
}

export interface PresenterEventSummary {
  id: string;
  seminarId: string;
  activityId: string;
  title: string;
  kind: "regular" | "irregular";
  startsAt: string;
  endsAt: string | null;
  location: string;
  status: ManagedEventStatus;
  attendancePath: string;
  applicantCount: number;
  attendanceCount: number;
}

export interface PresenterEventApplicant {
  id: string;
  name: string;
  department: string;
  attended: boolean;
  checkedInAt: string | null;
}

export interface PresenterEventManagementData {
  events: PresenterEventSummary[];
  selectedEvent: PresenterEventSummary;
  applicants: PresenterEventApplicant[];
  nonApplicantAttendanceCount: number;
  canSave: boolean;
  generatedAt: string;
}

export type PresenterAttendanceOperationResult = {
  success: true;
  operation: "presenterAttendanceSaved";
  eventId: string;
  applicantAttendeeIds: string[];
  totalAttendanceCount: number;
};

export const managedEventIdSchema = z.string().trim().min(1);

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
