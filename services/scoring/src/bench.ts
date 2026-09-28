#!/usr/bin/env node
// Autoscore benchmark (unit 4.6, PLAN §5 row 4.6, ADR 0016's "measured by the Phase 4 benchmark
// (≥ 97%)"): runs the real `propose` path — a real KataGo (not stored ownership maps) feeding
// `autoscore`, widened to whole chains, exactly as `src/score.ts`'s `proposeFromOwnership` does
// for lila — over a set of finished games with an agreed correct result, and reports how many
// games it gets right.
//
// Game set: OGS's own 31 `test/autoscore_test_files/` games (Apache-2.0, already vendored for
// `test/autoscore.test.ts`; NOTICE.md). That test replays `autoscore` on OGS's *stored* ownership
// maps (an OGS KataGo run, already accuracy-tested by construction); this script asks *our own*
// KataGo instead, which is the actual thing the ≥ 97% gate needs measured (ADR 0016's "Accuracy
// on real games is measured by the Phase 4 benchmark ... with the b18 network on the owner's
// GPU"). None of these files carries the game's real komi (only `board`, `rules`, and the
// expected `correct_ownership`), so this script queries KataGo with the ruleset's even-game komi
// (R-KOMI-1: 6.5 Japanese, 7.5 Chinese, `--komi` overrides); a few points of ownership near a
// large final margin are not komi-sensitive, but this is a known approximation, not the graded
// game's own komi — recorded in logs/scoring.md.
//
// Usage: dev/ligo scoring bench [--net PATH] [--games DIR] [--gate N] [--limit N] [--timeout MS]
//   (or directly: pnpm --filter @ligo/scoring run bench -- --net ... ; needs KATAGO_BIN and, for
//   --net, either the flag or KATAGO_NET/KATAGO_MODEL/KATAGO_TEST_NET in the environment, as
//   `dev/ligo katago env` prints them).
//
// Licence: MIT (LiGo's own code, ADR 0006). Test data: Apache-2.0 (test/autoscore_test_files/NOTICE.md).
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsePoints, type Board } from './board.ts';
import { BLACK, EMPTY, WHITE, type GobanRules } from './goban.ts';
import { KataGoClient } from './katago.ts';
import { proposeFromOwnership, type Ruleset } from './score.ts';

export interface Args {
  net?: string;
  bin?: string;
  config?: string;
  games: string;
  gate?: number;
  limit?: number;
  timeoutMs: number;
  out?: string;
  komiJapanese: number;
  komiChinese: number;
}

export function parseArgs(argv: string[]): Args {
  const defaultGames = fileURLToPath(new URL('../test/autoscore_test_files/', import.meta.url));
  const a: Args = { games: defaultGames, timeoutMs: 60_000, komiJapanese: 6.5, komiChinese: 7.5 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    // pnpm's own `run <script> -- <args>` forwards a literal leading '--' with some pnpm
    // versions (observed with pnpm 12.3.4 here) and not with others; skip a bare '--' wherever it
    // appears rather than assume either behaviour.
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
        a.gate = Number(next());
        break;
      case '--limit':
        a.limit = Number(next());
        break;
      case '--timeout':
        a.timeoutMs = Number(next());
        break;
      case '--out':
        a.out = next();
        break;
      case '--komi-japanese':
        a.komiJapanese = Number(next());
        break;
      case '--komi-chinese':
        a.komiChinese = Number(next());
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

export function cellChar(v: number): string {
  return v === BLACK ? 'B' : v === WHITE ? 'W' : ' ';
}

/** Compares this run's owner map (ADR 0020 §1's `owner`: one char per point, `b`/`w`/`.`, row by
 * row — goscorer's full territory-plus-living-stones ownership, exactly what `countGiven` returns
 * and what a game's `correct_ownership` in `test/autoscore_test_files/` describes) against
 * `correctOwnership` (goban's own convention, reused from `test/autoscore.test.ts`'s
 * `matchesOwnership`): '*' matches anything, 's' matches only a point this run also flagged as
 * needing sealing, ' '/'B'/'W' match `.`/`b`/`w`.
 *
 * `correct_ownership` is a *territory* map, not "the board with dead stones blanked": an empty
 * point inside Black's area is graded 'B', not ' ' (unit 4.6 review of the file format against
 * `test/autoscore.test.ts`'s own `matchesOwnership`, which compares against `autoscore`'s
 * `result` — itself a territory-filled ownership grid, not a bare board). Comparing against the
 * board-with-dead-removed instead (this script's first attempt) failed all 31 games. */
export function compareToGroundTruth(
  owner: string,
  size: number,
  sealPoints: Set<string>,
  correctOwnership: string[],
): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const o = owner[y * size + x];
      const c = correctOwnership[y][x];
      let ok =
        c === '*' ||
        c === 's' ||
        (o === '.' && c === ' ') ||
        (o === 'b' && c === 'B') ||
        (o === 'w' && c === 'W');
      if (c === 's') ok &&= sealPoints.has(`${x},${y}`);
      if (!ok) mismatches.push(`(${x},${y}) got '${o === '.' ? ' ' : o.toUpperCase()}' want '${c}'`);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

interface GameResult {
  file: string;
  gameId?: string | number;
  size: number;
  rules: 'chinese' | 'japanese';
  ok: boolean;
  mismatches: string[];
  ms: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const bin = args.bin ?? process.env.KATAGO_BIN;
  const model = args.net ?? process.env.KATAGO_NET ?? process.env.KATAGO_MODEL ?? process.env.KATAGO_TEST_NET;
  // KATAGO_BIN (dev/katago.sh env) is `~/.local/bin/katago`, a symlink to the installed release
  // directory; the example configs live next to the real binary, not next to the symlink
  // (test/integration.test.ts does the same `realpathSync` for the same reason).
  const configPath =
    args.config ?? (bin ? join(dirname(realpathSync(bin)), 'analysis_example.cfg') : undefined);
  if (!bin || !model || !configPath) {
    console.error(
      'scoring bench needs a real KataGo: set KATAGO_BIN and KATAGO_NET (or pass --bin/--net), ' +
        'as `dev/ligo katago env` prints them once `dev/ligo katago install` has run. Measuring ' +
        'accuracy of a no-KataGo fallback would not mean anything (every proposal would be empty).',
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

  console.log(`scoring bench: ${files.length} games, net ${model}, timeout ${args.timeoutMs}ms`);

  const katago = new KataGoClient({ bin, modelPath: model, configPath, timeoutMs: args.timeoutMs });
  const results: GameResult[] = [];
  try {
    for (const file of files) {
      const data = JSON.parse(readFileSync(join(args.games, file), 'utf-8')) as GameFile;
      const rules: Ruleset = (data.rules ?? 'chinese') === 'japanese' ? 'j' : 'c';
      const fullRules: GobanRules = rules === 'j' ? 'japanese' : 'chinese';
      const komi = rules === 'j' ? args.komiJapanese : args.komiChinese;
      const board = loadBoard(data.board);
      const size = board.length;

      const started = Date.now();
      let ok = false;
      let mismatches: string[] = [`(unstarted)`];
      try {
        const ownership = await katago.ownershipMaps(board, fullRules, komi);
        const reply = proposeFromOwnership(board, rules, ownership, komi, 0, { b: 0, w: 0 });
        const sealPoints = new Set(parsePoints(reply.seal).map(p => `${p.x},${p.y}`));
        ({ ok, mismatches } = compareToGroundTruth(reply.owner, size, sealPoints, data.correct_ownership));
      } catch (e) {
        mismatches = [`error: ${(e as Error).message}`];
      }
      const ms = Date.now() - started;
      results.push({ file, gameId: data.game_id, size, rules: fullRules, ok, mismatches, ms });
      console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${file} (${size}x${size} ${fullRules}, ${ms}ms)`);
      if (!ok) for (const m of mismatches.slice(0, 8)) console.log(`       ${m}`);
    }
  } finally {
    katago.close();
  }

  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  const pct = (100 * passed) / total;
  const totalMs = results.reduce((s, r) => s + r.ms, 0);
  console.log(
    `\n${passed}/${total} games matched their agreed result (${pct.toFixed(1)}%), ${totalMs}ms total`,
  );
  if (args.gate !== undefined) {
    console.log(`gate: ${args.gate}% ${pct >= args.gate ? 'PASSED' : 'FAILED'}`);
  }

  const report = {
    at: new Date().toISOString(),
    net: model,
    bin,
    games: args.games,
    komi: { japanese: args.komiJapanese, chinese: args.komiChinese },
    passed,
    total,
    pct,
    totalMs,
    gate: args.gate,
    results,
  };
  const outPath = args.out ?? join(process.cwd(), 'scoring-bench-report.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`report: ${outPath}`);

  if (args.gate !== undefined && pct < args.gate) process.exitCode = 1;
}

// Only run the CLI when this file is the program's entry point, not when a test imports its
// exported helpers (parseArgs, loadBoard, compareToGroundTruth) — `node --test test/*.test.ts`
// resolves this module by its real path, which must match exactly for the guard to hold.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    console.error(e);
    process.exitCode = 1;
  });
}
