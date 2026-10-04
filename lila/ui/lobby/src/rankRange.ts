// LiGo: the lobby window's rating range in whole ranks (ADR 0021 §3, unit 5.7). The server sends its rank
// table, the rating at the lower edge of each rank from 25k to 9d (`GoRating.rankTable`); the sliders move
// in ranks below and above the player's own, and the form still sends a range of ratings, which is what
// lila's lobby filter and the pools compare. No copy of the rank curve lives here.

export type RankTable = [string, number][];

// lila's `RatingRange` limits: a range outside them is refused by the form
export const ratingRangeMin = 400;
export const ratingRangeMax = 2900;

// the most ranks either slider reaches below or above the player's own
export const maxRankSteps = 9;

// The index of the rank a rating falls in: the last edge at or below it (25k below the table).
export const rankIndex = (table: RankTable, rating: number): number => {
  let i = 0;
  while (i + 1 < table.length && table[i + 1][1] <= rating) i++;
  return i;
};

const clampIndex = (table: RankTable, i: number) => Math.max(0, Math.min(table.length - 1, i));

export interface RankRange {
  // ratings, as the form sends them: "min-max"
  min: number;
  max: number;
  // the weakest and strongest rank in the range
  from: string;
  to: string;
}

// The ratings from `below` ranks under the player's own rank (a negative number or 0) to `above` ranks over
// it: from the lower edge of the lowest rank to just under the edge of the rank after the highest.
export const rankRange = (table: RankTable, rating: number, below: number, above: number): RankRange => {
  const mine = rankIndex(table, rating);
  const lo = clampIndex(table, mine + below);
  const hi = clampIndex(table, mine + above);
  const min = Math.max(ratingRangeMin, table[lo][1]);
  const max = hi + 1 < table.length ? Math.min(ratingRangeMax, table[hi + 1][1] - 1) : ratingRangeMax;
  return { min, max: Math.max(max, min + 1), from: table[lo][0], to: table[hi][0] };
};

// A stored slider value from before ranks (lila's rating points, -500 to 500) becomes the widest range.
export const clampSteps = (n: number, sign: -1 | 1): number => {
  const v = Number.isInteger(n) ? n : sign * maxRankSteps;
  return sign < 0 ? Math.max(-maxRankSteps, Math.min(0, v)) : Math.min(maxRankSteps, Math.max(0, v));
};
