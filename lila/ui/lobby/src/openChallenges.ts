// The "Open challenges" table (unit 6.7, ADR 0022 §5): one row shape for lila's real-time hooks and
// correspondence seeks, the filter chips, and the one place that decides which rows you can join and
// in what order they are listed. Pure functions, so tests/openChallenges.test.ts can check them.
import { goSizes, type GoRuleset, type GoSize } from './goSetup';
import type { Hook, Mode, RatingRangeJson, Seek } from './interfaces';

export type LiveSpeed = 'bullet' | 'blitz' | 'rapid' | 'classical';
export const liveSpeeds: LiveSpeed[] = ['bullet', 'blitz', 'rapid', 'classical'];

export type RatedChoice = 'rated' | 'casual';
export const ratedChoices: RatedChoice[] = ['rated', 'casual'];

// A hook or a seek, in the shape the table shows.
export interface OpenRow {
  kind: Mode; // 'live' for a hook, 'correspondence' for a seek
  id: string;
  user?: string; // undefined for a guest
  auth: boolean; // made by a signed-in player
  range?: RatingRangeJson; // the rating range its creator asked for; none is any rank
  rating?: number;
  provisional: boolean;
  goRank?: string; // the server's kyu/dan label for `rating`
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
  auth: hook.auth ?? !!hook.u,
  range: hook.rr,
  rating: hook.rating,
  provisional: !!hook.prov,
  goRank: hook.goRank,
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
  auth: true, // only signed-in players make correspondence seeks
  range: seek.rr,
  rating: seek.rating || undefined,
  provisional: !!seek.provisional,
  goRank: seek.goRank,
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

// The one place that picks the text beside a player's name: the server's kyu/dan label (unit 5.5),
// or the rating itself from a server that sent none.
export const playerRatingLabel = (rating: number, provisional: boolean, goRank?: string): string =>
  goRank ?? rating + (provisional ? '?' : '');

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

// `ratingMap` is by perf key; Go's is `go`. lila marks a provisional rating with a minus sign.
export const viewerOf = (me?: { username: string }, ratingMap?: Record<string, number> | null): Viewer => {
  const go = ratingMap?.['go'];
  return { username: me?.username, rating: go === undefined ? undefined : Math.abs(go) };
};

// Why you can't join a row (ADR 0022 §5): your own; rated while you are a guest; your rating outside its
// range; made by a signed-in player while you are a guest, or by a guest while you are signed in.
export type Unjoinable = 'own' | 'rated' | 'range' | 'members' | 'guests';
export interface Fit {
  joinable: boolean;
  reason?: Unjoinable;
  suits: boolean;
}

// The server's own join rules (`Biter.canJoin`), from the fields it sends since unit 6.5: it sends the
// rows you can't join too, and the table greys them with the reason.
export const fit = (row: OpenRow, viewer: Viewer, chips: Chips = noChips()): Fit => {
  const no = (reason: Unjoinable): Fit => ({ joinable: false, reason, suits: false });
  // yours, from this tab or another one (the server refuses a hook of your own whichever tab made it)
  if (row.own || (!!viewer.username && row.user === viewer.username)) return no('own');
  if (!viewer.username) {
    if (row.rated) return no('rated');
    if (row.auth) return no('members');
  } else if (!row.auth) return no('guests');
  if (viewer.username && row.range && outOfRange(viewer.rating, row.range)) return no('range');
  return { joinable: !row.disabled, suits: !row.disabled && matches(row, chips) };
};

// lila's `RatingRange.contains`: a bound at lila's limit (400 or 2900) is open
const outOfRange = (rating: number | undefined, r: RatingRangeJson): boolean =>
  rating !== undefined && ((r.min > 400 && rating < r.min) || (r.max < 2900 && rating > r.max));

// a range in ranks: "2k–1d", "2k+" or "≤ 1d" (a bound at lila's limit is open)
export const rangeLabel = (r: RatingRangeJson): string =>
  r.low && r.high
    ? r.low === r.high
      ? r.low
      : `${r.low}–${r.high}`
    : r.low
      ? `${r.low}+`
      : r.high
        ? `≤ ${r.high}`
        : '';

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
