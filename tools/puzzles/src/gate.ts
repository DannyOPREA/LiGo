// The feasibility gate (ADR 0025 §2): the solver must settle catalogue positions within the time
// budget (20 s each, both sides to move), and at least 250 must pass. A position that hits the
// budget fails; a ko or too-deep line is "unknown" and fails too (it would be dropped). The gate
// stops once `need` positions have passed, or when the catalogue runs out.
//
// Licence: MIT (LiGo's own code, ADR 0007).
import { build, reject } from './catalogue.ts';
import { candidates, random, shuffle } from './generate.ts';
import { BLACK, WHITE, type Colour } from './goban.ts';
import { transform } from './position.ts';
import { DEFAULT_LIMITS, OutOfBudget, Solver, type SolverLimits } from './solver.ts';

export interface GateResult {
  need: number;
  tried: number;
  passed: number;
  overBudget: number;
  unknown: number;
  slowestMs: number;
  totalMs: number;
  ok: boolean;
}

export function gate(seed: number, need = 250, limits: SolverLimits = DEFAULT_LIMITS): GateResult {
  const rnd = random(seed);
  const r: GateResult = {
    need,
    tried: 0,
    passed: 0,
    overBudget: 0,
    unknown: 0,
    slowestMs: 0,
    totalMs: 0,
    ok: false,
  };
  const began = Date.now();
  for (const c of shuffle(candidates(), rnd)) {
    if (r.passed >= need) break;
    const defender: Colour = rnd() < 0.5 ? BLACK : WHITE;
    const pos = transform(build(c.layout, c.variation, defender), Math.floor(rnd() * 8));
    if (reject(pos)) continue;
    r.tried++;
    const started = Date.now();
    try {
      const values = [BLACK, WHITE].map(side => new Solver(pos, side as Colour, limits).solve());
      if (values.includes('unknown')) r.unknown++;
      else r.passed++;
    } catch (e) {
      if (!(e instanceof OutOfBudget)) throw e;
      r.overBudget++;
    }
    r.slowestMs = Math.max(r.slowestMs, Date.now() - started);
  }
  r.totalMs = Date.now() - began;
  r.ok = r.passed >= need;
  return r;
}
