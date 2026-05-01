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
