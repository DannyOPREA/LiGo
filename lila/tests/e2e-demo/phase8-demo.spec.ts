// The Phase 8 demo on the real stack (unit 8.8 part two): at phone size, a new player signs up and
// plays the puzzles /training gives them until they have solved one and failed one, watching their
// puzzle rating move both ways, all against lila's own selection, rating maths and storage. Then
// every committed puzzle (tools/puzzles/data) is asked of the server by id and must come back as
// committed, with its source line, and a spread of them opens on the trainer page. Part one
// (ui/puzzle/e2e/demo.spec.ts) plays the same walk on the built page with a stand-in server.
// Needs `dev/ligo up` (which loads the puzzles into an empty database). Waits are on DOM state only.
// Licence: AGPL-3.0-or-later, like the rest of lila.

import { expect, test, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

interface Tree {
  x: number;
  y: number;
  branches?: Tree[];
  correct_answer?: boolean;
  wrong_answer?: boolean;
}

interface Bounds {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

interface Puzzle {
  id: string;
  source: string;
  width: number;
  bounds?: Bounds;
  initial_state: { black: string; white: string };
  initial_player: 'black' | 'white';
  move_tree: Tree;
}

// Playwright loads this folder's specs as CommonJS (lila's package.json has no "type": "module").
const dataDir = join(__dirname, '../../../tools/puzzles/data');

/** The committed set as tools/puzzles writes it. */
const committed: Array<Omit<Puzzle, 'source'> & { provenance: { seed: number } }> = readdirSync(dataDir)
  .filter(f => /^generated-.*\.json$/.test(f))
  .sort()
  .flatMap(f => JSON.parse(readFileSync(join(dataDir, f), 'utf8')));

const point = (n: Tree) => String.fromCharCode(97 + n.x, 97 + n.y);
const boundsOf = (p: Puzzle): Bounds =>
  p.bounds ?? { top: 0, left: 0, bottom: p.width - 1, right: p.width - 1 };

/** The right move that ends the puzzle at once, if there is one. */
const oneMoveWin = (p: Puzzle) => p.move_tree.branches!.find(b => b.correct_answer && !b.branches?.length);

/**
 * A first move that is wrong: one the tree refutes, else an empty point the tree doesn't know with an
 * empty neighbour, so that goban takes it (a move off the tree is wrong in goban's free mode).
 */
function wrongFirst(p: Puzzle): string {
  const refuted = p.move_tree.branches!.find(b => b.branches?.some(r => r.wrong_answer));
  if (refuted) return point(refuted);
  const b = boundsOf(p);
  const stones = new Set([p.initial_state.black, p.initial_state.white].flatMap(s => s.match(/../g) ?? []));
  const known = new Set(p.move_tree.branches!.map(point));
  const empty = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < p.width && y < p.width && !stones.has(String.fromCharCode(97 + x, 97 + y));
  for (let y = b.top; y <= b.bottom; y++)
    for (let x = b.left; x <= b.right; x++) {
      const pt = String.fromCharCode(97 + x, 97 + y);
      const free = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ].some(([nx, ny]) => empty(nx, ny));
      if (empty(x, y) && !known.has(pt) && free) return pt;
    }
  throw new Error(`no wrong move found in puzzle ${p.id}`);
}

const board = (page: Page) => page.locator('.puzzle__go-board svg').first();
const feedback = (page: Page) => page.locator('.puzzle__feedback');
const ratingBox = (page: Page) => page.locator('.puzzle__side__user__rating');

/** The puzzle on show: its id from the page, its board and tree from the server's API. */
async function shown(page: Page): Promise<Puzzle> {
  const id = (await page.locator('.puzzle__side__metas a').first().textContent())!.trim().replace(/^#/, '');
  const res = await page.request.get(`/api/puzzle/${id}`);
  expect(res.ok(), `GET /api/puzzle/${id}`).toBe(true);
  return (await res.json()).puzzle;
}

/** Taps an SGF point and confirms it, as on a phone: goban shows the bounds, with a label band on the board's own edges. */
async function tapAndConfirm(page: Page, p: Puzzle, move: string) {
  await board(page).scrollIntoViewIfNeeded();
  const box = (await board(page).boundingBox())!;
  const b = boundsOf(p);
  const band = (edge: boolean) => (edge ? 1 : 0);
  const square = box.width / (b.right - b.left + 1 + band(b.left === 0) + band(b.right === p.width - 1));
  const [x, y] = [move.charCodeAt(0) - 97, move.charCodeAt(1) - 97];
  await page.touchscreen.tap(
    box.x + (x - b.left + band(b.left === 0) + 0.5) * square,
    box.y + (y - b.top + band(b.top === 0) + 0.5) * square,
  );
  const confirm = page.getByRole('button', { name: 'Confirm move' });
  await expect(confirm).toBeEnabled();
  // goban ignores a confirm within 50 ms of the tap: press until the board has taken the move
  await expect(async () => {
    if (await confirm.isVisible()) await confirm.click({ timeout: 1000 });
    await expect(feedback(page)).not.toHaveClass(/\bplay\b/, { timeout: 1000 });
  }).toPass();
}

/** A number in the rating box: the rating lila shows (the one before the last result), or the change. */
const ratingNumber = async (page: Page, sel: string) =>
  Number((await ratingBox(page).locator(sel).first().textContent())!.match(/\d+/)![0]);

test('a new player solves a puzzle and fails one, and the rating moves both ways', async ({ page }, info) => {
  test.skip(!info.project.use.isMobile, 'the Phase 8 demo is at phone size');
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));

  // Sign up (email confirmation is off in development). lila's CSRF check wants an XHR or the site's
  // own Origin on a POST; the session cookie stays in this context. The name uses the letters a-j
  // only, so it can't look like a title (GM, FM, ...).
  const name = `puz${[...Date.now().toString()].map(d => String.fromCharCode(97 + Number(d))).join('')}`;
  const signup = await page.request.post('/signup', {
    headers: { 'x-requested-with': 'XMLHttpRequest' },
    form: {
      username: name,
      password: `${name}-Go-${Date.now()}`,
      email: `${name}@gmail.com`,
      'agreement.assistance': 'true',
      'agreement.nice': 'true',
      'agreement.account': 'true',
      goRank: '',
    },
  });
  expect(signup.ok(), `signup: ${signup.status()}`).toBe(true);

  // The rating bands are built shortly after lila starts: until then /training has no puzzle to give.
  await expect(async () => {
    await page.goto('/training');
    await expect(board(page)).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 90_000 });
  await expect(page.locator('body')).toHaveAttribute('data-user', name);

  // Play what /training gives (a puzzle opened by its id would be casual): solve one that ends in one
  // move, fail the others, until there is one of each. 199 of the 240 end in one move.
  let won = 0;
  let lost = 0;
  let expected: number | undefined; // the rating lila should show after the next result
  for (let round = 0; round < 10 && !(won && lost); round++) {
    if (round > 0) await page.locator('.puzzle__feedback .continue').click();
    await expect(feedback(page)).toHaveClass(/\bplay\b/);
    const p = await shown(page);
    await expect(page.locator('.puzzle__source'), p.id).toHaveText(p.source);
    const win = won ? undefined : oneMoveWin(p);
    if (win) {
      await tapAndConfirm(page, p, point(win));
      await expect(feedback(page).locator('.complete'), p.id).toHaveText('Success!');
      await expect(ratingBox(page).locator('good.rp'), p.id).toHaveText(/^\+\d+$/);
      won++;
    } else {
      await tapAndConfirm(page, p, wrongFirst(p));
      await expect(feedback(page), p.id).toHaveClass(/\bfail\b/);
      await expect(ratingBox(page).locator('bad.rp'), p.id).toHaveText(/^−\d+$/);
      lost++;
    }
    // lila shows the rating before this result, then the change: it carries on from the last result
    const before = await ratingNumber(page, 'strong');
    if (expected !== undefined) expect(before, p.id).toBe(expected);
    const change = await ratingNumber(page, win ? 'good.rp' : 'bad.rp');
    expected = win ? before + change : before - change;
  }
  expect(won, 'a puzzle solved').toBe(1);
  expect(lost, 'a puzzle failed').toBeGreaterThanOrEqual(1);
  await expect(page.locator('.puzzle__session a.result-true')).toHaveCount(1);
  await expect(page.locator('.puzzle__session a.result-false')).toHaveCount(lost);
  expect(errors).toEqual([]);
});

test('every committed puzzle is on the server as committed, with its source', async ({ page }, info) => {
  test.skip(!info.project.use.isMobile, 'the Phase 8 demo is at phone size');
  expect(committed.length).toBeGreaterThanOrEqual(200);
  // One by one: /api/puzzle/:id has no rate limit (/api/puzzle/many costs a credit a puzzle, 300 an hour).
  for (const c of committed) {
    const res = await page.request.get(`/api/puzzle/${c.id}`);
    expect(res.ok(), `GET /api/puzzle/${c.id}`).toBe(true);
    const served: Puzzle = (await res.json()).puzzle;
    expect(served.source, c.id).toBe(`Generated by LiGo (seed ${c.provenance.seed})`);
    const facts = (p: Omit<Puzzle, 'source' | 'id'>) => ({
      width: p.width,
      bounds: p.bounds,
      initial_state: p.initial_state,
      initial_player: p.initial_player,
      move_tree: p.move_tree,
    });
    expect(facts(served), c.id).toEqual(facts(c));
  }

  // A spread of them on the trainer page: the board, the goal and the source line.
  for (const c of committed.filter((_, i) => i % 24 === 0)) {
    await page.goto(`/training/${c.id}`);
    await expect(board(page), c.id).toBeVisible();
    await expect(page.locator('.puzzle__source'), c.id).toHaveText(
      `Generated by LiGo (seed ${c.provenance.seed})`,
    );
    await expect(feedback(page), c.id).toContainText(/(Black|White) to (live|kill)/);
  }
});
