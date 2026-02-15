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
 * If no date is provided, defaults to current time.
 */
export function getSemesterInfo(date?: Date): SemesterInfo {
  if (!date) date = new Date();

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
