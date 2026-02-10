/**
 * Shared utility functions for semester calculations and date formatting.
 */

export interface SemesterInfo {
  name: string; // e.g., "2025년 1학기"
  key: string; // e.g., "25-1"
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

/**
 * Calculates semester information based on a given date.
 * Academic Calendar:
 * - 1st Semester: March 1st - August 31st
 * - 2nd Semester: September 1st - February 28th (next year)
 *
 * If no date is provided, defaults to current time in Asia/Seoul.
 */
export function getSemesterInfo(date?: Date): SemesterInfo {
  // If no date provided, use current time in KST
  if (!date) {
    const now = new Date();
    const kstStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    }).format(now);
    date = new Date(kstStr);
  }

  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  if (month >= 3 && month <= 8) {
    return {
      name: `${year}년 1학기`,
      key: `${year % 100}-1`,
      startDate: `${year}-03-01`,
      endDate: `${year}-08-31`,
    };
  } else if (month >= 9) {
    return {
      name: `${year}년 2학기`,
      key: `${year % 100}-2`,
      startDate: `${year}-09-01`,
      endDate: `${year + 1}-02-28`,
    };
  } else {
    // Jan, Feb belong to the 2nd semester of the previous year
    return {
      name: `${year - 1}년 2학기`,
      key: `${(year - 1) % 100}-2`,
      startDate: `${year - 1}-09-01`,
      endDate: `${year}-02-28`,
    };
  }
}

/**
 * Derives a semester key (e.g. "25-1") from a date string.
 * Parses string directly to avoid timezone shifts.
 * Expected formats: "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm..."
 */
export function getSemesterKeyFromDate(dateStr: string): string {
  if (!dateStr) return "Unknown";

  // Simple string parsing to avoid timezone issues
  // Takes the "Wall Time" components from the string
  const parts = dateStr.split("T")[0].split("-");
  if (parts.length < 2) return "Unknown";

  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);

  if (month >= 3 && month <= 8) return `${year % 100}-1`;
  if (month >= 9) return `${year % 100}-2`;
  return `${(year - 1) % 100}-2`;
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

/**
 * Calculates the ISO 8601 string with the correct offset for a given wall time and timezone.
 * @param dateStr "YYYY-MM-DDTHH:mm" (Wall time)
 * @param timeZone IANA timezone string (e.g. "Asia/Seoul")
 * @returns ISO string with offset (e.g. "2024-01-01T10:00:00+09:00")
 */
export function getIsoStringWithOffset(
  dateStr: string,
  timeZone: string,
): string {
  // 1. Initial Guess: Treat as UTC to get a starting point
  let guess = new Date(dateStr + ":00Z");

  // Helper to get parts in target zone
  const getParts = (d: Date, tz: string) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
      timeZoneName: "longOffset",
    }).formatToParts(d);
    const p: Record<string, string> = {};
    parts.forEach((x) => (p[x.type] = x.value));
    return p;
  };

  // We iterate to find the UTC instant that corresponds to the target wall time
  for (let i = 0; i < 3; i++) {
    const parts = getParts(guess, timeZone);

    // Reconstruct wall time from parts
    const year = parseInt(parts.year);
    const month = parseInt(parts.month);
    const day = parseInt(parts.day);
    let hour = parseInt(parts.hour);
    if (hour === 24) hour = 0;
    const minute = parseInt(parts.minute);

    // Target components
    const [y, m, d_str] = dateStr.split("T")[0].split("-").map(Number);
    const [h, min] = dateStr.split("T")[1].split(":").map(Number);

    // Compare using UTC timestamps of the components
    const targetTs = Date.UTC(y, m - 1, d_str, h, min);
    const actualTs = Date.UTC(year, month - 1, day, hour, minute);

    const diff = targetTs - actualTs;

    if (diff === 0) {
      // Found it! Extract offset
      const offsetPart = parts.timeZoneName?.replace("GMT", "") || "+00:00";
      const iso = offsetPart === "GMT" ? "+00:00" : offsetPart;
      return dateStr + ":00" + iso;
    }

    // Apply difference
    guess = new Date(guess.getTime() + diff);
  }

  throw new Error(`Failed to calculate offset for ${dateStr} in ${timeZone}`);
}
