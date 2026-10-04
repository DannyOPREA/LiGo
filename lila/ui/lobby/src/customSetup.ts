// The custom-game window's pure parts (unit 6.8): the presets at its top, built from the server's own
// pools and correspondence tiles so they follow ADR 0005's tiles, and the one-line digest of the
// advanced options folded away below. view/setup/ draws them and setupCtrl.ts holds the state.
import type { TimeMode } from 'lib/setup/timeControl';

import { handicapName, isGoSize, rulesetName, sizeName, type GoRuleset, type GoSize } from './goSetup';
import type { Pool, SetupStore } from './interfaces';
import type { CorresTile } from './quickPair';

// What a preset fills in: the board and the clock. Only the fields of its clock's mode are set.
type PresetClock = Pick<SetupStore, 'goSize' | 'timeMode'> &
  Partial<Pick<SetupStore, 'time' | 'increment' | 'days' | 'periods' | 'periodTime'>>;

export interface Preset {
  id: string;
  label: string; // "19×19 Rapid"
  detail: string; // "10+5×30s", "1 day"
  clock: PresetClock;
}

const poolPreset = (pool: Pool, speed: string, label: string): Preset | undefined => {
  if (!isGoSize(pool.size)) return undefined;
  const clock: PresetClock = pool.byo
    ? {
        goSize: pool.size,
        timeMode: 'byoyomi',
        time: pool.byo.limit / 60,
        periods: pool.byo.periods,
        periodTime: pool.byo.period,
      }
    : { goSize: pool.size, timeMode: 'realTime', time: pool.lim ?? 0, increment: pool.inc ?? 0 };
  return { id: `${pool.size}-${speed}`, label, detail: pool.clock, clock };
};

const corresPreset = (tile: CorresTile): Preset | undefined =>
  isGoSize(tile.go.size)
    ? {
        id: 'corres',
        label: i18n.site.correspondence,
        detail: i18n.site.nbDays(tile.days),
        clock: { goSize: tile.go.size, timeMode: 'correspondence', days: tile.days },
      }
    : undefined;

// The three ADR 0005 shapes: a 19×19 rapid game, a 9×9 blitz game and a one-day correspondence game, with
// the clock of the first such tile the server lists.
export const customPresets = (
  pools: Pool[],
  corres: CorresTile[] = [],
  allowed: TimeMode[] = ['realTime', 'byoyomi', 'correspondence'],
): Preset[] => {
  const fast = (size: number, speed: Pool['speed'], name: string) => {
    // a window that only allows some clocks takes the first tile with one of those
    const pool = pools.find(
      p => p.size === size && p.speed === speed && allowed.includes(p.byo ? 'byoyomi' : 'realTime'),
    );
    return pool && poolPreset(pool, speed, `${sizeName(size as GoSize)} ${name}`);
  };
  const tile = allowed.includes('correspondence') ? (corres.find(t => t.days === 1) ?? corres[0]) : undefined;
  return [
    fast(19, 'rapid', i18n.site.rapid),
    fast(9, 'blitz', i18n.site.blitz),
    tile && corresPreset(tile),
  ].filter((p): p is Preset => !!p);
};

type Clock = Pick<
  SetupStore,
  'goSize' | 'timeMode' | 'time' | 'increment' | 'days' | 'periods' | 'periodTime'
>;

// Does the window already have this preset's board and clock?
export const presetMatches = (preset: Preset, now: Clock): boolean => {
  const p = preset.clock;
  if (p.goSize !== now.goSize || p.timeMode !== now.timeMode) return false;
  const mode: TimeMode = p.timeMode;
  return mode === 'realTime'
    ? p.time === now.time && p.increment === now.increment
    : mode === 'byoyomi'
      ? p.time === now.time && p.periods === now.periods && p.periodTime === now.periodTime
      : mode === 'correspondence'
        ? p.days === now.days
        : true;
};

// The settings a preset writes into the store
export const presetFields = (preset: Preset): Partial<SetupStore> => ({ ...preset.clock });

// "Japanese · Komi 6.5 · Even · 3k–1d": what the folded advanced options hold
export const advancedDigest = (a: {
  ruleset: GoRuleset;
  komi: number;
  handicap: number;
  range?: { from: string; to: string };
}): string =>
  [
    rulesetName(a.ruleset),
    `${i18n.site.goKomi} ${a.komi}`,
    handicapName(a.handicap),
    a.range && `${a.range.from}–${a.range.to}`,
  ]
    .filter(Boolean)
    .join(' · ');
