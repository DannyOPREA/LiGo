// R-HCP-4's fixed handicap points (docs/rules/spec.md §5), test-only: a couple of the
// libs/conformance scoring fixtures give only `handicap` and no board, relying on the standard
// placement every engine uses (spec: "identical in strategygames and goban-engine for 2–9"). This
// is never used by the service itself (ADR 0020: it never replays a game's setup, only the final
// board lila sends), only by this test harness to materialize those two fixtures' boards.
//
// Licence: MIT (LiGo's own code, ADR 0006).
// Each entry built additively, exactly as the spec table reads ("4 + D16", "6 + K16, K4", ...).
const POINTS_19: Record<number, string[]> = {
  2: ['pd', 'dp'],
  3: ['pd', 'dp', 'pp'],
  4: ['pd', 'dp', 'pp', 'dd'],
  5: ['pd', 'dp', 'pp', 'dd', 'jj'],
  6: ['pd', 'dp', 'pp', 'dd', 'dj', 'pj'],
  7: ['pd', 'dp', 'pp', 'dd', 'dj', 'pj', 'jj'],
  8: ['pd', 'dp', 'pp', 'dd', 'dj', 'pj', 'jd', 'jp'],
  9: ['pd', 'dp', 'pp', 'dd', 'dj', 'pj', 'jd', 'jp', 'jj'],
};
const POINTS_9: Record<number, string[]> = {
  2: ['gc', 'cg'],
  3: ['gc', 'cg', 'gg'],
  4: ['gc', 'cg', 'gg', 'cc'],
  5: ['gc', 'cg', 'gg', 'cc', 'ee'],
  6: ['gc', 'cg', 'gg', 'cc', 'ce', 'ge'],
  7: ['gc', 'cg', 'gg', 'cc', 'ce', 'ge', 'ee'],
  8: ['gc', 'cg', 'gg', 'cc', 'ce', 'ge', 'ec', 'eg'],
  9: ['gc', 'cg', 'gg', 'cc', 'ce', 'ge', 'ec', 'eg', 'ee'],
};

/** Points for a fixed handicap placement (R-HCP-4), 2–9 stones, 9x9 or 19x19. */
export function handicapPoints(size: 9 | 19, handicap: number): string[] {
  const table = size === 19 ? POINTS_19 : POINTS_9;
  const points = table[handicap];
  if (!points) throw new Error(`no fixed handicap table entry for size ${size}, handicap ${handicap}`);
  return points;
}
