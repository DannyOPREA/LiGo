// The "Open challenges" table (unit 6.7, ADR 0022 §5): one row shape for lila's real-time hooks and
// correspondence seeks, the filter chips, and the one place that decides which rows you can join and
// in what order they are listed. Pure functions, so tests/openChallenges.test.ts can check them.
import { goSizes, type GoRuleset, type GoSize } from './goSetup';
import type { Hook, Mode, Seek } from './interfaces';

export type LiveSpeed = 'bullet' | 'blitz' | 'rapid' | 'classical';
export const liveSpeeds: LiveSpeed[] = ['bullet', 'blitz', 'rapid', 'classical'];

export type RatedChoice = 'rated' | 'casual';
export const ratedChoices: RatedChoice[] = ['rated', 'casual'];

// A hook or a seek, in the shape the table shows.
export interface OpenRow {
  kind: Mode; // 'live' for a hook, 'correspondence' for a seek
  id: string;
  user?: string; // undefined for a guest
  rating?: number;
  provisional: boolean;
  size?: GoSize;
  rules?: GoRuleset;
  komi?: number;
  handicap: number; // 0 is an even game (unit 4.9 fills this in from the setup)
  clock?: string; // live: "5+3"
  days?: number; // correspondence: days per move; undefined is unlimited
  speed: LiveSpeed | 'correspondence';
  seconds: number; // estimated total time, to order by
  rated: boolean;
  own: boolean;
  disabled: boolean;
}

// lila's `Speed` ids, as a hook's `s` carries them: 0 ultra-bullet, 1 bullet, 2 blitz, 3 classical,
// 4 correspondence, 5 rapid. As lila's filter did, ultra-bullet counts as bullet.
export const liveSpeedOf = (speedId: number): LiveSpeed => {
  switch (speedId) {
    case 2:
      return 'blitz';
    case 5:
      return 'rapid';
    case 3:
    case 4:
      return 'classical';
    default:
      return 'bullet';
  }
};

export const hookRow = (hook: Hook): OpenRow => ({
  kind: 'live',
  id: hook.id,
  user: hook.u,
  rating: hook.rating,
  provisional: !!hook.prov,
  size: hook.go?.size,
  rules: hook.go?.rules,
  komi: hook.go?.komi,
  handicap: hook.go?.handicap ?? 0,
  clock: hook.clock,
  speed: liveSpeedOf(hook.s),
  seconds: hook.t,
  rated: !!hook.ra,
  own: hook.action === 'cancel',
  disabled: !!hook.disabled,
});

export const seekRow = (seek: Seek): OpenRow => ({
  kind: 'correspondence',
  id: seek.id,
  user: seek.rating ? seek.username : undefined,
  rating: seek.rating || undefined,
  provisional: !!seek.provisional,
  size: seek.go?.size,
  rules: seek.go?.rules,
  komi: seek.go?.komi,
  handicap: seek.go?.handicap ?? 0,
  days: seek.days,
  speed: 'correspondence',
  seconds: (seek.days ?? 1e6) * 86400,
  rated: seek.mode === 1,
  own: seek.action === 'cancelSeek',
  disabled: false,
});

// The one place that turns a rating into the text beside a player's name. Unit 5.5 swaps this for the
// kyu/dan label.
export const playerRatingLabel = (rating: number, provisional: boolean): string =>
  rating + (provisional ? '?' : '');

// ---- filter chips ----

// An empty list means "all": no chip pressed in that group filters nothing.
export interface Chips {
  sizes: GoSize[];
  speeds: LiveSpeed[];
  rated: RatedChoice[];
}

export const noChips = (): Chips => ({ sizes: [], speeds: [], rated: [] });

export const anyChip = (chips: Chips): boolean =>
  chips.sizes.length + chips.speeds.length + chips.rated.length > 0;

const toggled = <A>(list: A[], value: A): A[] =>
  list.includes(value) ? list.filter(v => v !== value) : [...list, value];

export const toggleSize = (chips: Chips, size: GoSize): Chips => ({
  ...chips,
  sizes: toggled(chips.sizes, size),
});
export const toggleSpeed = (chips: Chips, speed: LiveSpeed): Chips => ({
  ...chips,
  speeds: toggled(chips.speeds, speed),
});
export const toggleRated = (chips: Chips, choice: RatedChoice): Chips => ({
  ...chips,
  rated: toggled(chips.rated, choice),
});

// Reads what the browser stored, whatever shape it has (a stored value from lila's old filter form has
// another shape and yields no chips).
export const parseChips = (json: string | null): Chips => {
  try {
    const raw = json ? JSON.parse(json) : null;
    const keep = <A>(list: unknown, allowed: readonly A[]): A[] =>
      Array.isArray(list) ? allowed.filter(a => list.includes(a)) : [];
    return {
      sizes: keep(raw?.sizes, goSizes),
      speeds: keep(raw?.speeds, liveSpeeds),
      rated: keep(raw?.rated, ratedChoices),
    };
  } catch {
    return noChips();
  }
};

const matches = (row: OpenRow, chips: Chips): boolean =>
  (!chips.sizes.length || (!!row.size && chips.sizes.includes(row.size))) &&
  // the speed chips are for live games; a correspondence row has no speed to match
  (!chips.speeds.length ||
    row.kind !== 'live' ||
    (row.speed !== 'correspondence' && chips.speeds.includes(row.speed))) &&
  (!chips.rated.length || chips.rated.includes(row.rated ? 'rated' : 'casual'));

// Your own challenge always stays in the list, as lila's filter kept your own hook.
export const applyChips = (rows: OpenRow[], chips: Chips): OpenRow[] =>
  anyChip(chips) ? rows.filter(row => row.own || matches(row, chips)) : rows;

// ---- which rows you can join, and in what order ----

export interface Viewer {
  username?: string; // undefined for a guest
  rating?: number;
}

// `ratingMap` is by perf key; Go's is `go`.
export const viewerOf = (me?: { username: string }, ratingMap?: Record<string, number> | null): Viewer => ({
  username: me?.username,
  rating: ratingMap?.['go'],
});

export type Unjoinable = 'own' | 'kind';
export interface Fit {
  joinable: boolean;
  reason?: Unjoinable;
  suits: boolean;
}

// Today's rules, the ones the server still enforces by hiding rows: you can't join your own challenge,
// and guests and signed-in players are kept apart. Unit 6.5 adds the rated / range / members / guests
// reasons here, from the new fields the server sends, and greys the rows that return `joinable: false`.
export const fit = (row: OpenRow, viewer: Viewer, chips: Chips = noChips()): Fit => {
  if (row.own) return { joinable: false, reason: 'own', suits: false };
  if (!!row.user !== !!viewer.username) return { joinable: false, reason: 'kind', suits: false };
  return { joinable: !row.disabled, suits: !row.disabled && matches(row, chips) };
};

// Your own challenge first, then what suits you, then the other joinable rows, then the rest; inside
// each group the closest rating to yours first (ADR 0022 §5), and the shortest game first when you
// have no rating to compare (or the rows have none).
export const sortRows = (rows: OpenRow[], viewer: Viewer, chips: Chips = noChips()): OpenRow[] => {
  const rank = (row: OpenRow): number => {
    if (row.own) return 0;
    const f = fit(row, viewer, chips);
    return f.suits ? 1 : f.joinable ? 2 : 3;
  };
  const distance = (row: OpenRow): number =>
    viewer.rating !== undefined && row.rating !== undefined ? Math.abs(row.rating - viewer.rating) : Infinity;
  return rows
    .map((row, i) => ({ row, i, rank: rank(row), distance: distance(row) }))
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        (a.distance === b.distance ? a.row.seconds - b.row.seconds : a.distance < b.distance ? -1 : 1) ||
        a.i - b.i,
    )
    .map(x => x.row);
};
