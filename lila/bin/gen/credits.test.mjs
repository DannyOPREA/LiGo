// Tests for the credits check (unit 9.8): run by dev/tests/run.sh with `node --test`.
// LiGo's own tooling (MIT, ADR 0006).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { problems, render } from './credits.mjs';

const entry = (copying, more = {}) => ({
  name: 'n',
  by: 'b',
  url: 'https://x',
  what: 'w',
  licence: 'MIT',
  copying,
  ...more,
});
const list = { sections: [{ title: 't', entries: [entry(['goban'], { puzzleFile: 'a.json' })] }] };
const copying = rows =>
  `# Copying\n\n## 3. Third-party code and assets\n\n| Component | Where | Licence | Notes |\n|---|---|---|---|\n${rows}\n\n## 4. Other\n\n| Component | x | y | z |\n|---|---|---|---|\n| Outside 1 | x | y | z |\n`;
const sources = files => `| File | Puzzles |\n|---|---|\n${files}\n`;
const ok = sources('| `a.json` | 1 |');

test('a covered row and puzzle file pass; rows outside §3 are not read', () => {
  assert.deepEqual(problems(list, copying('| goban 1 | x | MIT | y |'), ok), []);
});

test('a third party no entry names is caught', () => {
  const p = problems(list, copying('| goban 1 | x | MIT | y |\n| Mystery lib 2 | x | MIT | y |'), ok);
  assert.equal(p.length, 1);
  assert.match(p[0], /Mystery lib/);
});

test('a dependency row that only mentions a credited parent is caught', () => {
  const p = problems(list, copying('| leftpad 1, a dependency of goban | x | MIT | y |'), ok);
  assert.match(p.join(), /leftpad/);
});

test('a renamed or missing §3 heading fails instead of passing', () => {
  const p = problems(list, copying('| Mystery 1 | x | MIT | y |').replace('## 3. ', '## Three. '), ok);
  assert.match(p.join(), /no "## 3\." third-party section/);
});

test('a malformed row fails instead of being skipped', () => {
  const p = problems(list, copying('| goban 1 | x | MIT | y |\n|Foo lib 1 | x'), ok);
  assert.match(p.join(), /isn't a 4-column table row/);
});

test('a puzzle file with no entry is caught, backticks or not, any extension', () => {
  const p = problems(
    list,
    copying('| goban 1 | x | MIT | y |'),
    sources('| `a.json` | 1 |\n| gokyo.sgf | 2 |'),
  );
  assert.deepEqual(p, ['tools/puzzles/data/SOURCES.md lists gokyo.sgf, which no credits entry covers']);
});

test('an entry missing a field is caught', () => {
  const bad = {
    sections: [{ title: 't', entries: [entry(['goban'], { puzzleFile: 'a.json', licence: undefined })] }],
  };
  assert.match(problems(bad, copying('| goban 1 | x | MIT | y |'), ok).join(), /no licence/);
});

test('the page escapes what it prints', () => {
  const html = render({ sections: [{ title: 'A & B', entries: [entry([], { name: '<b>x</b>' })] }] });
  assert.match(html, /A &amp; B/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
});
