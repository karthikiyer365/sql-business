/**
 * True when two results hold the same rows. Column names are ignored, numbers compare to 2 decimals,
 * and row order is ignored unless the part asks for it.
 * @param {{ columns: string[], rows: unknown[][] }} a
 * @param {{ columns: string[], rows: unknown[][] }} b
 */
export function sameResult(a, b, ordered = false) {
  return a.columns.length === b.columns.length && canon(a.rows, ordered) === canon(b.rows, ordered);
}

function canon(rows, ordered) {
  const lines = rows.map(row => JSON.stringify(row.map(v => typeof v === 'number' ? Math.round(v * 100) / 100 : v)));
  if (!ordered) lines.sort();
  return lines.join('\n');
}
