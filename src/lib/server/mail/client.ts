/**
 * Infrastructure layer for the Mail service.
 * Handles OAuth2 token management and raw Gmail API calls.
 */
import { env } from "$env/dynamic/private";

let cachedAccessToken: string | null = null;
let tokenExpiry = 0;

/**
 * Exchanges the ADMIN_REFRESH_TOKEN for a fresh Access Token.
 */
export async function getAdminAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && tokenExpiry > now) {
    return cachedAccessToken;
  }

  const refreshToken = env.ADMIN_REFRESH_TOKEN;
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;

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
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh admin access token: ${errorText}`);
  }

  const data = await response.json();
  cachedAccessToken = data.access_token;
  tokenExpiry = now + (data.expires_in - 300) * 1000;

  return data.access_token;
}

/**
 * Internal helper to send the actual RFC 2822 email via Gmail API.
 */
export async function dispatchEmail(
  accessToken: string,
  recipients: string[],
  subject: string,
  body: string,
) {
  const message = [
    `To: ${recipients.join(", ")}`,
    `Subject: =?utf-8?B?${Buffer.from(subject).toString("base64")}?=`,
    'Content-Type: text/plain; charset="utf-8"',
    "",
    body,
  ].join("\r\n");

  const encodedMessage = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodedMessage }),
    },
  );

  if (!response.ok) {
    const err = await response.json();
    console.error("Google Gmail API Send Error:", JSON.stringify(err, null, 2));
    throw new Error("Gmail API failure");
  }
}
