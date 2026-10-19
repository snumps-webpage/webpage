/**
 * Infrastructure layer for the Mail service.
 * Handles OAuth2 token management and raw Gmail API calls.
 */
import { env } from "$env/dynamic/private";
import { isSingleAddress } from "./address";

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
 * An address header folded between addresses (RFC 5322 §2.2.3) so no line
 * passes 78 characters unless one address alone does — a 400-recipient Bcc
 * batch (snumps-webpage/D-000165) is about 10KB, far past the 998-character
 * line limit (§2.1.1, D-000225).
 */
export function foldAddressHeader(name: string, addresses: string[]): string {
  const lines: string[] = [];
  let line = `${name}:`;
  addresses.forEach((address, i) => {
    const piece = ` ${address}${i < addresses.length - 1 ? "," : ""}`;
    if (line.length + piece.length > 78 && line.trim() !== `${name}:`) {
      lines.push(line);
      line = "";
    }
    line += piece;
  });
  lines.push(line);
  return lines.join("\r\n");
}

/**
 * Internal helper to send the actual RFC 2822 email via Gmail API.
 */
export async function dispatchEmail(
  accessToken: string,
  recipients: string[],
  subject: string,
  body: string,
  opts?: { bcc?: boolean },
) {
  // Header lines are joined raw below: a recipient carrying CR/LF, a comma or
  // a display name would add headers or recipients of its own (audit
  // LB10-1). Every recipient must be exactly one plain address.
  const bad = recipients.find((r) => !isSingleAddress(r));
  if (bad !== undefined) throw new Error("invalid mail recipient");

  // Bcc mode is MANDATORY for any all-member send (API-SPEC §5-7): a To:
  // list would expose every member's address to every other member.
  // Bcc-only messages carry no To: at all. The empty group
  // `To: undisclosed-recipients:;` (review low-15) is refused by the Gmail
  // API with 400 "Invalid To header", so every all-member send failed
  // (live probe 2026-10-17, snumps-webpage/D-000143).
  const recipientHeader = foldAddressHeader(
    opts?.bcc ? "Bcc" : "To",
    recipients,
  );
  const message = [
    recipientHeader,
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

const UPLOAD_SEND_URL =
  "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media";

/** Gmail refused the send because a sending quota is exhausted. */
export class GmailQuotaError extends Error {
  constructor(reason = "") {
    super(`Gmail quota exceeded${reason ? `: ${reason}` : ""}`);
    this.name = "GmailQuotaError";
  }
}

/** Gmail refused the send for any other reason. */
export class GmailSendError extends Error {
  constructor(
    public status: number,
    public reason: string,
  ) {
    super(`Gmail send failed (${status}${reason ? `: ${reason}` : ""})`);
    this.name = "GmailSendError";
  }
}

const QUOTA_REASONS = new Set([
  "rateLimitExceeded",
  "dailyLimitExceeded",
  "quotaExceeded",
  "userRateLimitExceeded",
]);

/**
 * Uploads an already-built RFC 822 message untouched (.eml broadcast). Quota
 * failures are told apart so the caller can stop the run; the response body
 * is never logged and nothing is retried (D-000110).
 */
export async function dispatchRaw(
  accessToken: string,
  raw: Buffer,
): Promise<void> {
  const res = await fetch(UPLOAD_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "message/rfc822",
    },
    // Buffer is a Uint8Array at runtime; the DOM lib types reject its
    // ArrayBufferLike backing, so cast instead of copying up to 25 MB.
    body: raw as Uint8Array<ArrayBuffer>,
  });
  if (res.ok) return;
  const reason = await res.json().then(
    (j) => j?.error?.errors?.[0]?.reason ?? "",
    () => "",
  );
  if (res.status === 429 || QUOTA_REASONS.has(reason))
    throw new GmailQuotaError(reason);
  throw new GmailSendError(res.status, reason);
}
