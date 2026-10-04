import type { Pool, PoolId } from './interfaces';

// The pools come from the server (modules/pool/src/main/PoolList.scala, ADR 0022 §1, unit 6.4).

// What a guest's click on a tile sends: a casual hook with the tile's board size and clock (ADR 0022 §2).
export const anonPoolSeekForm = (pool: Pool): Record<string, string | number> => ({
  variant: 1,
  days: 1,
  color: 'random',
  size: pool.size,
  ...(pool.byo
    ? {
        timeMode: 3,
        time: pool.byo.limit / 60,
        increment: 0,
        periods: pool.byo.periods,
        periodTime: pool.byo.period,
      }
    : { timeMode: 1, time: pool.lim ?? 0, increment: pool.inc ?? 0 }),
});

/* The pool a `#pool/<id>[/<blocking>]` link asks for. Links made before unit 6.4 name lila's clock-only ids
 * ("10+10", as the game page's "new opponent" button still does); they find the Fischer pool with that
 * clock, if there is one. */
export const poolFromHash = (hash: string, pools: Pool[]): { id: PoolId; blocking?: string } | undefined => {
  const match = /^#pool\/([\w+.-]+)(?:\/(.+))?$/.exec(hash);
  if (!match) return undefined;
  const [, key, blocking] = match;
  const legacy = /^(\d+(?:\.\d+)?)\+(\d+)$/.exec(key);
  const pool = legacy
    ? pools.find(p => !p.byo && p.lim === Number(legacy[1]) && p.inc === Number(legacy[2]))
    : pools.find(p => p.id === key);
  return pool && { id: pool.id, ...(blocking ? { blocking } : {}) };
};

/* The pool a hook from the create-game window would join (ADR 0022 §6): rated, random colour and the pool's
 * board size and clock; the caller checks the rest (Japanese rules, standard komi, even). */
export const poolForClock = (
  pools: Pool[],
  size: number,
  clock: { lim: number; inc: number } | { byo: { limit: number; periods: number; period: number } },
): Pool | undefined =>
  pools.find(
    p =>
      p.size === size &&
      ('byo' in clock
        ? !!p.byo &&
          p.byo.limit === clock.byo.limit &&
          p.byo.periods === clock.byo.periods &&
          p.byo.period === clock.byo.period
        : !p.byo && p.lim === clock.lim && p.inc === clock.inc),
  );

// The Fischer pools' clocks, offered as presets in the create-game window's real-time tab.
export const fischerPresets = (pools: Pool[]): { lim: number; inc: number }[] =>
  pools.flatMap(p =>
    p.byo || p.lim === undefined || p.inc === undefined ? [] : [{ lim: p.lim, inc: p.inc }],
  );
