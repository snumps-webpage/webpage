/**
 * 발송 지점 어댑터 (S10) — 서비스가 부르는 함수 시그니처를 유지하면서
 * 내부는 전부 이벤트 emit으로 위임한다. 무엇을 누구에게 보낼지는
 * mail-rules(관리자 편집) × mail-templates가 결정한다.
 */
import { emitMailEvent } from "./dispatch";

/**
 * Sends an email notification to admins about a new member signup.
 */
export async function sendSignupNotification(applicantName: string) {
  await emitMailEvent("application.submitted", { applicantName });
}

/**
 * Sends an email notification to admins about a completed attendance request.
 */
export async function sendAttendanceNotification(userName: string, eventName: string) {
  await emitMailEvent("attendance.requested", { userName, eventName });
}

/**
 * Sends an email notification to a user about their seminar application status.
 */
export async function sendSeminarStatusNotification(
  recipientEmail: string,
  recipientName: string,
  seminarTitle: string,
  status: "approved" | "rejected",
) {
  await emitMailEvent(
    status === "approved" ? "seminar-request.approved" : "seminar-request.rejected",
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
) {
  await emitMailEvent(
    status === "approved" ? "study-request.approved" : "study-request.rejected",
    { name: recipientName, title: studyTitle },
    { partyEmail: recipientEmail },
  );
}

/**
 * Membership application rejection notice (review M4) — sent BEFORE the row
 * (the only copy of the address) is removed.
 */
export async function sendApplicationRejectedEmail(
  recipientEmail: string,
  recipientName: string,
) {
  await emitMailEvent(
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
) {
  await emitMailEvent("seminar-request.submitted", { applicantName, title: seminarTitle });
}

/**
 * Notifies admins of a new study proposal (STU-01).
 */
export async function sendStudyApplicationNotification(
  applicantName: string,
  studyTitle: string,
) {
  await emitMailEvent("study-request.submitted", { applicantName, title: studyTitle });
}

/**
 * Sends a welcome email to a new member upon acceptance.
 */
export async function sendWelcomeEmail(recipientEmail: string, recipientName: string) {
  await emitMailEvent("application.approved", { name: recipientName }, {
    partyEmail: recipientEmail,
  });
}
