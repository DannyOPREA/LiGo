import { execFileSync } from 'node:child_process';
// KataGo's second opinion on a generated puzzle (ADR 0025 §2). The position gets a tsumego frame
// (frame.ts) so the problem decides the game; then, for every right first move and every refuted
// wrong one, KataGo reads on with both sides kept inside the puzzle's region (`avoidMoves` on every
// other empty point) and its ownership of the defender's stones says whether they live. A puzzle
// is kept only when KataGo agrees on every line. The exact search is what the set is trusted on;
// KataGo catches a solver bug or a position the local search misjudges (ADR 0025 §2).
//
// The client is services/scoring's `KataGoClient` (ADR 0016), through its `analyse` method.
//
// Licence: MIT (LiGo's own code, ADR 0007).
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

// services/scoring is imported by path, not as a workspace package: pnpm 12 links a workspace
// package outside lila/ to the wrong place (logs/tsumego.md, unit 8.3).
import { KataGoClient } from '../../../services/scoring/src/katago.ts';
import { boardOf } from './catalogue.ts';
import { tsumegoFrame } from './frame.ts';
import { BLACK, type Point } from './goban.ts';
import { key, type Position } from './position.ts';
import type { KataGoCheck, Puzzle } from './puzzle.ts';
import type { Built, MoveTreeJson } from './tree.ts';

export const DEFAULT_VISITS = 400;

export interface KataGoSetup {
  bin: string;
  model: string;
  config: string;
  visits: number;
}

/** KataGo's paths from the environment `dev/ligo katago env` prints, or null when it isn't set up. */
export function setupFromEnv(env = process.env): KataGoSetup | null {
  const bin = env.KATAGO_BIN;
  const model = env.KATAGO_NET ?? env.KATAGO_MODEL ?? env.KATAGO_TEST_NET;
  if (!bin || !model) return null;
  // KATAGO_BIN is a symlink; the example analysis config lives next to the real binary.
  const config = env.KATAGO_CONFIG ?? join(dirname(realpathSync(bin)), 'analysis_example.cfg');
  return { bin, model, config, visits: Number(env.LIGO_PUZZLES_VISITS ?? DEFAULT_VISITS) };
}

/** What a puzzle's provenance records about the check: KataGo's version and the network's name and sha256. */
export function describeSetup(s: KataGoSetup): KataGoCheck {
  const version = execFileSync(s.bin, ['version'], { encoding: 'utf8' }).split('\n')[0].trim();
  const sha256 = createHash('sha256').update(readFileSync(s.model)).digest('hex');
  return { version, network: basename(s.model), sha256, visits: s.visits };
}

const loc = (p: Point) => `(${p.x},${p.y})`;
const colourOf = (c: number) => (c === BLACK ? 'B' : 'W');

/** One line to check: the moves from the start, and whether the defender should live after them. */
interface Line {
  moves: Point[];
  defenderLives: boolean;
  label: string;
}

function linesOf(tree: MoveTreeJson, goal: 'live' | 'kill'): Line[] {
  const lines: Line[] = [];
  const good = goal === 'live';
  for (const first of tree.branches ?? []) {
    const refutation = first.branches?.find(r => r.wrong_answer);
    if (first.wrong_answer)
      lines.push({ moves: [first], defenderLives: !good, label: `wrong ${loc(first)}` });
    else if (refutation) {
      lines.push({
        moves: [first, refutation],
        defenderLives: !good,
        label: `wrong ${loc(first)} ${loc(refutation)}`,
      });
    } else lines.push({ moves: [first], defenderLives: good, label: `right ${loc(first)}` });
  }
  return lines;
}

export class SecondOpinion {
  readonly setup: KataGoSetup;
  readonly info: KataGoCheck;
  private readonly client: KataGoClient;

  constructor(setup: KataGoSetup) {
    this.setup = setup;
    this.info = describeSetup(setup);
    this.client = new KataGoClient({
      bin: setup.bin,
      modelPath: setup.model,
      configPath: setup.config,
      timeoutMs: 120_000,
    });
  }

  /** Null when KataGo agrees with every first move of the puzzle, else the line it disagrees on. */
  async check(puzzle: Puzzle, pos: Position, built: Built): Promise<string | null> {
    const player = puzzle.initial_player === 'black' ? 'B' : 'W';
    const framed = tsumegoFrame(boardOf(pos), 7, player === 'B');
    const size = pos.size;
    const initialStones: [string, string][] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++)
        if (framed.board[y][x]) initialStones.push([colourOf(framed.board[y][x]), loc({ x, y })]);
    }
    // Both sides stay in the region: every other point is avoided (the frame's empty points too).
    const region = new Set(pos.region.map(key));
    const avoid: string[] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) if (!region.has(key({ x, y }))) avoid.push(loc({ x, y }));
    }
    const sign = pos.defender === BLACK ? 1 : -1;
    for (const line of linesOf(built.tree, built.goal)) {
      const moves: [string, string][] = line.moves.map((m, i) => [
        (i % 2 === 0) === (player === 'B') ? 'B' : 'W',
        loc(m),
      ]);
      const reply = await this.client.analyse({
        initialStones,
        initialPlayer: player,
        moves,
        rules: 'chinese',
        komi: 7,
        boardXSize: size,
        boardYSize: size,
        maxVisits: this.setup.visits,
        includeOwnership: true,
        // Ownership from Black's side whatever the config says (the sign below relies on it).
        overrideSettings: { reportAnalysisWinratesAs: 'BLACK' },
        avoidMoves: [
          { player: 'B', moves: avoid, untilDepth: 100 },
          { player: 'W', moves: avoid, untilDepth: 100 },
        ],
      });
      const own =
        pos.target.reduce((sum, p) => sum + reply.ownership[p.y * size + p.x], 0) / pos.target.length;
      const lives = own * sign > 0;
      if (lives !== line.defenderLives) {
        return `${line.label}: KataGo reads the defender as ${lives ? 'alive' : 'dead'} (ownership ${(own * sign).toFixed(2)})`;
      }
    }
    return null;
  }

  close(): void {
    this.client.close();
  }
}
