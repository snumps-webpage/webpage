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

${status === "approved" ? "세부 일정은 발표자와 조율한 뒤 공식 웹사이트에 게시합니다. 일정이 확정되거나 이후 변경되면 별도 안내 메일을 보내드립니다." : "아쉽게도 이번 세미나는 개설이 어렵게 되었습니다."}

감사합니다.`;

    await dispatchEmail(accessToken, [recipientEmail], subject, body);
  } catch (e) {
    console.error("Seminar status notification error:", e);
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

공지방에서는 채팅을 자제하시고, 문의 사항은 잡담방이나 회장을 통해 알려주세요. 동아리의 자료와 가이드라인은 공식 웹사이트에서 확인할 수 있습니다. 수학문제연구회에 오신 것을 환영합니다.`;

    await dispatchEmail(accessToken, [recipientEmail], subject, body);
  } catch (e) {
    console.error(
      `[Mail] Failed to send welcome email to ${recipientEmail}:`,
      e,
    );
  }
}
