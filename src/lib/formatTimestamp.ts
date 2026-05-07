const PT = "America/Los_Angeles";

function isCurrentYear(date: Date): boolean {
  const year = new Intl.DateTimeFormat("en-US", {
    timeZone: PT,
    year: "numeric",
  }).format(date);
  const currentYear = new Intl.DateTimeFormat("en-US", {
    timeZone: PT,
    year: "numeric",
  }).format(new Date());
  return year === currentYear;
}

/**
 * Formats a POSIX-seconds timestamp as e.g. "May 6 at 12:30 PM" in Pacific Time.
 * Includes the year when the timestamp is not in the current year,
 * e.g. "May 6, 2025 at 12:30 PM".
 */
export function formatTimestamp(posixSeconds: number): string {
  const date = new Date(posixSeconds * 1000);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: PT,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: PT,
    month: "long",
    day: "numeric",
    ...(isCurrentYear(date) ? {} : { year: "numeric" }),
  }).format(date);
  return `${day} at ${time}`;
}

/**
 * Returns the date string in PT for a given POSIX-seconds timestamp, e.g. "May 6".
 * Includes the year when the timestamp is not in the current year, e.g. "May 6, 2025".
 * Used to compare whether two timestamps fall on the same day.
 */
export function getDateInPT(posixSeconds: number): string {
  const date = new Date(posixSeconds * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PT,
    month: "long",
    day: "numeric",
    ...(isCurrentYear(date) ? {} : { year: "numeric" }),
  }).format(date);
}

/**
 * Formats just the time portion of a POSIX-seconds timestamp in PT, e.g. "12:30 PM".
 */
export function formatTimeOnly(posixSeconds: number): string {
  const date = new Date(posixSeconds * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PT,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
