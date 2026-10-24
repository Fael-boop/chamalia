/** Distinct, calm hues for telling professionals apart on the agenda (works on light and dark). */
const PALETTE = ["#2563eb", "#db2777", "#059669", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#65a30d"];

/**
 * One color per professional, stable while the team stays the same: ids are sorted and each gets
 * the next hue, so two people never share one (up to 8).
 */
export function professionalColors(ids: string[]): Map<string, string> {
  const sorted = [...new Set(ids)].sort();
  return new Map(sorted.map((id, index) => [id, PALETTE[index % PALETTE.length]!]));
}
