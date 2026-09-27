/**
 * Shared helpers: SNU Google display names and phone formatting. (Terms live
 * in $lib/domain/term.)
 */

/**
 * Parses info from the SNU Google account name format: "Name / Status / Dept"
 */
export function parseGoogleName(rawName?: string | null) {
  const parts = (rawName || "").split("/").map((p) => p.trim());
  return {
    name: parts[0] || "",
    status: parts[1] || "",
    department: parts[2] || "",
  };
}

/**
 * Display form of a stored phone. The Notion archive kept a few numbers as bare
 * "010XXXXXXXX"; that one shape is hyphenated, anything else is shown as stored.
 */
export function formatPhoneForDisplay(phone: string): string {
  return /^010\d{8}$/.test(phone)
    ? `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`
    : phone;
}

/**
 * Normalizes phone numbers to 010-XXXX-XXXX format.
 * Accepts: 010XXXXXXXX, 010-XXXX-XXXX, 010 XXXX XXXX, etc.
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return phone; // Return as-is if it doesn't match expected length
}
