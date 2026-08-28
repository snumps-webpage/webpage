/**
 * Business logic layer for the Mail service.
 * Defines specific notification types and their content.
 */
import { env } from "$env/dynamic/private";
import { CHATROOM_NOTICE_LINK, CHATROOM_CHAT_LINK } from "../../constants";
import { getAdminAccessToken, dispatchEmail } from "./client";

/**
 * Helper to get admin emails from environment.
 */
function getAdminEmails(): string[] {
  return (env.ADMINS_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * Sends an email notification to admins about a new member signup.
 */
export async function sendSignupNotification(applicantName: string) {
  try {
    const accessToken = await getAdminAccessToken();
    const adminEmails = getAdminEmails();
    if (adminEmails.length === 0) return;

    const subject = `[SNUMPS] 새 회원 가입 신청: ${applicantName}`;
    const body = `안녕하세요, 관리자님.

새로운 회원 가입 신청이 접수되었습니다.

신청자 이름: ${applicantName}

관리자 페이지에서 확인 후 승인해주세요.`;

    await dispatchEmail(accessToken, adminEmails, subject, body);
  } catch (e) {
    console.error("Signup notification error:", e);
  }
}

/**
 * Sends an email notification to admins about a completed attendance request.
 */
export async function sendAttendanceNotification(
  userName: string,
  eventName: string,
) {
  try {
    const accessToken = await getAdminAccessToken();
    const adminEmails = getAdminEmails();
    if (adminEmails.length === 0) return;

    const subject = `[SNUMPS] 출석 승인 요청: ${userName} - ${eventName}`;
    const body = `안녕하세요, 관리자님.

${userName}님이 '${eventName}' 이벤트에 대한 출석 승인을 요청했습니다.

입실 및 퇴장 시간이 모두 기록되었으니, 관리자 페이지에서 확인 후 승인해주세요.`;

    await dispatchEmail(accessToken, adminEmails, subject, body);
  } catch (e) {
    console.error("Attendance notification error:", e);
  }
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
  try {
    const accessToken = await getAdminAccessToken();
    const subject = `[SNUMPS] 세미나 신청 결과 안내: ${seminarTitle}`;
    const statusText = status === "approved" ? "승인" : "반려";
    const body = `안녕하세요, ${recipientName}님.

신청하신 세미나 '${seminarTitle}'가 ${statusText}되었습니다.

${status === "approved" ? "자세한 일정의 확인 부탁드립니다." : "아쉽게도 이번 세미나는 개설이 어렵게 되었습니다."}

감사합니다.`;

    await dispatchEmail(accessToken, [recipientEmail], subject, body);
  } catch (e) {
    console.error("Seminar status notification error:", e);
  }
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
  try {
    const accessToken = await getAdminAccessToken();
    const subject = `[SNUMPS] 스터디 개설 신청 결과 안내: ${studyTitle}`;
    const statusText = status === "approved" ? "승인" : "반려";
    const body = `안녕하세요, ${recipientName}님.

신청하신 스터디 '${studyTitle}'가 ${statusText}되었습니다.

${
  status === "approved"
    ? "홈페이지의 스터디 관리 페이지에서 인원과 회차를 관리할 수 있습니다."
    : "아쉽게도 이번 스터디는 개설이 어렵게 되었습니다."
}

감사합니다.`;

    await dispatchEmail(accessToken, [recipientEmail], subject, body);
  } catch (e) {
    console.error("Study status notification error:", e);
  }
}

/**
 * Membership application rejection notice (review M4) — sent BEFORE the row
 * (the only copy of the address) is removed.
 */
export async function sendApplicationRejectedEmail(
  recipientEmail: string,
  recipientName: string,
) {
  try {
    const accessToken = await getAdminAccessToken();
    const subject = `[SNUMPS] 가입 신청 결과 안내`;
    const body = `안녕하세요, ${recipientName}님.

서울대학교 수학문제연구회 가입 신청 검토 결과, 아쉽게도 이번에는 함께하지 못하게 되었습니다.

문의 사항이 있으시면 회신으로 알려주세요. 감사합니다.`;

    await dispatchEmail(accessToken, [recipientEmail], subject, body);
  } catch (e) {
    console.error("Application rejection notification error:", e);
  }
}

/**
 * Sends an email notification to admins about a new seminar application.
 */
export async function sendSeminarApplicationNotification(
  applicantName: string,
  seminarTitle: string,
) {
  try {
    const accessToken = await getAdminAccessToken();
    const adminEmails = getAdminEmails();
    if (adminEmails.length === 0) return;

    const subject = `[SNUMPS] 새 세미나 신청: ${seminarTitle}`;
    const body = `안녕하세요, 관리자님.

${applicantName}님으로부터 새로운 세미나 개설 신청이 접수되었습니다.

주제: ${seminarTitle}

관리자 페이지에서 확인 후 승인 또는 반려해주세요.`;

    await dispatchEmail(accessToken, adminEmails, subject, body);
  } catch (e) {
    console.error("Seminar application notification error:", e);
  }
}

/**
 * Notifies admins of a new study proposal (STU-01).
 */
export async function sendStudyApplicationNotification(
  applicantName: string,
  studyTitle: string,
) {
  try {
    const accessToken = await getAdminAccessToken();
    const adminEmails = getAdminEmails();
    if (adminEmails.length === 0) return;

    const subject = `[SNUMPS] 새 스터디 개설 신청: ${studyTitle}`;
    const body = `안녕하세요, 관리자님.

${applicantName}님으로부터 새로운 스터디 개설 신청이 접수되었습니다.

분야: ${studyTitle}

관리자 페이지에서 확인 후 승인 또는 반려해주세요.`;

    await dispatchEmail(accessToken, adminEmails, subject, body);
  } catch (e) {
    console.error("Study application notification error:", e);
  }
}

/**
 * Sends a welcome email to a new member upon acceptance.
 */
export async function sendWelcomeEmail(
  recipientEmail: string,
  recipientName: string,
) {
  try {
    const accessToken = await getAdminAccessToken();
    const subject = `[SNUMPS] 가입이 승인되었습니다!`;
    const body = `안녕하세요, ${recipientName}님!

수학문제연구회 가입을 축하드립니다!

동아리 카카오톡 채팅방은 다음과 같습니다.
- 공지방 : ${CHATROOM_NOTICE_LINK}
- 잡담방 : ${CHATROOM_CHAT_LINK}

공지방에서는 채팅을 자제하시고, 문의 사항은 잡담방이나 회장을 통해 알려주세요. 동아리의 모든 자료와 가이드라인은 공식 노션(https://snumps.notion.site)에서 확인할 수 있습니다. 수학문제연구회에 오신 것을 환영합니다.`;

    await dispatchEmail(accessToken, [recipientEmail], subject, body);
  } catch (e) {
    console.error(
      `[Mail] Failed to send welcome email to ${recipientEmail}:`,
      e,
    );
  }
}
