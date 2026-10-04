// The quick-pairing landing view (unit 6.6, ADR 0022 §1, §2, §4): the tiles in three columns, the one chip
// row, the waiting count on each tile and the waiting state of the tile you clicked. Pure functions, so
// tests/quickPair.test.ts can check them; ctrl.ts keeps the state and view/pools.ts draws it.
import { defaultGoRuleset, standardKomi } from './goSetup';
import type { Hook, Pool, Seek } from './interfaces';
import { fit, hookRow, type Viewer } from './openChallenges';
import { anonPoolSeekForm } from './poolList';

// ---- the chip row ----

// `rated`: the Rated / Casual chip; `handicap`: the Handicap OK / Even only chip.
export interface QuickChips {
  rated: boolean;
  handicap: boolean;
}

export const defaultQuickChips = (): QuickChips => ({ rated: true, handicap: true });

export const parseQuickChips = (json: string | null): QuickChips => {
  try {
    const v = JSON.parse(json ?? '');
    if (typeof v?.rated === 'boolean' && typeof v?.handicap === 'boolean')
      return { rated: v.rated, handicap: v.handicap };
  } catch {
    // an old or broken value: the defaults
  }
  return defaultQuickChips();
};

// What a click does with the chips: guests only play casual (ADR 0021 §5), and casual quick games are even
// (ADR 0022 §2).
export const effectiveChips = (chips: QuickChips, signedIn: boolean): QuickChips => {
  const rated = signedIn && chips.rated;
  return { rated, handicap: rated && chips.handicap };
};

// ---- the tiles ----

// The lobby's correspondence tiles, as the server sends them (modules/lobby/src/main/CorresPresets.scala)
export interface CorresTile {
  id: string; // "19x19-1d"
  days: number;
  go: { size: number; rules: string; komi: number };
}

export interface Column {
  key: string;
  title: string;
  pools: Pool[];
  corres: CorresTile[];
}

// 9×9 and 19×19 real-time pools, then correspondence (ADR 0005's three columns), in the server's order.
export const columns = (pools: Pool[], corres: CorresTile[]): Column[] => {
  const sizes = [...new Set(pools.map(p => p.size))];
  return [
    ...sizes.map(size => ({
      key: `${size}`,
      title: `${size}×${size}`,
      pools: pools.filter(p => p.size === size),
      corres: [],
    })),
    ...(corres.length ? [{ key: 'corres', title: i18n.site.correspondence, pools: [], corres }] : []),
  ];
};

// A casual open game with exactly a tile's settings: what a Casual click on that tile would make, and so
// what it would join at once (ADR 0022 §2, lila's `Hook.compatibleWith`).
export const hookMatchesPool = (hook: Hook, pool: Pool): boolean =>
  !hook.ra &&
  hook.clock === pool.clock &&
  hook.go?.size === pool.size &&
  hook.go.rules === defaultGoRuleset &&
  hook.go.komi === standardKomi(defaultGoRuleset) &&
  !hook.go.handicap;

// The number on a tile (ADR 0022 §4): with Rated, the players in its pool, as the server counts them; with
// Casual, the casual open games with the tile's settings that you could join.
export const tileCount = (
  pool: Pool,
  rated: boolean,
  poolSizes: Record<string, number>,
  hooks: Hook[],
  viewer: Viewer,
): number =>
  rated
    ? (poolSizes[pool.id] ?? 0)
    : hooks.filter(h => hookMatchesPool(h, pool) && fit(hookRow(h), viewer).joinable).length;

// Your own casual open game for a tile, once the server has it.
export const ownHook = (pool: Pool, hooks: Hook[]): Hook | undefined =>
  hooks.find(h => h.action === 'cancel' && hookMatchesPool(h, pool));

// Your own seek for a correspondence tile, once the server has it.
export const ownSeek = (tile: CorresTile, seeks: Seek[]): Seek | undefined =>
  seeks.find(
    s => s.action === 'cancelSeek' && s.days === tile.days && s.go?.size === tile.go.size && !s.go?.handicap,
  );

// ---- what a click sends ----

// A Casual click: a casual open game with the tile's settings (lila's guest pool click, ADR 0022 §2).
export const casualHookForm = (pool: Pool): Record<string, string | number> => ({
  ...anonPoolSeekForm(pool),
  mode: 0,
});

// A correspondence tile: a seek with the tile's days, 19×19 Japanese even, rated or casual from the chips.
export const corresSeekForm = (tile: CorresTile, rated: boolean): Record<string, string | number> => ({
  timeMode: 2,
  days: tile.days,
  time: 0,
  increment: 0,
  color: 'random',
  size: tile.go.size,
  ruleset: tile.go.rules,
  mode: rated ? 1 : 0,
});

// ---- waiting on a tile ----

// What the server says a waiting player can meet now (LobbySocket's `poolRange`).
export interface PoolRange {
  id: string;
  weakest: string;
  strongest: string;
  stones: number;
}

export const rangeText = (r: PoolRange): string =>
  r.weakest === r.strongest ? r.weakest : `${r.weakest}–${r.strongest}`;

// "0:07", "1:30", "12:05"
export const elapsed = (millis: number): string => {
  const s = Math.max(0, Math.floor(millis / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
