/**
 * Service for sending emails via Google's Gmail API using a user's access token.
 */
import { env } from '$env/dynamic/private';

export async function sendSignupNotification(accessToken: string, applicantName: string) {
	const adminEmails = (env.ADMINS_EMAILS || '').split(',').map((e) => e.trim());
	if (adminEmails.length === 0) return;

	// Create RFC 2822 email
	const subject = `[SNUMPS] 새 회원 가입 신청: ${applicantName}`;
	const body = `안녕하세요, 관리자님.\n\n새로운 회원 가입 신청이 접수되었습니다.\n\n신청자 이름: ${applicantName}\n\n관리자 페이지에서 확인 후 승인해주세요.`;

	const message = [
		`To: ${adminEmails.join(', ')}`,
		`Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`, 
		'Content-Type: text/plain; charset="utf-8"',
		'',
		body
	].join('\r\n');

	// Encode to base64url
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
		body: JSON.stringify({
			raw: encodedMessage
		})
	});

	if (!response.ok) {
		const error = await response.json();
		console.error('Failed to send email notification:', error);
		// We don't throw error here to not break the signup process itself
	}
}

export async function sendAttendanceNotification(accessToken: string, userName: string, eventName: string) {
	const adminEmails = (env.ADMINS_EMAILS || '').split(',').map((e) => e.trim());
	if (adminEmails.length === 0) return;

	const subject = `[SNUMPS] 출석 승인 요청: ${userName} - ${eventName}`;
	const body = `안녕하세요, 관리자님.\n\n${userName}님이 '${eventName}' 이벤트에 대한 출석 승인을 요청했습니다.\n\n입실 및 퇴장 시간이 모두 기록되었으니, 관리자 페이지에서 확인 후 승인해주세요.`;

	const message = [
		`To: ${adminEmails.join(', ')}`,
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
		body: JSON.stringify({
			raw: encodedMessage
		})
	});

	if (!response.ok) {
		const error = await response.json();
		console.error('Failed to send attendance notification:', error);
	}
}
