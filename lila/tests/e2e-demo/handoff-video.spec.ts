// The handoff demo video (unit 9.9 part two, ADR 0026 §7): one player's browser, recorded, walks through
// LiGo on the real stack: a 9x9 game from the lobby with a capture, two passes, the count and the result;
// a puzzle on /training; and a professional game imported from SGF on /paste and stepped through on its
// analysis board. The desktop project records it at 1280x800 and the phone project at phone size, so the
// two videos together show the phone layout too. A second, unrecorded browser plays the opponent.
// The videos are not committed (ADR 0026 §7): `dev/ligo e2e video` writes them to
// tests/e2e-demo/video/, and the e2e workflow uploads them as the `ligo-demo-video` artifact.
// Run with its own config (video.config.ts), which slows every action down for the viewer; the demo
// specs' config skips this file. Licence: AGPL-3.0-or-later, like the rest of lila.

import { expect, test, type BrowserContext, type Page, type Video } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { dismissAlert } from './lobby';
import { colorOf, newPlayer, passButton, playStone, sameGame, stones, type Color } from './players';

const size = 9;

test.describe.configure({ timeout: 600_000 });
test.use({ actionTimeout: 15_000 });

/**
 * A line of text across the top of the recorded page, saying what the viewer is watching. It ignores the
 * pointer, so clicks and taps go to the page under it; a new page needs it again.
 */
async function caption(page: Page, text: string) {
  await page.evaluate(t => {
    let el = document.getElementById('ligo-video-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ligo-video-caption';
      Object.assign(el.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        zIndex: '2147483647',
        padding: '6px 12px',
        background: 'rgba(0, 0, 0, 0.75)',
        color: '#fff',
        font: '600 15px/1.35 system-ui, sans-serif',
        textAlign: 'center',
        pointerEvents: 'none',
      });
      document.body.append(el);
    }
    el.textContent = t;
  }, text);
}

/** Video pacing, not a wait for the page: lets the viewer take in what is on screen before the next step. */
const hold = (page: Page, ms = 2500) => page.waitForTimeout(ms);

async function pass(page: Page) {
  await expect(passButton(page)).toBeEnabled();
  await passButton(page).click();
  // disabled until the opponent moves, or gone when this pass opens the scoring phase
  await expect(passButton(page).and(page.locator(':enabled'))).toHaveCount(0);
}

/** A point given in SGF letters ("ee") as the [column, row] players.ts takes. */
const at = (sgf: string) => [sgf.charCodeAt(0) - 97, sgf.charCodeAt(1) - 97];

/**
 * Black and White in turn; `pass` passes. White's lone stone at bb is surrounded and taken by Black's ba,
 * so the viewer sees a capture before both pass.
 */
const moves = ['ee', 'bb', 'cb', 'gg', 'bc', 'gc', 'ab', 'cg', 'ba', 'pass', 'pass'];

// ---- 1. A 9x9 game --------------------------------------------------------------------------------

async function playGame(me: Page, opponent: Page, phone: boolean) {
  await me.goto('/');
  await caption(me, 'LiGo: Go on a lichess-style server. First, a 9×9 game from the lobby.');
  await hold(me);

  // Create a 9x9 lobby game (casual: a guest's only mode). lila takes 5 new games a minute from one
  // address, which the other e2e games share: create again until the server takes it (as unit 3.20 does).
  const setup = me.getByRole('dialog');
  const openSetup = async () => {
    if (!(await setup.isVisible()))
      await me.locator('.lobby__start button.lobby__start__button--hook').click({ timeout: 5000 });
    await setup.locator('label[for=sf_size_9]').click({ timeout: 5000 });
    await expect(setup.locator('#sf_size_9')).toBeChecked();
  };
  await openSetup();
  await caption(me, 'Create a lobby game: 9×9, Fischer 5+3.');
  await hold(me, 1500);
  await expect(async () => {
    await dismissAlert(me);
    await openSetup();
    const [created] = await Promise.all([
      me.waitForResponse(r => r.url().includes('/setup/hook/') && r.request().method() === 'POST', {
        timeout: 5000,
      }),
      setup.locator('button.lobby__start__button--hook').click({ timeout: 5000 }),
    ]);
    expect(created.ok()).toBe(true);
  }).toPass({ intervals: [5_000, 10_000, 15_000], timeout: 120_000 });

  // The opponent joins it from Open challenges.
  await opponent.goto('/');
  await opponent.getByText('Open challenges').click();
  const hook = opponent.locator('tr.hook.join');
  await expect(hook).toHaveCount(1);
  await hook.click();
  await sameGame(me, opponent);
  await caption(me, 'Another player joined: the game starts. Japanese rules, komi 6.5.');
  await hold(me);

  const mine = await colorOf(me);
  const pages: Record<Color, Page> =
    mine === 'black' ? { black: me, white: opponent } : { black: opponent, white: me };
  await caption(
    me,
    phone
      ? 'On a phone, a tap shows the stone and Confirm move plays it.'
      : 'Black and White take turns. Watch the white stone in the top-left corner.',
  );
  for (const [i, m] of moves.entries()) {
    const color: Color = i % 2 === 0 ? 'black' : 'white';
    if (m === 'pass') await pass(pages[color]);
    else await playStone(pages[color], color, size, at(m), phone);
    if (m === 'ba') {
      // Black's ba took White's stone at bb
      for (const p of [me, opponent]) await expect(stones(p, 'white')).toHaveCount(3);
      await caption(me, 'Captured: the white stone had no liberties left.');
      await hold(me);
    }
  }

  // Two passes open the scoring phase: KataGo proposes the dead stones, both players accept.
  for (const p of [me, opponent]) await expect(p.locator('.go-scoring__count')).toBeVisible();
  await caption(me, 'Two passes: the scoring phase. Both players check the count and accept it.');
  await hold(me, 4000);
  const accept = (p: Page) => p.getByRole('button', { name: 'Accept score' });
  await accept(pages.black).click();
  await expect(pages.white.locator('.go-scoring__accepted')).toHaveText('Your opponent accepted this score.');
  await accept(pages.white).click();
  const result = me.locator('.result-wrap .result');
  await expect(result).toHaveText(/^([BW]\+\d+(\.5)?|0)$/);
  await expect(opponent.locator('.result-wrap .result')).toHaveText((await result.textContent())!);
  await result.scrollIntoViewIfNeeded();
  await caption(
    me,
    `Game over: ${(await result.textContent())!}. The game is saved and can be downloaded as SGF.`,
  );
  await hold(me, 4000);
}

// ---- 2. A puzzle ----------------------------------------------------------------------------------

interface Tree {
  x: number;
  y: number;
  branches?: Tree[];
  correct_answer?: boolean;
  wrong_answer?: boolean;
}
interface Puzzle {
  id: string;
  width: number;
  bounds?: { top: number; left: number; bottom: number; right: number };
  move_tree: Tree;
}

const puzzleBoard = (page: Page) => page.locator('.puzzle__go-board svg').first();
const feedback = (page: Page) => page.locator('.puzzle__feedback');

/** The puzzle on show, from the server's API (as the Phase 8 demo reads it). */
async function shownPuzzle(page: Page): Promise<Puzzle> {
  const id = (await page.locator('.puzzle__side__metas a').first().textContent())!.trim().replace(/^#/, '');
  const res = await page.request.get(`/api/puzzle/${id}`);
  expect(res.ok(), `GET /api/puzzle/${id}`).toBe(true);
  return (await res.json()).puzzle;
}

/** Plays a point on the puzzle board (goban shows only the puzzle's bounds, with a label band on board edges). */
async function playPuzzleMove(page: Page, p: Puzzle, n: Tree, phone: boolean) {
  await puzzleBoard(page).scrollIntoViewIfNeeded();
  const box = (await puzzleBoard(page).boundingBox())!;
  const b = p.bounds ?? { top: 0, left: 0, bottom: p.width - 1, right: p.width - 1 };
  const band = (edge: boolean) => (edge ? 1 : 0);
  const square = box.width / (b.right - b.left + 1 + band(b.left === 0) + band(b.right === p.width - 1));
  const x = box.x + (n.x - b.left + band(b.left === 0) + 0.5) * square;
  const y = box.y + (n.y - b.top + band(b.top === 0) + 0.5) * square;
  if (!phone) return page.mouse.click(x, y);
  await page.touchscreen.tap(x, y);
  const confirm = page.getByRole('button', { name: 'Confirm move' });
  await expect(confirm).toBeEnabled();
  // goban ignores a confirm within 50 ms of the tap: press until the board has taken the move
  await expect(async () => {
    if (await confirm.isVisible()) await confirm.click({ timeout: 1000 });
    await expect(feedback(page)).not.toHaveClass(/\bplay\b/, { timeout: 1000 });
  }).toPass();
}

async function solvePuzzle(page: Page, phone: boolean) {
  // The rating bands are built shortly after lila starts: until then /training has no puzzle to give.
  await expect(async () => {
    await page.goto('/training');
    await expect(puzzleBoard(page)).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 90_000 });
  await caption(page, 'Puzzles: tsumego that LiGo generates and checks with KataGo. Find the move.');
  await hold(page);
  // Play what /training gives until one ends in a single right move (most of them do), and solve it.
  for (let round = 0; round < 10; round++) {
    if (round > 0) {
      await page.locator('.puzzle__feedback .continue').click();
      await caption(page, 'Puzzles: tsumego that LiGo generates and checks with KataGo. Find the move.');
    }
    await expect(feedback(page)).toHaveClass(/\bplay\b/);
    const p = await shownPuzzle(page);
    const win = p.move_tree.branches!.find(b => b.correct_answer && !b.branches?.length);
    if (!win) {
      // a longer puzzle: show its solution and move on
      // (the button shows a few seconds into the puzzle)
      await feedback(page).locator('.view_solution.show .puzzle__view-solution').click();
      await expect(feedback(page)).not.toHaveClass(/\bplay\b/);
      continue;
    }
    await hold(page, 1500);
    await playPuzzleMove(page, p, win, phone);
    await expect(feedback(page).locator('.complete')).toHaveText('Success!');
    await caption(page, 'Solved. The puzzle rating moves, as on lichess.');
    await hold(page, 3500);
    return;
  }
  throw new Error('no one-move puzzle in 10 tries');
}

// ---- 3. An SGF import -----------------------------------------------------------------------------

// A game from 1846 (public domain), as the Phase 7 demo uses
const fixture = resolve(__dirname, 'fixtures/ear-reddening-1846.sgf');

async function importSgf(page: Page) {
  await page.goto('/paste');
  await caption(page, 'SGF import: paste a game record, here the famous "ear-reddening game" of 1846.');
  await page.locator('textarea[name="sgf"]').fill(readFileSync(fixture, 'utf8'));
  await hold(page);
  await page.locator('form.import button[type="submit"]').click();
  await expect(page).toHaveURL(/\/[A-Za-z0-9]{8}(\/(white|black))?$/);
  const id = new URL(page.url()).pathname.slice(1, 9);
  await page.goto(`/${id}/analysis`);
  const goban = page.locator('.analyse__go-board svg').first();
  await expect(goban).toBeVisible();
  await caption(page, 'The stored game opens on the analysis board. Step through it with the arrow keys.');
  const moves = page.locator('.analyse__moves move');
  await expect(moves).toHaveCount(325);
  await goban.scrollIntoViewIfNeeded();
  await moves.first().click();
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  await hold(page, 1500);
  await moves.nth(126).click(); // move 127, Shusaku's ear-reddening move
  await expect(page.locator('.analyse__moves move.active')).toHaveText(/127\s*/);
  await caption(page, "Move 127: the move that made his opponent's ears turn red.");
  await hold(page, 3500);
  await page.keyboard.press('End');
  await caption(page, 'The end of the game: Black wins by 2 points. Thanks for watching.');
  await hold(page, 4000);
}

// ---- The recording --------------------------------------------------------------------------------

test('the handoff demo video: a 9x9 game with scoring, a puzzle, an SGF import', async ({
  browser,
}, info) => {
  const phone = !!info.project.use.isMobile;
  const { viewport } = info.project.use;
  const contexts: BrowserContext[] = [];
  const dir = info.outputPath('raw');
  let video: Video | null = null;
  try {
    // The recorded player, at the project's size (a phone records its CSS pixels, not its device pixels)
    const recorded = await newPlayer(browser, info, contexts, 'me', {
      recordVideo: { dir, size: viewport! },
    });
    const me = recorded.page;
    video = me.video();
    const opponent = await newPlayer(browser, info, contexts, 'opponent');
    await playGame(me, opponent.page, phone);
    await solvePuzzle(me, phone);
    await importSgf(me);
    expect([...recorded.errors, ...opponent.errors]).toEqual([]);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
  // The video is written when its context closes.
  await video!.saveAs(join(__dirname, 'video', `ligo-demo-${info.project.name}.webm`));
});
