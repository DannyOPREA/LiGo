// tools/puzzles' command line (PLAN unit 8.3; `dev/ligo puzzles ...` calls it):
//   build --out FILE [--seed N] [--count N]   generate puzzles, checked by KataGo, into FILE
//   check [FILE...]                           check puzzle files (default: every file in data/)
//   gate [--seed N] [--need N]                the ADR 0025 §2 feasibility gate
//   sgf FILE [ID]                             print puzzles as SGF
//   import SGF META                           read a hand-transcribed problem (META: its JSON fields)
// KataGo comes from the environment `dev/ligo katago env` prints (KATAGO_BIN, KATAGO_NET).
//
// Licence: MIT (LiGo's own code, ADR 0007).
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { gate } from './gate.ts';
import { generate } from './generate.ts';
import { SecondOpinion, setupFromEnv } from './katago.ts';
import { check, type Puzzle } from './puzzle.ts';
import { fromSgf, toSgf, type Transcription } from './sgf.ts';

export const DATA_DIR = new URL('../data/', import.meta.url).pathname;

const fail = (msg: string): never => {
  console.error(`puzzles: ${msg}`);
  process.exit(1);
};

export function readPuzzles(file: string): Puzzle[] {
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(data)) fail(`${file}: not a JSON array of puzzles`);
  return data as Puzzle[];
}

/** One puzzle per line, so a diff shows which puzzles changed. */
export function writePuzzles(file: string, puzzles: Puzzle[]): void {
  writeFileSync(file, `[\n${puzzles.map(p => JSON.stringify(p)).join(',\n')}\n]\n`);
}

export function checkFiles(files: string[]): string[] {
  const problems: string[] = [];
  const ids = new Map<string, string>();
  for (const file of files) {
    readPuzzles(file).forEach((p, i) => {
      if (typeof p !== 'object' || p === null) {
        problems.push(`${file} #${i + 1}: not a puzzle object`);
        return;
      }
      const where = `${file} #${i + 1} (${(p as { id?: string }).id ?? 'no id'})`;
      for (const e of check(p)) problems.push(`${where}: ${e}`);
      if (ids.has(p.id)) problems.push(`${where}: id also used in ${ids.get(p.id)}`);
      ids.set(p.id, file);
    });
  }
  return problems;
}

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      out: { type: 'string' },
      seed: { type: 'string', default: '1' },
      count: { type: 'string', default: '100' },
      need: { type: 'string', default: '250' },
    },
  });
  const seed = Number(values.seed);
  switch (command) {
    case 'build': {
      if (!values.out) fail('build needs --out FILE');
      const setup = setupFromEnv() ?? fail('KataGo is needed: eval "$(dev/ligo katago env)" first');
      const opinion = new SecondOpinion(setup);
      console.log(`KataGo ${opinion.info.version}, network ${opinion.info.network}, ${setup.visits} visits`);
      try {
        const { puzzles, tally } = await generate({
          seed,
          count: Number(values.count),
          katago: { info: opinion.info, check: (p, pos, b) => opinion.check(p, pos, b) },
          log: line => console.log(line),
        });
        writePuzzles(values.out!, puzzles);
        console.log(JSON.stringify(tally, null, 2));
        console.log(`wrote ${puzzles.length} puzzles to ${values.out}`);
      } finally {
        opinion.close();
      }
      return;
    }
    case 'check': {
      const files = positionals.length
        ? positionals
        : existsSync(DATA_DIR)
          ? readdirSync(DATA_DIR)
              .filter(f => f.endsWith('.json'))
              .sort()
              .map(f => join(DATA_DIR, f))
          : [];
      const problems = checkFiles(files);
      for (const p of problems) console.error(p);
      const count = files.reduce((n, f) => n + readPuzzles(f).length, 0);
      if (problems.length) fail(`${problems.length} problems in ${count} puzzles`);
      console.log(`${count} puzzles in ${files.length} files: all pass`);
      return;
    }
    case 'gate': {
      const r = gate(seed, Number(values.need));
      console.log(JSON.stringify(r, null, 2));
      if (!r.ok) fail(`the gate needs ${r.need} positions settled within the budget; ${r.passed} were`);
      return;
    }
    case 'sgf': {
      const [file, id] = positionals;
      if (!file) fail('sgf FILE [ID]');
      for (const p of readPuzzles(file)) if (!id || p.id === id) process.stdout.write(toSgf(p));
      return;
    }
    case 'import': {
      const [sgfFile, metaFile] = positionals;
      if (!sgfFile || !metaFile) fail('import SGF META');
      const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Transcription;
      const p = fromSgf(readFileSync(sgfFile, 'utf8'), meta);
      const problems = check(p);
      if (problems.length) fail(`${sgfFile}: ${problems.join('; ')}`);
      console.log(JSON.stringify(p));
      return;
    }
    default:
      fail('commands: build, check, gate, sgf, import');
  }
}

if (import.meta.main) await main(process.argv.slice(2));
