// The Phase 8 demo on the real stack (unit 8.8 part two): at phone size, a new player signs up,
// solves the puzzle /training gives them, fails the next one, and sees their puzzle rating move both
// ways, all against lila's own selection, rating maths and storage. Then every committed puzzle
// (tools/puzzles/data) is asked of the server by id and must come back with its board, its tree and
// its source line, and a spread of them opens on the trainer page. Part one
// (ui/puzzle/e2e/demo.spec.ts) plays the same walk on the built page with a stand-in server.
// Needs `dev/ligo up` (which loads the puzzles into an empty database). Waits are on DOM state only.
// Licence: AGPL-3.0-or-later, like the rest of lila.

import { expect, test, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Tree {
  x: number;
  y: number;
  branches?: Tree[];
  correct_answer?: boolean;
  wrong_answer?: boolean;
}

interface Puzzle {
  id: string;
  source: string;
  goal: string;
  width: number;
  bounds?: { top: number; left: number; bottom: number; right: number };
  initial_state: { black: string; white: string };
  initial_player: 'black' | 'white';
  move_tree: Tree;
}

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../../../tools/puzzles/data');

/** The committed set as tools/puzzles writes it. */
const committed: Array<{ id: string; provenance: { seed: number }; move_tree: Tree }> = readdirSync(dataDir)
  .filter(f => /^generated-.*\.json$/.test(f))
  .sort()
  .flatMap(f => JSON.parse(readFileSync(join(dataDir, f), 'utf8')));

const point = (n: Tree) => String.fromCharCode(97 + n.x, 97 + n.y);

/**
 * A first move that is wrong: one the tree refutes, else any empty point the tree doesn't know
 * (goban's free mode counts a move off the tree as wrong).
 */
function wrongFirst(p: Puzzle): string {
  const refuted = p.move_tree.branches!.find(b => b.branches?.some(r => r.wrong_answer));
  if (refuted) return point(refuted);
  const b = p.bounds ?? { top: 0, left: 0, bottom: p.width - 1, right: p.width - 1 };
  const taken = new Set(
    [p.initial_state.black, p.initial_state.white, ...p.move_tree.branches!.map(point)].flatMap(
      s => s.match(/../g) ?? [],
    ),
  );
  for (let y = b.top; y <= b.bottom; y++)
    for (let x = b.left; x <= b.right; x++) {
      const pt = String.fromCharCode(97 + x, 97 + y);
      if (!taken.has(pt)) return pt;
    }
  throw new Error(`no empty point in puzzle ${p.id}`);
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
  const b = p.bounds ?? { top: 0, left: 0, bottom: p.width - 1, right: p.width - 1 };
  const band = (edge: boolean) => (edge ? 1 : 0);
  const square = box.width / (b.right - b.left + 1 + band(b.left === 0) + band(b.right === p.width - 1));
  const [x, y] = [move.charCodeAt(0) - 97, move.charCodeAt(1) - 97];
  await page.touchscreen.tap(
    box.x + (x - b.left + band(b.left === 0) + 0.5) * square,
    box.y + (y - b.top + band(b.top === 0) + 0.5) * square,
  );
  const confirm = page.getByRole('button', { name: 'Confirm move' });
  await expect(confirm).toBeEnabled();
  // goban ignores a confirm within 50 ms of the tap: click until the board has taken the move
  await expect(async () => {
    if (await confirm.isVisible()) await confirm.click();
    await expect(feedback(page)).not.toHaveClass(/\bplay\b/, { timeout: 1000 });
  }).toPass();
}

test('a new player solves one puzzle and fails the next, and the rating moves both ways', async ({
  page,
}, info) => {
  test.skip(!info.project.use.isMobile, 'the Phase 8 demo is at phone size');
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));

  // Sign up (email confirmation is off in development): the session cookie stays in this context.
  const name = `puz${Date.now().toString(36)}`;
  const signup = await page.request.post('/signup', {
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
  await expect(page.locator('body')).toHaveAttribute('data-user', name.toLowerCase());

  // A puzzle solved in one move, opened by its id (rated, like any other).
  const oneMove = committed.find(p =>
    p.move_tree.branches!.some(b => b.correct_answer && !b.branches?.length),
  )!;
  await page.goto(`/training/${oneMove.id}`);
  await expect(feedback(page)).toHaveClass(/\bplay\b/);
  const first = await shown(page);
  expect(first.id).toBe(oneMove.id);
  await expect(page.locator('.puzzle__source')).toHaveText(first.source);

  // Solved: the rating goes up.
  await tapAndConfirm(
    page,
    first,
    point(first.move_tree.branches!.find(b => b.correct_answer && !b.branches?.length)!),
  );
  await expect(feedback(page).locator('.complete')).toHaveText('Success!');
  await expect(ratingBox(page).locator('good.rp')).toHaveText(/^\+\d+$/);
  // lila shows the rating before the result, then the change
  const number = async (sel: string) =>
    Number((await ratingBox(page).locator(sel).first().textContent())!.match(/\d+/)![0]);
  const beforeWin = await number('strong');
  const gain = await number('good.rp');

  // The next puzzle, and a wrong move: the rating goes down from where the win left it.
  await page.locator('.puzzle__feedback .continue').click();
  await expect(feedback(page)).toHaveClass(/\bplay\b/);
  const second = await shown(page);
  expect(second.id).not.toBe(first.id);
  await tapAndConfirm(page, second, wrongFirst(second));
  await expect(feedback(page)).toHaveClass(/\bfail\b/);
  await expect(ratingBox(page).locator('bad.rp')).toHaveText(/^−\d+$/);
  expect(await number('strong')).toBe(beforeWin + gain);

  // The session strip: one win, one loss.
  await expect(page.locator('.puzzle__session a.result-true')).toHaveCount(1);
  await expect(page.locator('.puzzle__session a.result-false')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('every committed puzzle is on the server with its board, tree and source', async ({ page }, info) => {
  test.skip(!info.project.use.isMobile, 'the Phase 8 demo is at phone size');
  expect(committed.length).toBeGreaterThanOrEqual(200);
  const byId = new Map<string, Puzzle>();
  for (let i = 0; i < committed.length; i += 50) {
    const ids = committed.slice(i, i + 50).map(p => p.id);
    const res = await page.request.get(`/api/puzzle/many?ids=${ids.join(',')}`);
    expect(res.ok(), `GET /api/puzzle/many (${i})`).toBe(true);
    for (const { puzzle } of (await res.json()).puzzles as Array<{ puzzle: Puzzle }>)
      byId.set(puzzle.id, puzzle);
  }
  for (const p of committed) {
    const served = byId.get(p.id);
    expect(served, `${p.id} is missing`).toBeDefined();
    expect(served!.source, p.id).toBe(`Generated by LiGo (seed ${p.provenance.seed})`);
    expect(served!.move_tree.branches?.length, `${p.id} tree`).toBeGreaterThan(0);
  }

  // A spread of them on the trainer page: the board, the goal and the source line.
  for (const p of committed.filter((_, i) => i % 24 === 0)) {
    await page.goto(`/training/${p.id}`);
    await expect(board(page), p.id).toBeVisible();
    await expect(page.locator('.puzzle__source'), p.id).toHaveText(byId.get(p.id)!.source);
    await expect(feedback(page), p.id).toContainText(/(Black|White) to (live|kill)/);
  }
});
