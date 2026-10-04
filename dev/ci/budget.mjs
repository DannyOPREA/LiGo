#!/usr/bin/env node
// LiGo's performance budget for built browser code (ADR 0026 §5, unit 9.5): the gzipped size of
// the board chunk, lila's shared site code, each page's JavaScript and CSS, checked against the
// limits in budget.json. A page's entry may name its bundle (`js`) and stylesheet (`css`) when they
// differ from its key (unit 9.10 measures every page). The board's mount time is checked by the
// playground's page tests (lila/ui/playground/e2e/budget.spec.ts), which read the same file.
//
// Usage: node dev/ci/budget.mjs [lila-dir]   (after a production build: ui/build -p)
// Exits 1 when a size is over its limit, or when something the budget names is missing from the
// build. Sizes are gzip level 9, in KiB (1024 bytes).
// Licence: MIT (LiGo's own code, ADR 0006).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const lila = process.argv[2] ?? join(here, '../../lila');
const compiled = join(lila, 'public/compiled');
const cssDir = join(lila, 'public/css');
const budget = JSON.parse(readFileSync(join(here, 'budget.json'), 'utf8'));

const manifestFile = join(compiled, 'manifest.json');
if (!existsSync(manifestFile)) {
  console.error(`budget: ${manifestFile} is missing: build the ui first (ui/build -p)`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));

const kib = bytes => bytes / 1024;
const gz = file => gzipSync(readFileSync(file), { level: 9 }).length;

/** An entry's own file and the chunks it imports statically, as file names in public/compiled. */
function jsFiles(name) {
  const entry = manifest.js[name];
  if (!entry) throw new Error(`no "${name}" bundle in the build`);
  return [`${name}.${entry.hash}.js`, ...(entry.imports ?? [])];
}

const sum = files => [...new Set(files)].reduce((n, f) => n + gz(join(compiled, f)), 0);

/** The chunks a file refers to (static imports and `import()`), as file names in public/compiled. */
function refs(f) {
  const file = join(compiled, f);
  if (!existsSync(file)) throw new Error(`${f} is referenced but missing from ${compiled}`);
  return [...readFileSync(file, 'utf8').matchAll(/lib\.[A-Z0-9]+\.js/g)].map(([ref]) => ref).filter(r => r !== f);
}

/**
 * The board chunk: the lazily loaded chunk holding goban. No page imports it statically, so it is
 * found among the chunks the current build's entries reach (dev builds leave old chunks behind) by
 * a message only goban's board code carries.
 */
function boardChunk() {
  const seen = new Set();
  // Entry bundles only (they carry a hash); the manifest also lists shared chunks, inline scripts
  // and itself.
  const todo = Object.keys(manifest.js)
    .filter(name => manifest.js[name]?.hash)
    .flatMap(jsFiles);
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    todo.push(...refs(f));
  }
  const marker = 'Goban.theme_black_stones not set';
  const hits = [...seen].filter(f => readFileSync(join(compiled, f), 'utf8').includes(marker));
  if (hits.length !== 1) throw new Error(`expected one chunk with goban's board, found ${hits.length}`);
  return hits[0];
}

function cssFile(name) {
  const hash = manifest.css[name];
  if (!hash) throw new Error(`no "${name}" stylesheet in the build`);
  return join(cssDir, `${name}.${hash}.css`);
}

const measured = [];
let failed = false;
const check = (label, bytes, limitKiB) => {
  // A missing or mistyped limit must not pass as "ok" (anything > undefined is false).
  if (typeof limitKiB !== 'number' || !(limitKiB > 0)) throw new Error(`no limit for "${label}" in budget.json`);
  const over = kib(bytes) > limitKiB;
  failed ||= over;
  measured.push({ label, size: kib(bytes).toFixed(1), limit: limitKiB, result: over ? 'OVER' : 'ok' });
};

try {
  // The board chunk and any chunk it imports that no page loads before it: bytes the board costs.
  const board = boardChunk();
  const before = new Set(['site', ...Object.entries(budget.pages).map(([p, l]) => l.js ?? p)].flatMap(jsFiles));
  const boardOnly = refs(board).filter(f => !before.has(f));
  check('board chunk (goban + libs/board)', sum([board, ...boardOnly]), budget.boardChunkKiB);
  check('site JS (shared by every page)', sum(jsFiles('site')), budget.siteJsKiB);
  check('site CSS (theme + site)', gz(cssFile('lib.theme.all')) + gz(cssFile('site')), budget.siteCssKiB);
  for (const [page, limits] of Object.entries(budget.pages)) {
    // a page whose bundle or stylesheet has another name says so (`js`, `css`)
    const js = limits.js ?? page;
    check(`${page}: JS before the board (site + page)`, sum([...jsFiles('site'), ...jsFiles(js)]), limits.jsKiB);
    check(`${page}: own CSS`, gz(cssFile(limits.css ?? page)), limits.cssKiB);
  }
} catch (e) {
  console.error(`budget: ${e.message}`);
  process.exit(1);
}

console.table(measured);
if (failed) {
  console.error('budget: over the limit. Shrink it, or raise the limit in dev/ci/budget.json with a line in logs/frontend.md saying why.');
  process.exit(1);
}
console.log('budget: every size is within its limit');
