// A client for one long-running `katago analysis` process (docs/build-vs-buy/scoring.md,
// ADR 0016): JSON-lines queries by id, restarted after it crashes. Only what `propose` needs:
// two ownership maps per position (black to move, white to move), each under its own per-request
// timeout (ADR 0020 §4).
//
// Coordinates: KataGo's analysis engine accepts a location as `"(x,y)"` with explicit integer
// coordinates (its docs/Analysis_Engine.md); its own source (cpp/game/board.cpp,
// Location::getLoc/getX/getY) makes y increase in the same row-major, top-to-bottom order as its
// `ownership` reply and as this package's board matrix (row 0 = top), so no coordinate flip is
// needed either way.
//
// Licence: MIT (LiGo's own code, ADR 0006).
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
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
    // repo by default. A caller's overrideConfig, if given, is appended after and so wins on any
    // key it repeats (KataGo takes the last value of a repeated override key).
    const defaultOverride = `logDir=${join(tmpdir(), 'ligo-katago-logs')}`;
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
    let msg: { id?: string; error?: string; warning?: string };
    try {
      msg = JSON.parse(line);
    } catch {
      return; // not JSON we understand; ignore rather than crash the client
    }
    if (!msg.id) return;
    const p = this.pending.get(msg.id);
    if (!p) return;
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
        this.pending.delete(id);
        reject(new KataGoUnavailable(`katago request timed out after ${this.opts.timeoutMs}ms`));
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
