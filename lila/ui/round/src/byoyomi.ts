// A byo-yomi clock's periods on the round page (unit 4.10, ADR 0020 §7). lila's clock widget
// (lib/game/clock) counts down one number per player; this keeps what it doesn't know: each side's
// periods left and whether main time is over, so that when the widget reaches zero the page can start
// the next period instead of flagging. The server's clock events correct both after every move.
// Licence: MIT (LiGo's own code, ADR 0006).

import type { ByoyomiData } from './interfaces';

const key = (c: Color): 'b' | 'w' => (c === 'black' ? 'b' : 'w');

export class Byoyomi {
  /** Periods left, counting the one in progress. */
  readonly periods: ByColor<number> = { black: 0, white: 0 };
  /** Main time is over: the clock shows the time left in the current period. */
  readonly inByoyomi: ByColor<boolean> = { black: false, white: false };

  constructor(
    /** The period length in seconds. */
    readonly byo: Seconds,
    /** Main time in seconds; 0 starts straight in byo-yomi. */
    readonly mainSeconds: Seconds,
    clock: { white: Seconds; black: Seconds } & ByoyomiData,
  ) {
    this.update(clock);
  }

  /**
   * The server's reading. Whether a side's main time is over comes from `inByo` when the server sends
   * it; without it, once main time is over it never comes back, and a clock showing a period or less
   * is taken as in byo-yomi, which is wrong only in main time's last seconds (one period too few).
   */
  update(clock: { white: Seconds; black: Seconds } & Partial<ByoyomiData>): void {
    for (const c of ['black', 'white'] as const) {
      const p = clock.periods?.[key(c)];
      if (p !== undefined) this.periods[c] = p;
      const told = clock.inByo?.[key(c)];
      if (told !== undefined) this.inByoyomi[c] = told;
      else this.inByoyomi[c] ||= this.mainSeconds === 0 || clock[c] <= this.byo;
    }
  }

  /**
   * `color`'s clock reached zero: main time ends and the first period starts, or the period ends and
   * the next one starts. False when there is none left (the player is out of time).
   */
  expire(color: Color): boolean {
    if (this.periods[color] <= 0) return false;
    if (!this.inByoyomi[color]) this.inByoyomi[color] = true;
    else this.periods[color]--;
    return this.periods[color] > 0;
  }

  /** Beside the clock: "+5×30s" in main time, "5×30s" in byo-yomi. */
  label(color: Color): string {
    return `${this.inByoyomi[color] ? '' : '+'}${this.periods[color]}×${this.byo}s`;
  }
}
