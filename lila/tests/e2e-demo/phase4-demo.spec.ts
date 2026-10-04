// The Phase 4 demo (unit 4.12): two anonymous players, in two separate browser contexts, play 19x19
// Japanese games with byo-yomi (the lobby's 5+5×10s tile) on the real stack (lila, lila-ws, the scoring worker) through the
// scoring phase. Game 1 ends with the proposal accepted; in game 2 Black marks a stone dead and
// accepts, White resumes instead, Black captures the stone in play and both accept the second count.
// Each game's SGF export is then read back through goban-engine (libs/board) to the same position
// and result. The proposal may come from KataGo or, with none installed, mark nothing dead, so the
// test checks the count it is shown rather than a fixed one. Waits are on DOM state only.
// Licence: AGPL-3.0-or-later, like the rest of lila.

import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const size = 19;

// A game takes seconds, but waiting out lila's new-game rate limit can take most of a minute.
test.describe.configure({ timeout: 240_000 });

/**
 * The last position of an SGF's main line, as libs/board's `readTree` (over goban-engine) reads it. It runs
 * in its own Node process: Playwright's loader turns ES modules it imports into CommonJS, which goban-engine's
 * default export doesn't survive.
 */
type End = { stones: Record<Color, string[]>; captures: Record<Color, number> };
// (this spec is loaded as CommonJS, so it has __dirname and no import.meta)
const sgfReader = pathToFileURL(resolve(__dirname, '../../../libs/board/src/sgf.mjs')).href;
const readEnd = (sgf: string): End =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { readTree } from ${JSON.stringify(sgfReader)};
         import { readFileSync } from 'node:fs';
         let n = readTree(readFileSync(0, 'utf8'));
         while (n.children.length) n = n.children[0];
         console.log(JSON.stringify({ stones: n.stones, captures: n.captures }));`,
      ],
      { input: sgf, encoding: 'utf8' },
    ),
  );
type Color = 'black' | 'white';

/** The stones of a colour on a page's goban board: goban draws each as a <use> of a colour-named symbol. */
const stones = (page: Page, color: Color) =>
  page.locator(`.round__go-board svg g.grid use[href*="-${color}-"]`);

/** Where an SGF point is on screen: one square-wide coordinate band surrounds the grid. */
async function pointOf(page: Page, sgf: string) {
  const [col, row] = [sgf.charCodeAt(0) - 97, sgf.charCodeAt(1) - 97];
  const box = (await page.locator('.round__go-board svg').first().boundingBox())!;
  const square = box.width / (size + 2);
  return { x: box.x + (col + 1.5) * square, y: box.y + (row + 1.5) * square };
}

const passButton = (page: Page) => page.getByRole('button', { name: 'Pass' });

/** Clicks a point, or on a phone taps it (and confirms, while playing: unit 2.3's Confirm move). */
async function tapPoint(page: Page, sgf: string, phone: boolean, confirm: boolean) {
  const p = await pointOf(page, sgf);
  if (!phone) return page.mouse.click(p.x, p.y);
  await page.touchscreen.tap(p.x, p.y);
  if (!confirm) return;
  const button = page.getByRole('button', { name: 'Confirm move' });
  await expect(button).toBeVisible();
  await expect(async () => {
    if (await button.isVisible()) await button.click();
    await expect(passButton(page)).toBeDisabled({ timeout: 1000 });
  }).toPass();
}

/** Plays a stone; it has gone to the server once the player's own Pass button is back and disabled. */
async function playStone(page: Page, color: Color, sgf: string, phone: boolean) {
  const before = await stones(page, color).count();
  await expect(passButton(page)).toBeEnabled();
  await tapPoint(page, sgf, phone, true);
  await expect(passButton(page)).toBeDisabled();
  await expect(stones(page, color)).toHaveCount(before + 1);
}

async function pass(page: Page) {
  await expect(passButton(page)).toBeEnabled();
  await passButton(page).click();
  // disabled until the opponent moves, or gone when this pass opens the scoring phase
  await expect(passButton(page).and(page.locator(':enabled'))).toHaveCount(0);
}

/** Black's and White's turns in order; `pass` is a pass. */
async function playMoves(black: Page, white: Page, moves: string[], phone: boolean) {
  for (const [i, m] of moves.entries()) {
    const [page, color]: [Page, Color] = i % 2 === 0 ? [black, 'black'] : [white, 'white'];
    if (m === 'pass') await pass(page);
    else await playStone(page, color, m, phone);
  }
}

const colorOf = async (page: Page): Promise<Color> =>
  (await page.locator('.rclock-bottom').getAttribute('class'))!.includes('rclock-black') ? 'black' : 'white';

const total = (page: Page) => page.locator('.go-scoring__count tfoot');
const acceptButton = (page: Page) => page.getByRole('button', { name: 'Accept score' });

/** Both players see the count: the scoring board, the count table, and the clocks stopped. */
async function countShown(pages: Page[]) {
  for (const p of pages) {
    await expect(p.locator('.go-scoring__count')).toBeVisible();
    await expect(acceptButton(p)).toBeEnabled();
    await expect(p.getByRole('button', { name: 'Resume play' })).toBeEnabled();
    await expect(p.locator('.go-scoring__countdown')).toBeVisible();
  }
}

/** Both accept the count on show; the game ends with the same result on both pages, which it returns. */
async function bothAccept(black: Page, white: Page): Promise<string> {
  const shown = (await total(black).textContent())!;
  await acceptButton(black).click();
  await expect(black.locator('.go-scoring__accepted')).toHaveText(
    'You accepted this score. Waiting for your opponent.',
  );
  await expect(white.locator('.go-scoring__accepted')).toHaveText('Your opponent accepted this score.');
  await acceptButton(white).click();
  const result = black.locator('.result-wrap .result');
  await expect(result).toHaveText(/^([BW]\+\d+(\.5)?|0)$/);
  const text = (await result.textContent())!;
  for (const p of [black, white]) {
    await expect(p.locator('.result-wrap .result')).toHaveText(text);
    await expect(p.locator('.go-scoring--final .go-scoring__count tfoot')).toHaveText(shown);
    await expect(acceptButton(p)).toHaveCount(0);
  }
  return text;
}

/** The game's SGF export, read back through goban-engine: the board each page ends on, and the result. */
async function sgfMatches(page: Page, result: string) {
  const id = new URL(page.url()).pathname.slice(1, 9);
  const response = await page.request.get(`/game/export/${id}?format=sgf`);
  expect(response.ok()).toBe(true);
  const sgf = await response.text();
  expect(sgf).toContain('SZ[19]');
  expect(sgf).toContain('RU[Japanese]');
  expect(sgf).toContain('KM[6.5]');
  expect(sgf).toMatch(/TM\[300\]OT\[5x10 byo-yomi\]/);
  expect(sgf).toContain(`RE[${result}]`);
  const node = readEnd(sgf);
  for (const color of ['black', 'white'] as const)
    await expect(stones(page, color)).toHaveCount(node.stones[color].length);
  return node;
}

/** Two anonymous players paired by the lobby's 19x19 byo-yomi tile. Returns them by colour. */
async function newGame(browser: Browser, info: TestInfo, contexts: BrowserContext[]) {
  const errors: string[] = [];
  const newPlayer = async (name: string) => {
    // browser.newContext() doesn't inherit the project's `use`: pass what matters here.
    const { baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent } = info.project.use;
    const context = await browser.newContext({
      baseURL,
      viewport,
      isMobile,
      hasTouch,
      deviceScaleFactor,
      userAgent,
    });
    contexts.push(context);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(`${name}: ${e}`));
    return page;
  };
  const a = await newPlayer('A');
  const b = await newPlayer('B');

  // Both players click the lobby's 19x19 byo-yomi quick-pairing tile (5 min, then 5 x 10 s). For guests it
  // opens a casual open game, and the server pairs the two (unit 6.6). A click before the lobby's script
  // runs does nothing, and lila allows 5 new games a minute from one address (upstream's rate limit, which
  // the other demo games share), so each player clicks until the server takes the game.
  for (const p of [a, b]) {
    await p.goto('/');
    await expect(async () => {
      const created = p.waitForResponse(
        r => r.url().includes('/setup/hook/') && r.request().method() === 'POST',
        {
          timeout: 5000,
        },
      );
      await p.getByRole('button', { name: /^5\+5×10s / }).click();
      expect((await created).ok()).toBe(true);
    }).toPass({ intervals: [5_000, 10_000, 15_000], timeout: 120_000 });
  }

  const round = /\/([A-Za-z0-9]{8})([A-Za-z0-9]{4})?$/;
  await expect(a).toHaveURL(round);
  await expect(b).toHaveURL(round);
  for (const p of [a, b]) {
    await expect(p.locator('.round__go-board svg').first()).toBeVisible();
    await expect(p.locator('.go-setup')).toHaveText('19×19 • Japanese • komi 6.5');
    // byo-yomi: each clock shows its periods still to come
    await expect(p.locator('div.byoyomi')).toHaveText(['+5×10s', '+5×10s']);
    await expect(p.locator('.ruser.online')).toHaveCount(2);
  }
  const black = (await colorOf(a)) === 'black' ? a : b;
  const white = black === a ? b : a;
  return { black, white, errors };
}

test('game 1: a 19x19 byo-yomi game, both pass and accept the count', async ({ browser }, info) => {
  const phone = !!info.project.use.isMobile;
  const contexts: BrowserContext[] = [];
  try {
    const { black, white, errors } = await newGame(browser, info, contexts);
    await playMoves(black, white, ['dd', 'pp', 'dp', 'pd', 'pass', 'pass'], phone);
    await countShown([black, white]);
    const result = await bothAccept(black, white);
    for (const p of [black, white]) await sgfMatches(p, result);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});

test('game 2: Black marks a stone dead, White resumes, Black captures it, both accept', async ({
  browser,
}, info) => {
  const phone = !!info.project.use.isMobile;
  const contexts: BrowserContext[] = [];
  try {
    const { black, white, errors } = await newGame(browser, info, contexts);
    // White's dd sits in Black's corner with three of its four liberties taken.
    await playMoves(black, white, ['dc', 'dd', 'cd', 'pp', 'ed', 'pd', 'pass', 'pass'], phone);
    await countShown([black, white]);

    // Black taps White's dd: its mark flips, both see the recount.
    const before = (await total(white).textContent())!;
    await tapPoint(black, 'dd', phone, false);
    for (const p of [black, white]) {
      await expect(total(p)).not.toHaveText(before);
      await expect(acceptButton(p)).toBeEnabled();
    }
    await acceptButton(black).click();
    await expect(white.locator('.go-scoring__accepted')).toHaveText('Your opponent accepted this score.');

    // White disagrees and resumes: the marks go, Black (the opponent of the second passer) moves.
    await white.getByRole('button', { name: 'Resume play' }).click();
    for (const p of [black, white]) await expect(p.locator('.go-scoring')).toHaveCount(0);
    await expect(passButton(black)).toBeEnabled();

    // Black captures dd in play; White passes, then Black: the second scoring phase.
    await playStone(black, 'black', 'de', phone);
    for (const p of [black, white]) await expect(stones(p, 'white')).toHaveCount(2);
    await pass(white);
    await pass(black);
    await countShown([black, white]);
    const result = await bothAccept(black, white);
    for (const p of [black, white]) {
      const end = await sgfMatches(p, result);
      expect(end.captures).toEqual({ black: 1, white: 0 });
    }
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});
