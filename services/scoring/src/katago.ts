// A client for one long-running `katago analysis` process (docs/build-vs-buy/scoring.md,
// ADR 0016): JSON-lines queries by id, restarted after it crashes. What `propose` needs: two
// ownership maps per position (black to move, white to move), each under its own per-request
// timeout (ADR 0020 §4). `analyse` passes any other query through, for `tools/puzzles` (ADR 0025).
//
// Coordinates: KataGo's analysis engine accepts a location as `"(x,y)"` with explicit integer
// coordinates (its docs/Analysis_Engine.md); its own source (cpp/game/board.cpp,
// Location::getLoc/getX/getY) makes y increase in the same row-major, top-to-bottom order as its
// `ownership` reply and as this package's board matrix (row 0 = top), so no coordinate flip is
// needed either way.
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import type { Board } from './board.ts';
import { BLACK, WHITE, type GobanRules } from './goban.ts';

export interface KataGoOptions {
  bin: string;
  configPath: string;
  modelPath: string;
  /** Per-request timeout in ms (ADR 0020 §4: 30 s). */
  timeoutMs?: number;
  /** Extra `-override-config key=val,...`; tests use it to force a single thread. */
  overrideConfig?: string;
}

export interface OwnershipMaps {
  /** Ownership with Black to move: one row-major matrix, +1 = fully Black's, -1 = fully White's. */
  blackToMove: number[][];
  whiteToMove: number[][];
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Thrown when KataGo can't answer: missing binary, a crashed process, or a request that timed
 * out. `propose` catches this and falls back to `src: "none"` (ADR 0020 §4). */
export class KataGoUnavailable extends Error {}

export class KataGoClient {
  private readonly opts: Required<Omit<KataGoOptions, 'overrideConfig'>> &
    Pick<KataGoOptions, 'overrideConfig'>;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, Pending>();
  private nextId = 0;
  private deadReason: string | null = null;

  constructor(opts: KataGoOptions) {
    this.opts = { timeoutMs: 30_000, ...opts };
  }

  private start(): void {
    if (this.proc) return;
    this.deadReason = null;
    const args = ['analysis', '-config', this.opts.configPath, '-model', this.opts.modelPath];
    // The example config's logDir is relative to the current directory (analysis_logs/), which
    // would litter wherever this process happens to run from; keep KataGo's own logs out of the
    // repo by default. A fixed shared directory would let two KataGo processes (this client after
    // a restart, or two clients in the same run, e.g. tests) collide on the same log files, so
    // each spawn gets its own fresh directory under the OS temp dir instead. A caller's
    // overrideConfig, if given, is appended after and so wins on any key it repeats (KataGo takes
    // the last value of a repeated override key).
    const defaultOverride = `logDir=${mkdtempSync(join(tmpdir(), 'ligo-katago-logs-'))}`;
    const override = this.opts.overrideConfig
      ? `${defaultOverride},${this.opts.overrideConfig}`
      : defaultOverride;
    args.push('-override-config', override);
    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(this.opts.bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      throw new KataGoUnavailable(`could not start katago: ${(e as Error).message}`);
    }
    this.proc = proc;
    const rl = createInterface({ input: proc.stdout });
    rl.on('line', line => this.onLine(line));
    proc.on('error', e => this.die(`katago process error: ${e.message}`));
    proc.on('exit', (code, signal) => this.die(`katago exited (code ${code}, signal ${signal})`));
    proc.stderr.on('data', () => {
      /* KataGo logs progress to stderr; nothing we act on here. */
    });
    // A KataGo that exits immediately (a bad binary, a config error) closes its stdin from the
    // other end; writing to it after that raises an uncaught EPIPE that would otherwise kill this
    // whole process. `proc.on('exit', ...)` above already calls `die`, but Node can emit stdin's
    // own 'error' first (or `write`'s callback can be called with none, since EPIPE is also
    // surfaced as an event on the stream) — handle both so every path ends in `die`, never a throw.
    proc.stdin.on('error', e => this.die(`katago stdin error: ${(e as Error).message}`));
  }

  private die(reason: string): void {
    this.deadReason = reason;
    const proc = this.proc;
    this.proc = null;
    if (proc) {
      proc.removeAllListeners();
      proc.stdout.removeAllListeners();
      try {
        proc.kill();
      } catch {
        /* already gone */
      }
    }
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new KataGoUnavailable(reason));
      this.pending.delete(id);
    }
  }

  private onLine(line: string): void {
    let msg: { id?: string; error?: string; warning?: string; ownership?: number[] };
    try {
      msg = JSON.parse(line);
    } catch {
      return; // not JSON we understand; ignore rather than crash the client
    }
    if (!msg.id) return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    // KataGo can emit a `warning` line carrying the same id as the query it warns about, before
    // its real answer (e.g. "warning: consider increasing numSearchThreads"); it has no
    // `ownership` and isn't the reply this request is waiting for, so it's ignored and the
    // request stays pending for the line that does carry one (or the error/timeout that follows).
    if (msg.warning !== undefined && msg.ownership === undefined) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error) p.reject(new KataGoUnavailable(`katago error: ${msg.error}`));
    else p.resolve(msg);
  }

  private query(payload: Record<string, unknown>): Promise<{ ownership: number[] }> {
    this.start();
    const proc = this.proc;
    if (!proc) return Promise.reject(new KataGoUnavailable(this.deadReason ?? 'katago not running'));
    const id = `q${this.nextId++}`;
    const line = JSON.stringify({ ...payload, id }) + '\n';
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // A KataGo that never answers is hung, not merely slow on this one request: leaving it
        // running would mean every later request times out too. `die` kills the process and
        // rejects any other pending requests with it; `start()` spawns a fresh one next time.
        this.die(`katago request timed out after ${this.opts.timeoutMs}ms`);
      }, this.opts.timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      proc.stdin.write(line, err => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(new KataGoUnavailable(`could not write to katago: ${err.message}`));
        }
      });
    });
  }

  /** The two ownership maps `propose` needs (memo 1.3): one query with Black to move, one with
   * White to move, board only, no move history. */
  async ownershipMaps(board: Board, rules: GobanRules, komi: number): Promise<OwnershipMaps> {
    const boardYSize = board.length;
    const boardXSize = board[0].length;
    const initialStones: [string, string][] = [];
    for (let y = 0; y < boardYSize; y += 1) {
      for (let x = 0; x < boardXSize; x += 1) {
        if (board[y][x] === BLACK) initialStones.push(['B', `(${x},${y})`]);
        else if (board[y][x] === WHITE) initialStones.push(['W', `(${x},${y})`]);
      }
    }
    const kataRules = rules === 'chinese' ? 'chinese' : 'japanese';
    const base = {
      initialStones,
      moves: [],
      rules: kataRules,
      komi,
      boardXSize,
      boardYSize,
      includeOwnership: true,
    };
    const [black, white] = await Promise.all([
      this.query({ ...base, initialPlayer: 'B' }),
      this.query({ ...base, initialPlayer: 'W' }),
    ]);
    return {
      blackToMove: toRows(black.ownership, boardXSize),
      whiteToMove: toRows(white.ownership, boardXSize),
    };
  }

  /**
   * One analysis query as KataGo's analysis engine takes it (its docs/Analysis_Engine.md), without
   * `id`, which the client sets. The reply must carry ownership, so pass `includeOwnership: true`:
   * a reply without it is taken for one of KataGo's warnings and waited past. Used by
   * `tools/puzzles` for its second opinion (ADR 0025 §2); `propose` uses `ownershipMaps`.
   */
  analyse(payload: Record<string, unknown>): Promise<Record<string, unknown> & { ownership: number[] }> {
    return this.query(payload) as Promise<Record<string, unknown> & { ownership: number[] }>;
  }

  close(): void {
    this.die('closed');
  }
}

function toRows(flat: number[], width: number): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y * width < flat.length; y += 1) {
    rows.push(flat.slice(y * width, y * width + width));
  }
  return rows;
}
