/**
 * Converts a GTFS 24-hour time string to a human-readable 12-hour time.
 *
 * GTFS allows times past midnight to be expressed with hours ≥ 24
 * (e.g. "25:30:00" means 1:30 AM on the following calendar day).
 * This function handles those values correctly.
 *
 * ```
 * formatGTFSTime("08:05:00") // → "8:05 AM"
 * formatGTFSTime("13:00:00") // → "1:00 PM"
 * formatGTFSTime("00:00:00") // → "12:00 AM"
 * formatGTFSTime("12:00:00") // → "12:00 PM"
 * formatGTFSTime("28:00:00") // → "4:00 AM"
 * ```
 */
export function formatGTFSTime(gtfsTime: string): string {
  const [hStr, mStr] = gtfsTime.split(":");
  const totalHours = parseInt(hStr, 10);
  const minutes = parseInt(mStr, 10);

  // Normalise hours that exceed 23 (post-midnight GTFS convention).
  const hour24 = totalHours % 24;

  const period = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 || 12; // 0 → 12 (midnight), 12 stays 12
  const minuteStr = String(minutes).padStart(2, "0");

  return `${hour12}:${minuteStr} ${period}`;
}
