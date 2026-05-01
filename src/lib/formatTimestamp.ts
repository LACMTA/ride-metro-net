const PT = "America/Los_Angeles";

/**
 * Formats a POSIX-seconds timestamp as e.g. "12:30pm on May 6" in Pacific Time.
 */
export function formatTimestamp(posixSeconds: number): string {
  const date = new Date(posixSeconds * 1000);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: PT,
    hour: "numeric",
    minute: "2-digit",
  }).format(date); // 12:30 PM
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: PT,
    month: "long",
    day: "numeric",
  }).format(date); // "May 6"
  return `${day} at ${time}`;
}

/**
 * Returns the date string in PT for a given POSIX-seconds timestamp, e.g. "May 6".
 * Used to compare whether two timestamps fall on the same day.
 */
export function getDateInPT(posixSeconds: number): string {
  const date = new Date(posixSeconds * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PT,
    month: "long",
    day: "numeric",
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
