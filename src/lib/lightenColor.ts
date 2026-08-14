/**
 * Blend a hex color toward white by `amount` (0–1). Used to render "ghost"
 * route lines as a pale tint at full opacity rather than as a translucent
 * overlay — that way stacked/overlapping ghost lines don't darken each other
 * the way alpha compositing does. Accepts a leading `#`, bare hex, 3-digit
 * shorthand, or empty string (treated as black).
 */
export function lightenColor(hex: string, amount: number): string {
  let clean = hex.replace(/^#/, "");
  // Expand 3-digit hex shorthand (e.g. "000" → "000000").
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  // Pad short or empty strings to 6 digits (treats "" as black).
  if (clean.length < 6) {
    clean = clean.padEnd(6, "0");
  }
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  const t = Math.max(0, Math.min(1, amount));
  const lr = Math.round(r + (255 - r) * t);
  const lg = Math.round(g + (255 - g) * t);
  const lb = Math.round(b + (255 - b) * t);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}
