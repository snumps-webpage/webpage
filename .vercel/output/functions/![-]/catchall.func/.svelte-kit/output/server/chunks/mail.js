import { b as private_env } from "./shared-server.js";
import { C as CHATROOM_LINK, a as CHATROOM_PASSWORD } from "./constants.js";
async function getAdminAccessToken() {
  const refreshToken = private_env.ADMIN_REFRESH_TOKEN;
  const clientId = private_env.GOOGLE_CLIENT_ID;
  const clientSecret = private_env.GOOGLE_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("Missing admin email credentials in .env");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes("invalid_grant")) {
      console.error("CRITICAL: ADMIN_REFRESH_TOKEN has expired or is invalid. Please generate a new one using Google OAuth Playground.");
    }
    throw new Error(`Failed to refresh admin access token: ${errorText}`);
  }
  const data = await response.json();
  return data.access_token;
}
async function sendSignupNotification(applicantName) {
  try {
    const accessToken = await getAdminAccessToken();
    const adminEmails = (private_env.ADMINS_EMAILS || "").split(",").map((e) => e.trim());
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
async function sendAttendanceNotification(userName, eventName) {
  try {
    const accessToken = await getAdminAccessToken();
    const adminEmails = (private_env.ADMINS_EMAILS || "").split(",").map((e) => e.trim());
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
async function sendSeminarStatusNotification(recipientEmail, recipientName, seminarTitle, status) {
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
async function sendSeminarApplicationNotification(applicantName, seminarTitle) {
  try {
    const accessToken = await getAdminAccessToken();
    const adminEmails = (private_env.ADMINS_EMAILS || "").split(",").map((e) => e.trim());
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
async function sendWelcomeEmail(recipientEmail, recipientName) {
  try {
    console.log(`[Mail] Attempting welcome email: ${recipientName} (${recipientEmail})`);
    const accessToken = await getAdminAccessToken();
    const subject = `[SNUMPS] 가입이 승인되었습니다!`;
    const body = `안녕하세요, ${recipientName}님!

SNUMPS 가입 신청이 성공적으로 승인되었습니다. 동아리의 일원이 되신 것을 진심으로 환영합니다.

앞으로의 활동을 위해 아래의 단톡방에 입장해 주세요:
동아리 단톡방 링크: ${CHATROOM_LINK} (비밀번호: ${CHATROOM_PASSWORD})

감사합니다.`;
    await dispatchEmail(accessToken, [recipientEmail], subject, body);
    console.log(`[Mail] Welcome email sent to ${recipientEmail}`);
  } catch (e) {
    console.error(`[Mail] Failed to send welcome email to ${recipientEmail}:`, e);
  }
}
async function dispatchEmail(accessToken, recipients, subject, body) {
  console.log(`Dispatching email to: ${recipients.join(", ")}`);
  const message = [
    `To: ${recipients.join(", ")}`,
    `Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`,
    'Content-Type: text/plain; charset="utf-8"',
    "",
    body
  ].join("\r\n");
  const encodedMessage = Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw: encodedMessage })
  });
  if (!response.ok) {
    const err = await response.json();
    console.error("Google Gmail API Send Error:", JSON.stringify(err, null, 2));
    throw new Error("Gmail API failure");
  } else {
    console.log("Email successfully sent via Google API.");
  }
}
export {
  sendAttendanceNotification,
  sendSeminarApplicationNotification,
  sendSeminarStatusNotification,
  sendSignupNotification,
  sendWelcomeEmail
};
