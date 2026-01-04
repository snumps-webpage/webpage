/**
 * Service for sending automated alerts from the Admin account via Google's Gmail API.
 */
import { env } from '$env/dynamic/private';

/**
 * Exchanges the ADMIN_REFRESH_TOKEN for a fresh Access Token.
 * This allows the server to send emails from the preset admin account 
 * without requiring the admin to be currently logged in.
 */
async function getAdminAccessToken(): Promise<string> {
	const refreshToken = env.ADMIN_REFRESH_TOKEN;
	const clientId = env.GOOGLE_CLIENT_ID;
	const clientSecret = env.GOOGLE_CLIENT_SECRET;

	if (!refreshToken || !clientId || !clientSecret) {
		throw new Error('Missing admin email credentials in .env');
	}

	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refreshToken,
			grant_type: 'refresh_token'
		})
	});

	if (!response.ok) {
		const errorText = await response.text();
		if (errorText.includes('invalid_grant')) {
			console.error('CRITICAL: ADMIN_REFRESH_TOKEN has expired or is invalid. Please generate a new one using Google OAuth Playground.');
		}
		throw new Error(`Failed to refresh admin access token: ${errorText}`);
	}

	const data = await response.json();
	return data.access_token;
}

/**
 * Sends an email notification to admins about a new member signup.
 * Sent FROM the admin account TO the admin emails.
 */
export async function sendSignupNotification(applicantName: string) {
	try {
		const accessToken = await getAdminAccessToken();
		const adminEmails = (env.ADMINS_EMAILS || '').split(',').map((e) => e.trim());
		if (adminEmails.length === 0) return;

		const subject = `[SNUMPS] 새 회원 가입 신청: ${applicantName}`;
		const body = `안녕하세요, 관리자님.\n\n새로운 회원 가입 신청이 접수되었습니다.\n\n신청자 이름: ${applicantName}\n\n관리자 페이지에서 확인 후 승인해주세요.`;

		await dispatchEmail(accessToken, adminEmails, subject, body);
	} catch (e) {
		console.error('Signup notification error:', e);
	}
}

/**
 * Sends an email notification to admins about a completed attendance request.
 * Sent FROM the admin account TO the admin emails.
 */
export async function sendAttendanceNotification(userName: string, eventName: string) {
	try {
		const accessToken = await getAdminAccessToken();
		const adminEmails = (env.ADMINS_EMAILS || '').split(',').map((e) => e.trim());
		if (adminEmails.length === 0) return;

		const subject = `[SNUMPS] 출석 승인 요청: ${userName} - ${eventName}`;
		const body = `안녕하세요, 관리자님.\n\n${userName}님이 '${eventName}' 이벤트에 대한 출석 승인을 요청했습니다.\n\n입실 및 퇴장 시간이 모두 기록되었으니, 관리자 페이지에서 확인 후 승인해주세요.`;

		await dispatchEmail(accessToken, adminEmails, subject, body);
	} catch (e) {
		console.error('Attendance notification error:', e);
	}
}

/**
 * Sends an email notification to a user about their seminar application status.
 */
export async function sendSeminarStatusNotification(
	recipientEmail: string, 
	recipientName: string, 
	seminarTitle: string, 
	status: 'approved' | 'rejected'
) {
	try {
		const accessToken = await getAdminAccessToken();
		const subject = `[SNUMPS] 세미나 신청 결과 안내: ${seminarTitle}`;
		const statusText = status === 'approved' ? '승인' : '반려';
		const body = `안녕하세요, ${recipientName}님.\n\n신청하신 세미나 '${seminarTitle}'가 ${statusText}되었습니다.\n\n${status === 'approved' ? '자세한 일정의 확인 부탁드립니다.' : '아쉽게도 이번 세미나는 개설이 어렵게 되었습니다.'}\n\n감사합니다.`;

		await dispatchEmail(accessToken, [recipientEmail], subject, body);
	} catch (e) {
		console.error('Seminar status notification error:', e);
	}
}

/**
 * Sends an email notification to admins about a new seminar application.
 */
export async function sendSeminarApplicationNotification(applicantName: string, seminarTitle: string) {
	try {
		const accessToken = await getAdminAccessToken();
		const adminEmails = (env.ADMINS_EMAILS || '').split(',').map((e) => e.trim());
		if (adminEmails.length === 0) return;

		const subject = `[SNUMPS] 새 세미나 신청: ${seminarTitle}`;
		const body = `안녕하세요, 관리자님.\n\n${applicantName}님으로부터 새로운 세미나 개설 신청이 접수되었습니다.\n\n주제: ${seminarTitle}\n\n관리자 페이지에서 확인 후 승인 또는 반려해주세요.`;

		await dispatchEmail(accessToken, adminEmails, subject, body);
	} catch (e) {
		console.error('Seminar application notification error:', e);
	}
}

/**
 * Sends a welcome email to a new member upon acceptance.
 */
export async function sendWelcomeEmail(recipientEmail: string, recipientName: string) {
	try {
		console.log(`Attempting to send welcome email to ${recipientName} (${recipientEmail})...`);
		const accessToken = await getAdminAccessToken();
		const subject = `[SNUMPS] 가입이 승인되었습니다!`;
		const body = `안녕하세요, ${recipientName}님!\n\nSNUMPS 가입 신청이 성공적으로 승인되었습니다. 동아리의 일원이 되신 것을 진심으로 환영합니다.\n\n앞으로의 활동을 위해 아래의 단톡방에 입장해 주세요:\n동아리 단톡방 링크: https://chat.placeholder.link (비밀번호: snumps)\n\n감사합니다.`;

		await dispatchEmail(accessToken, [recipientEmail], subject, body);
	} catch (e) {
		console.error('Welcome email error:', e);
	}
}

/**
 * Internal helper to send the actual RFC 2822 email via Gmail API.
 */
async function dispatchEmail(accessToken: string, recipients: string[], subject: string, body: string) {
	const message = [
		`To: ${recipients.join(', ')}`,
		`Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`, 
		'Content-Type: text/plain; charset="utf-8"',
		'',
		body
	].join('\r\n');

	const encodedMessage = Buffer.from(message)
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

	const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ raw: encodedMessage })
	});

	if (!response.ok) {
		const err = await response.json();
		console.error('Google Gmail API Send Error:', JSON.stringify(err, null, 2));
		throw new Error('Gmail API failure');
	}
}
