// (unit 3.5) What is left of the removed engine code (lib/ceval): the display of stored server
// evaluations. Chess-calibrated; Phase 4 replaces it with a Go score display.

export function renderEval(e: number): string {
  e = Math.max(Math.min(Math.round(e / 10) / 10, 99), -99);
  return (e > 0 ? '+' : '') + e.toFixed(1);
}

// https://github.com/lichess-org/lila/pull/11148
const rawWinningChances = (cp: number): number => 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;

const evalWinningChances = (ev: EvalScore): number => {
  if (typeof ev.mate !== 'undefined') {
    const cp = (21 - Math.min(10, Math.abs(ev.mate))) * 100;
    return rawWinningChances(cp * (ev.mate > 0 ? 1 : -1));
  }
  return rawWinningChances(Math.min(Math.max(-1000, ev.cp!), 1000));
};

// winning chances for a color: 1 infinitely winning, -1 infinitely losing
export const povChances = (color: Color, ev: EvalScore): number =>
  color === 'white' ? evalWinningChances(ev) : -evalWinningChances(ev);

// difference in winning chances between two evaluations, from a color's point of view
export const povDiff = (color: Color, e1: EvalScore, e2: EvalScore): number =>
  (povChances(color, e1) - povChances(color, e2)) / 2;
