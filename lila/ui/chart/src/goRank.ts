// LiGo (unit 5.6): the rating graph's kyu/dan axis, drawn from the server's rank table (ADR 0021 §3):
// the rating at the lower edge of each rank, 25k to 9d, so no copy of the rank curve lives here.

export type RankTable = [string, number][];

// the rank a whole rating shows: the last rank whose edge it reaches (25k below the first edge)
export function rankAt(table: RankTable, rating: number): string {
  let name = table[0][0];
  for (const [n, edge] of table) {
    if (Math.floor(rating) >= edge) name = n;
    else break;
  }
  return name;
}

/* The rank edges inside [min, max] as axis ticks, at most `maxTicks` of them, keeping every n-th
 * edge (counted from 25k, so the same ranks stay labelled as the view moves). */
export function rankTicks(table: RankTable, min: number, max: number, maxTicks = 7): number[] {
  const inside = table.map((e, i) => [e[1], i]).filter(([edge]) => edge >= min && edge <= max);
  const every = Math.max(1, Math.ceil(inside.length / maxTicks));
  return inside.filter(([, i]) => i % every === 0).map(([edge]) => edge);
}

/* The view widened out to the rank edges around it, so even a rating that stays inside one rank
 * shows that rank's two edges. */
export function rankBounds(table: RankTable, min: number, max: number): [number, number] {
  const edges = table.map(e => e[1]);
  const below = edges.filter(e => e <= min);
  const above = edges.filter(e => e >= max);
  return [below.length ? below[below.length - 1] : min, above.length ? above[0] : max];
}
