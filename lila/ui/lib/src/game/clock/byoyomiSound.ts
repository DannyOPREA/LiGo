// LiGo: which sound a byo-yomi clock plays (ADR 0026 section 2). LowTime when a period starts
// (entering byo-yomi, or the clock using up a period), then one CountDown sound per second over
// the last 10 seconds of each period. Pure, so the round page's clock can feed it every tick.

export interface ByoyomiSounds {
  // Feed the player's own clock while it is in byo-yomi: the periods left (counting the one under
  // way) and the whole seconds left in it. Safe to call more often than once a second.
  tick(periodsLeft: number, secondsLeft: number): string | undefined;
  // Forget the clock, e.g. when the game ends; the next tick counts as entering byo-yomi.
  reset(): void;
}

export function makeByoyomiSounds(): ByoyomiSounds {
  let lastPeriods: number | undefined;
  let lastSeconds: number | undefined;
  return {
    tick(periodsLeft, secondsLeft) {
      if (periodsLeft < 1) return undefined;
      const newPeriod = lastPeriods === undefined || periodsLeft < lastPeriods;
      const secondChanged = secondsLeft !== lastSeconds;
      lastPeriods = periodsLeft;
      lastSeconds = secondsLeft;
      if (newPeriod) return 'lowTime';
      if (secondChanged && secondsLeft >= 1 && secondsLeft <= 10) return `countDown${secondsLeft}`;
      return undefined;
    },
    reset() {
      lastPeriods = undefined;
      lastSeconds = undefined;
    },
  };
}
