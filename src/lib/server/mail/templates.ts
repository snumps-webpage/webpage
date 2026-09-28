/**
 * 발송 지점 어댑터 (S10) — 서비스가 부르는 함수 시그니처를 유지하면서
 * 내부는 전부 이벤트 emit으로 위임한다. 무엇을 누구에게 보낼지는
 * mail-rules(관리자 편집) × mail-templates가 결정한다.
 *
 * 모두 emitMailEvent의 결과(false = 실패, 로그 남김)를 그대로 돌려준다
 * (#16, LB14-1). 관리자 심사 액션은 이를 `mailFailed`로 화면에 올리고,
 * 회원 쪽 호출부(가입·신청·출석)는 무시해도 된다 — 메일은 동작을 막지 않는다.
 */
import { emitMailEvent } from "./dispatch";

/**
 * Sends an email notification to admins about a new member signup.
 */
export async function sendSignupNotification(
  applicantName: string,
): Promise<boolean> {
  return emitMailEvent("application.submitted", { applicantName });
}

/**
 * Sends an email notification to admins about a completed attendance request.
 */
export async function sendAttendanceNotification(
  userName: string,
  eventName: string,
): Promise<boolean> {
  return emitMailEvent("attendance.requested", { userName, eventName });
}

/**
 * Sends an email notification to a user about their seminar application status.
 */
export async function sendSeminarStatusNotification(
  recipientEmail: string,
  recipientName: string,
  seminarTitle: string,
  status: "approved" | "rejected",
): Promise<boolean> {
  return emitMailEvent(
    status === "approved"
      ? "seminar-request.approved"
      : "seminar-request.rejected",
    { name: recipientName, title: seminarTitle },
    { partyEmail: recipientEmail },
  );
}

/**
 * Study proposal result — the study counterpart of the seminar notice (review C2).
 */
export async function sendStudyStatusNotification(
  recipientEmail: string,
  recipientName: string,
  studyTitle: string,
  status: "approved" | "rejected",
): Promise<boolean> {
  return emitMailEvent(
    status === "approved" ? "study-request.approved" : "study-request.rejected",
    { name: recipientName, title: studyTitle },
    { partyEmail: recipientEmail },
  );
}

/**
 * Membership application rejection notice (review M4) — sent AFTER the row
 * (the only copy of the address) is removed, to the address the removal
 * returned; a false result is the admin's only chance to notice (LB14-1).
 */
export async function sendApplicationRejectedEmail(
  recipientEmail: string,
  recipientName: string,
): Promise<boolean> {
  return emitMailEvent(
    "application.rejected",
    { name: recipientName },
    { partyEmail: recipientEmail },
  );
}

/**
 * Sends an email notification to admins about a new seminar application.
 */
export async function sendSeminarApplicationNotification(
  applicantName: string,
  seminarTitle: string,
): Promise<boolean> {
  return emitMailEvent("seminar-request.submitted", {
    applicantName,
    title: seminarTitle,
  });
}

/**
 * Notifies admins of a new study proposal (STU-01).
 */
export async function sendStudyApplicationNotification(
  applicantName: string,
  studyTitle: string,
): Promise<boolean> {
  return emitMailEvent("study-request.submitted", {
    applicantName,
    title: studyTitle,
  });
}

/**
 * Sends a welcome email to a new member upon acceptance.
 */
export async function sendWelcomeEmail(
  recipientEmail: string,
  recipientName: string,
): Promise<boolean> {
  return emitMailEvent(
    "application.approved",
    { name: recipientName },
    {
      partyEmail: recipientEmail,
    },
  );
}
