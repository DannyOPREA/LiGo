#!/usr/bin/env node
// Autoscore benchmark (unit 4.6, PLAN §5 row 4.6, ADR 0016's "measured by the Phase 4 benchmark
// (>= 97%)"): asks a real KataGo for the two ownership maps of each game's final board, runs
// OGS's `autoscore` on them exactly as `src/score.ts`'s `proposeFromOwnership` does for lila, and
// grades autoscore's raw `result` and `needs_sealing` (and `sealed_result` where the file has a
// `sealed_ownership`) against the file's `correct_ownership`, with the same pass rule as
// `test/autoscore.test.ts` (`src/grade.ts`). Fed OGS's own stored maps, that grading gives 31/31
// (`test/bench.test.ts`); the difference to a live run is only KataGo.
//
// Game set: OGS's 31 `test/autoscore_test_files/` games (Apache-2.0, NOTICE.md). Be honest about
// what that is: autoscore's own regression set. OGS tuned autoscore against it, 8 of the 31 are
// synthetic corner/dev tests, and the expected results were corrected by hand, not agreed by the
// players, so the figure leans optimistic. A larger set of real finished games is a follow-up.
//
// The files carry no komi; every query uses komi 7.5 (the value the unit 1.3 spike used). KataGo's
// search is not deterministic, so the set is run `--runs N` times (default 3) and the gate compares
// total correct / total game-runs.
//
// Usage: dev/ligo scoring bench [--net PATH] [--games DIR] [--gate N] [--runs N] [--limit N]
//   [--timeout MS]   (needs KATAGO_BIN and KATAGO_NET, as `dev/ligo katago env` prints them).
//
// Licence: MIT (LiGo's own code, ADR 0006). Test data: Apache-2.0 (test/autoscore_test_files/NOTICE.md).
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Board } from './board.ts';
import { autoscore, BLACK, EMPTY, WHITE, type GobanRules } from './goban.ts';
import { deadSetAgrees, ownershipMismatches } from './grade.ts';
import { KataGoClient, type OwnershipMaps } from './katago.ts';
import { proposeFromOwnership, type Ruleset } from './score.ts';

export interface Args {
  net?: string;
  bin?: string;
  config?: string;
  games: string;
  gate?: number;
  limit?: number;
  runs: number;
  timeoutMs: number;
  out?: string;
  komi: number;
}

function num(flag: string, v: string): number {
  const n = Number(v);
  if (v.trim() === '' || !Number.isFinite(n)) throw new Error(`${flag} needs a finite number, got '${v}'`);
  return n;
}

export function parseArgs(argv: string[]): Args {
  const defaultGames = fileURLToPath(new URL('../test/autoscore_test_files/', import.meta.url));
  const a: Args = { games: defaultGames, runs: 3, timeoutMs: 60_000, komi: 7.5 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    // pnpm's own `run <script> -- <args>` forwards a literal '--' with some versions (pnpm 12.3.4
    // here); skip a bare '--' wherever it appears.
    if (arg === '--') continue;
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} needs a value`);
      return argv[i];
    };
    switch (arg) {
      case '--net':
        a.net = next();
        break;
      case '--bin':
        a.bin = next();
        break;
      case '--config':
        a.config = next();
        break;
      case '--games':
        a.games = next();
        break;
      case '--gate':
        a.gate = num(arg, next());
        break;
      case '--limit':
        a.limit = num(arg, next());
        break;
      case '--runs':
        a.runs = num(arg, next());
        if (!Number.isInteger(a.runs) || a.runs < 1) throw new Error('--runs needs an integer of at least 1');
        break;
      case '--timeout':
        a.timeoutMs = num(arg, next());
        break;
      case '--out':
        a.out = next();
        break;
      case '--komi':
        a.komi = num(arg, next());
        break;
      default:
        throw new Error(`unknown argument '${arg}'`);
    }
  }
  return a;
}

export interface GameFile {
  game_id?: string | number;
  rules?: 'chinese' | 'japanese';
  board: string[];
  correct_ownership: string[];
  sealed_ownership?: string[];
  black?: number[][];
  white?: number[][];
}

export function loadBoard(rows: string[]): Board {
  return rows.map(row =>
    row.split('').map(cell => {
      if (cell === 'w' || cell === 'W') return WHITE;
      if (cell === 'b' || cell === 'B') return BLACK;
      return EMPTY;
    }),
  );
}

export interface GameGrade {
  ok: boolean;
  mismatches: string[];
  /** Secondary, never gated: the widened `dead` set agrees with the file's stones. */
  deadOk: boolean;
}

/** Grades one game given the two ownership maps (KataGo's, or OGS's stored ones in the tests). */
export function gradeGame(data: GameFile, ownership: OwnershipMaps, komi: number): GameGrade {
  const rules: Ruleset = (data.rules ?? 'chinese') === 'japanese' ? 'j' : 'c';
  const goban: GobanRules = rules === 'j' ? 'japanese' : 'chinese';
  const board = loadBoard(data.board);
  // autoscore mutates the board it is given: always a copy.
  const [res] = autoscore(
    board.map(r => r.slice()),
    goban,
    ownership.blackToMove,
    ownership.whiteToMove,
  );
  const mismatches = ownershipMismatches(res.result, res.needs_sealing, data.correct_ownership);
  if (data.sealed_ownership) {
    mismatches.push(
      ...ownershipMismatches(res.sealed_result, res.needs_sealing, data.sealed_ownership).map(
        m => `sealed: ${m}`,
      ),
    );
  }
  const proposal = proposeFromOwnership(board, rules, ownership, komi, 0, { b: 0, w: 0 });
  const dead = proposal.dead.map(p => ({ x: p.charCodeAt(0) - 97, y: p.charCodeAt(1) - 97 }));
  return {
    ok: mismatches.length === 0,
    mismatches,
    deadOk: deadSetAgrees(board, dead, data.correct_ownership),
  };
}

interface GameResult extends GameGrade {
  run: number;
  file: string;
  gameId?: string | number;
  size: number;
  rules: 'chinese' | 'japanese';
  ms: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const bin = args.bin ?? process.env.KATAGO_BIN;
  const model = args.net ?? process.env.KATAGO_NET ?? process.env.KATAGO_MODEL ?? process.env.KATAGO_TEST_NET;
  // KATAGO_BIN is `~/.local/bin/katago`, a symlink; the example configs live next to the real binary.
  const configPath =
    args.config ?? (bin ? join(dirname(realpathSync(bin)), 'analysis_example.cfg') : undefined);
  if (!bin || !model || !configPath) {
    console.error(
      'scoring bench needs a real KataGo: set KATAGO_BIN and KATAGO_NET (or pass --bin/--net), as ' +
        '`dev/ligo katago env` prints them once `dev/ligo katago install` has run.',
    );
    process.exitCode = 2;
    return;
  }
  if (!existsSync(configPath)) {
    console.error(`analysis config not found: ${configPath} (pass --config explicitly)`);
    process.exitCode = 2;
    return;
  }

  let files = readdirSync(args.games)
    .filter(f => f.endsWith('.json'))
    .sort();
  if (args.limit && args.limit > 0) files = files.slice(0, args.limit);
  if (files.length === 0) {
    console.error(`no .json game files found in ${args.games}`);
    process.exitCode = 2;
    return;
  }

  console.log(
    `scoring bench: ${files.length} games x ${args.runs} runs, net ${model}, komi ${args.komi}, timeout ${args.timeoutMs}ms`,
  );

  const katago = new KataGoClient({ bin, modelPath: model, configPath, timeoutMs: args.timeoutMs });
  const results: GameResult[] = [];
  try {
    for (let run = 1; run <= args.runs; run += 1) {
      for (const file of files) {
        const data = JSON.parse(readFileSync(join(args.games, file), 'utf-8')) as GameFile;
        const rules = data.rules ?? 'chinese';
        const board = loadBoard(data.board);
        const started = Date.now();
        let grade: GameGrade;
        try {
          const ownership = await katago.ownershipMaps(board, rules, args.komi);
          grade = gradeGame(data, ownership, args.komi);
        } catch (e) {
          grade = { ok: false, mismatches: [`error: ${(e as Error).message}`], deadOk: false };
        }
        const ms = Date.now() - started;
        results.push({ run, file, gameId: data.game_id, size: board.length, rules, ms, ...grade });
        console.log(
          `  run ${run} ${grade.ok ? 'ok  ' : 'FAIL'} ${file} (${board.length}x${board.length} ${rules}, ${ms}ms)`,
        );
        if (!grade.ok) for (const m of grade.mismatches.slice(0, 6)) console.log(`       ${m}`);
      }
    }
  } finally {
    katago.close();
  }

  const perRun = Array.from({ length: args.runs }, (_, i) => {
    const rs = results.filter(r => r.run === i + 1);
    return {
      run: i + 1,
      passed: rs.filter(r => r.ok).length,
      total: rs.length,
      deadOk: rs.filter(r => r.deadOk).length,
    };
  });
  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  const pct = (100 * passed) / total;
  const totalMs = results.reduce((s, r) => s + r.ms, 0);
  console.log('');
  for (const r of perRun) {
    console.log(
      `run ${r.run}: ${r.passed}/${r.total} graded correct (dead-set agreement, not gated: ${r.deadOk}/${r.total})`,
    );
  }
  console.log(`total: ${passed}/${total} game-runs correct (${pct.toFixed(1)}%), ${totalMs}ms`);
  if (args.gate !== undefined) console.log(`gate: ${args.gate}% ${pct >= args.gate ? 'PASSED' : 'FAILED'}`);

  const outPath = args.out ?? join(process.cwd(), 'scoring-bench-report.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        net: model,
        bin,
        games: args.games,
        komi: args.komi,
        runs: args.runs,
        passed,
        total,
        pct,
        totalMs,
        gate: args.gate,
        perRun,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`report: ${outPath}`);

  if (args.gate !== undefined && pct < args.gate) process.exitCode = 1;
}

// Only run the CLI when this file is the program's entry point, not when a test imports it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error(e);
    process.exitCode = 1;
  });
}
