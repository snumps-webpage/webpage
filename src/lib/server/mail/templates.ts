/**
 * Business logic layer for the Mail service.
 * 문구는 전부 template-store(기본값=코드, 오버라이드=mail-templates 테이블 —
 * /admin/mail에서 편집)에서 온다. 여기는 수신자 결정과 발송만 담당한다.
 * render가 null이면 해당 메일이 관리자에 의해 꺼진 것 — 조용히 건너뛴다.
 */
import { env } from "$env/dynamic/private";
import { getAdminAccessToken, dispatchEmail } from "./client";
import { renderMailTemplate, type MailTemplateKey } from "./template-store";

/**
 * Helper to get admin emails from environment.
 */
function getAdminEmails(): string[] {
  return (env.ADMINS_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/** 공통 발송기 — 실패는 로그만 (메일은 본 동작을 절대 막지 않는다, §5-7). */
async function sendTemplated(
  key: MailTemplateKey,
  recipients: string[],
  vars: Record<string, string>,
): Promise<void> {
  try {
    if (recipients.length === 0) return;
    const rendered = await renderMailTemplate(key, vars);
    if (!rendered) return; // 관리자가 이 자동 메일을 꺼 둠
    const accessToken = await getAdminAccessToken();
    await dispatchEmail(accessToken, recipients, rendered.subject, rendered.body);
  } catch (e) {
    console.error(`[Mail] "${key}" send failed:`, e);
  }
}

/**
 * Sends an email notification to admins about a new member signup.
 */
export async function sendSignupNotification(applicantName: string) {
  await sendTemplated("signup-received", getAdminEmails(), { applicantName });
}

/**
 * Sends an email notification to admins about a completed attendance request.
 */
export async function sendAttendanceNotification(userName: string, eventName: string) {
  await sendTemplated("attendance-request", getAdminEmails(), { userName, eventName });
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
  await sendTemplated(
    status === "approved" ? "seminar-approved" : "seminar-rejected",
    [recipientEmail],
    { name: recipientName, title: seminarTitle },
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
  await sendTemplated(
    status === "approved" ? "study-approved" : "study-rejected",
    [recipientEmail],
    { name: recipientName, title: studyTitle },
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
  await sendTemplated("application-rejected", [recipientEmail], { name: recipientName });
}

/**
 * Sends an email notification to admins about a new seminar application.
 */
export async function sendSeminarApplicationNotification(
  applicantName: string,
  seminarTitle: string,
) {
  await sendTemplated("seminar-request-received", getAdminEmails(), {
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
) {
  await sendTemplated("study-request-received", getAdminEmails(), {
    applicantName,
    title: studyTitle,
  });
}

/**
 * Sends a welcome email to a new member upon acceptance.
 * (채팅방 링크는 template-store의 공용 변수로 주입된다.)
 */
export async function sendWelcomeEmail(recipientEmail: string, recipientName: string) {
  await sendTemplated("welcome", [recipientEmail], { name: recipientName });
}
