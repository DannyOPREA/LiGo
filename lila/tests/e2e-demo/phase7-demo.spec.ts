// The Phase 7 demo (unit 7.8), on the real stack (lila, lila-ws, the scoring worker), desktop and phone.
//
// 1. Correspondence: two players sign up through the real /signup form (the dev server needs no email
//    confirmation), one challenges the other to a 9x9 game with 2 days per move from the lobby's
//    "Challenge a friend" dialog, the other accepts from the challenge dropdown, each plays a stone,
//    both pass, and the scoring phase shows its countdown in days with the days clock standing still.
//    The tab says "Time to count the game", the bell has that entry with the opponent's name, and the
//    lobby's now-playing row says it too. Both accept; the result is on both pages, the bell has the
//    game-end entry, and the game's SGF export reads back through goban-engine (libs/board).
// 2. The analysis board: a pro game from 1846 (public domain, fixtures/) is opened from an SGF file,
//    stepped through, given a variation, downloaded, and the file read back by goban-engine: main line
//    intact, variation present.
// 3. SGF import to a stored game (`/paste`, unit 7.5): the same text pasted into the import form, then the
//    same walk from the stored game's analysis board (`/<id>/analysis`).
// Waits are on DOM state only. Licence: AGPL-3.0-or-later, like the rest of lila.

import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { dismissAlert } from './lobby';

const size = 9;
type Color = 'black' | 'white';

// Signing up, the challenge, and waiting out lila's rate limits can take a while.
test.describe.configure({ timeout: 240_000 });
// a click or read that cannot happen fails after 15 s with its reason, rather than waiting out the test
test.use({ actionTimeout: 15_000 });

const sgfReader = pathToFileURL(resolve(__dirname, '../../../libs/board/src/sgf.mjs')).href;

/**
 * What an SGF's tree is, as libs/board's `readTree` (goban-engine) reads it, in its own Node process
 * (Playwright's loader turns ES modules it imports into CommonJS, which goban-engine doesn't survive):
 * the main line's length and last position, and each branching node's ply and moves.
 */
interface Tree {
  length: number;
  stones: Record<Color, string[]>;
  captures: Record<Color, number>;
  mainline: string[];
  branches: { ply: number; moves: string[] }[];
}
const readTreeOf = (sgf: string): Tree =>
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { readTree } from ${JSON.stringify(sgfReader)};
         import { readFileSync } from 'node:fs';
         let n = readTree(readFileSync(0, 'utf8'));
         const mainline = [], branches = [];
         while (n.children.length) {
           if (n.children.length > 1) branches.push({ ply: n.ply, moves: n.children.map(c => c.id) });
           n = n.children[0];
           mainline.push(n.id);
         }
         console.log(JSON.stringify({ length: mainline.length, stones: n.stones, captures: n.captures, mainline, branches }));`,
      ],
      { input: sgf, encoding: 'utf8' },
    ),
  );

// ---- Part 1: a correspondence game -------------------------------------------------------------

/** The stones of a colour on a game page's goban board. */
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

/** Plays a stone: a click, or on a phone a tap and Confirm move. Sent once the Pass button is disabled again. */
async function playStone(page: Page, color: Color, sgf: string, phone: boolean) {
  const before = await stones(page, color).count();
  await expect(passButton(page)).toBeEnabled();
  const p = await pointOf(page, sgf);
  if (!phone) await page.mouse.click(p.x, p.y);
  else {
    await page.touchscreen.tap(p.x, p.y);
    const confirm = page.getByRole('button', { name: 'Confirm move' });
    await expect(confirm).toBeVisible();
    await expect(async () => {
      if (await confirm.isVisible()) await confirm.click();
      await expect(passButton(page)).toBeDisabled({ timeout: 1000 });
    }).toPass({ timeout: 20_000 });
  }
  await expect(passButton(page)).toBeDisabled();
  await expect(stones(page, color)).toHaveCount(before + 1);
}

async function pass(page: Page) {
  await expect(passButton(page)).toBeEnabled();
  await passButton(page).click();
  // gone when this pass opens the scoring phase, disabled until the opponent moves otherwise
  await expect(passButton(page).and(page.locator(':enabled'))).toHaveCount(0);
}

const acceptButton = (page: Page) => page.getByRole('button', { name: 'Accept score' });
const bell = (page: Page) => page.locator('#notify-toggle');

/** Opens the bell's list and returns its entries' text (the list is read while open). */
async function bellEntries(page: Page): Promise<Locator> {
  await bell(page).click();
  const list = page.locator('#notify-app .notifications');
  await expect(list).toBeVisible();
  return list;
}
type Locator = ReturnType<Page['locator']>;

const desktopUserAgent =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/** A new player in a context of their own, with the project's viewport. */
async function newContext(browser: Browser, info: TestInfo, contexts: BrowserContext[]) {
  // browser.newContext() doesn't inherit the project's `use`: pass what matters here.
  const { baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent } = info.project.use;
  const context = await browser.newContext({
    baseURL,
    viewport,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    // lila takes a "HeadlessChrome" browser for a crawler (HttpFilter): it refuses the login form's submit
    // and strips some pages. The desktop project has no user agent of its own, so players use an ordinary
    // Chrome one
    userAgent: userAgent ?? desktopUserAgent,
  });
  contexts.push(context);
  return context;
}

/** Signs up through the real form: username, password, email, the three agreements. */
async function signUp(page: Page, name: string) {
  await page.goto('/signup');
  await page.getByRole('textbox', { name: 'Username' }).fill(name);
  await page.getByRole('textbox', { name: 'Password' }).fill(`demo-pass-${name}`);
  await page.getByRole('textbox', { name: 'Email' }).fill(`${name}@example.com`);
  // the switches are styled: their label (not the text beside them) is what a person clicks
  for (const agreement of ['assistance', 'nice', 'account'])
    await page.locator(`label.form-check__label[for="form3-agreement_${agreement}"]`).click();
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page).toHaveURL(new RegExp(`/@/${name}$`));
}

/**
 * The two accounts of the correspondence game. lila allows 10 sign-ups per 10 minutes from one address, and
 * the demo runs once for each project (and the other demos sign up too), so the first run signs the two
 * players up through the real form, remembers them in a file keyed by the server's port, and a later run
 * (the phone project, or another run against the same server) signs in as them instead.
 */
const accountsFile = (baseURL: string) =>
  join(tmpdir(), `ligo-phase7-demo-accounts-${new URL(baseURL).port || '80'}.json`);
const password = (name: string) => `demo-pass-${name}`;
// (unseeded on purpose: a name only has to be new to the server, and nothing checks its value)
const randomName = () => `dem${Math.random().toString(36).slice(2, 8)}`;

/** Signs in through the real form; false when the server does not know the account (a new database). */
async function signIn(page: Page, name: string): Promise<boolean> {
  await page.goto('/login');
  await page.locator('form input[name="username"]').fill(name);
  await page.locator('form input[name="password"]').fill(password(name));
  await page.getByTestId('login-submit').click();
  await page.waitForURL(url => url.pathname !== '/login', { timeout: 15_000 }).catch(() => undefined);
  return new URL(page.url()).pathname !== '/login';
}

/** The page of a signed-in player: the account remembered for `slot`, else a new one. */
async function player(
  browser: Browser,
  info: TestInfo,
  contexts: BrowserContext[],
  slot: 'a' | 'b',
  errors: string[],
): Promise<{ page: Page; name: string }> {
  const file = accountsFile(info.project.use.baseURL!);
  let known: Record<string, string> = {};
  try {
    known = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    // none yet
  }
  const page = await (await newContext(browser, info, contexts)).newPage();
  page.on('pageerror', e => errors.push(`${slot}: ${e}`));
  if (known[slot] && (await signIn(page, known[slot]))) return { page, name: known[slot] };
  const name = randomName();
  await signUp(page, name);
  writeFileSync(file, JSON.stringify({ ...known, [slot]: name }));
  return { page, name };
}

test('correspondence: a move each, the bell, two passes, the count and the result', async ({
  browser,
}, info) => {
  const phone = !!info.project.use.isMobile;
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  try {
    const { page: a, name: nameA } = await player(browser, info, contexts, 'a', errors);
    const { page: b, name: nameB } = await player(browser, info, contexts, 'b', errors);
    const names = { a: nameA, b: nameB };

    // B waits on the lobby; A challenges B to a 9x9 game with days per move.
    await b.goto('/');
    await expect(b.locator('.lobby__start')).toBeVisible();
    // lila allows 5 new games a minute from one address, which the other demos' games share: a refused
    // challenge says so in an alert, and the player tries again.
    await expect(async () => {
      await dismissAlert(a);
      await a.goto(`/?user=${names.b}#friend`);
      const dialog = a.locator('dialog[open]').filter({ has: a.locator('.game-setup') });
      await expect(dialog).toBeVisible();
      await dialog.locator('label[for="sf_size_9"]').click();
      await dialog.getByRole('tab', { name: 'Correspondence' }).click();
      await expect(dialog.locator('.time-panel .val-box')).toHaveText('2');
      await dialog.getByRole('button', { name: `Challenge ${names.b}` }).click();
      // the challenge waits on its own game page
      await expect(a).toHaveURL(/\/[A-Za-z0-9]{8}$/, { timeout: 5000 });
    }).toPass({ intervals: [5_000, 10_000, 15_000], timeout: 120_000 });

    // B sees the challenge arrive in the swords' dropdown and accepts it there.
    await expect(b.locator('#challenge-toggle .data-count')).toHaveAttribute('data-count', '1');
    // (the dropdown's script loads on the first click: click until it shows)
    const accept = b.locator('#challenge-app .challenge.in button.accept');
    await expect(async () => {
      if (!(await b.locator('#challenge-app').isVisible())) await b.locator('#challenge-toggle').click();
      // the accept and decline buttons show when the challenge is pointed at
      await b.locator('#challenge-app .challenge.in').hover();
      await expect(accept).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 20_000 });
    await expect(b.locator('#challenge-app .challenge.in')).toContainText(names.a);
    await expect(b.locator('#challenge-app .challenge.in .desc')).toContainText('9×9');
    await accept.click({ timeout: 15_000 });

    const round = /\/([A-Za-z0-9]{8})([A-Za-z0-9]{4})?$/;
    for (const p of [a, b]) {
      await expect(p).toHaveURL(round);
      await expect(p.locator('.round__go-board svg').first()).toBeVisible();
      await expect(p.locator('.go-setup')).toContainText('9×9');
    }
    // Black is the one whose Pass is on offer
    await expect
      .poll(async () => Number(await passButton(a).isEnabled()) + Number(await passButton(b).isEnabled()))
      .toBe(1);
    const black = (await passButton(a).isEnabled()) ? a : b;
    const white = black === a ? b : a;
    const nameOf = (p: Page) => (p === a ? names.a : names.b);
    await expect(black).toHaveTitle(/^Your turn - /);
    await expect(white).toHaveTitle(/^Waiting for opponent - /);

    // a move each, seen on both boards
    await playStone(black, 'black', 'ee', phone);
    await expect(stones(white, 'black')).toHaveCount(1);
    await expect(white).toHaveTitle(/^Your turn - /);
    await playStone(white, 'white', 'cc', phone);
    await expect(stones(black, 'white')).toHaveCount(1);
    // from the second move on the days clocks show (days, not minutes); the one to move runs
    for (const p of [black, white]) {
      await expect(p.locator('.rclock-correspondence')).toHaveCount(2);
      await expect(p.locator('.rclock-correspondence .time').first()).toContainText(/day/);
      await expect(p.locator('.rclock-correspondence.running')).toHaveCount(1);
    }

    // two passes: the scoring phase
    await pass(black);
    await pass(white);
    for (const p of [black, white]) {
      await expect(p.locator('.go-scoring__count')).toBeVisible();
      await expect(acceptButton(p)).toBeEnabled();
      // the phase's own clock, in days: a day (or just under it) to agree
      await expect(p.locator('.go-scoring__countdown')).toHaveText(
        /^(1 day|23 hours( \d+ minutes?)?) left to agree\. Then the marks stand as they are\.$/,
      );
      // the days clock stands still: nobody's runs
      await expect(p.locator('.rclock-correspondence')).toHaveCount(2);
      await expect(p.locator('.rclock-correspondence.running')).toHaveCount(0);
      // both are asked to count, not to move
      await expect(p).toHaveTitle(/^Time to count the game - /);
    }
    // (this game's id: the accounts are reused across projects and runs, so older games and bell entries exist)
    const gameId = new URL(black.url()).pathname.slice(1, 9);

    // the bell: "Time to count the game" against the opponent, from this game's scoring-phase notification
    for (const p of [black, white]) {
      await expect(bell(p).locator('.data-count')).toHaveAttribute('data-count', /^[1-9]/);
      const list = await bellEntries(p);
      const entry = list.locator(`a.site_notification.scoringPhase[href^="/${gameId}"]`);
      await expect(entry).toContainText('Time to count the game');
      await expect(entry).toContainText(`Game vs ${nameOf(p === a ? b : a)}`);
      await bell(p).click(); // close it again
    }

    // the lobby lists the game as waiting for the count
    const lobby = await black.context().newPage();
    lobby.on('pageerror', e => errors.push(`lobby: ${e}`));
    await lobby.goto('/');
    // the "in play" tab counts the game as waiting for you (7.6's isMyTurn), and its row says why
    const playingTab = lobby.getByRole('tab', { name: /in play/ });
    await expect(playingTab.locator('icon.unread')).toHaveText(/^[1-9]/);
    await playingTab.click();
    // (the same two players may have older unfinished games: this game's row links to this game)
    const row = lobby.locator(`.now-playing a[href*="/${gameId}"]`);
    await expect(row.locator('.indicator')).toHaveText('Time to count the game');
    await lobby.close();

    // Black accepts and leaves the game page; White accepts. lila rings the bell for a player who is not on
    // the game page when it ends, so Black's bell gets the game-end entry, which takes Black back to the game.
    const shown = (await black.locator('.go-scoring__count tfoot').textContent())!;
    await acceptButton(black).click();
    await expect(black.locator('.go-scoring__accepted')).toHaveText(
      'You accepted this score. Waiting for your opponent.',
    );
    await expect(white.locator('.go-scoring__accepted')).toHaveText('Your opponent accepted this score.');
    await black.goto('/');
    await expect(black.locator('.lobby__start')).toBeVisible();
    // White's page shows Black gone once the server knows (the game's room is what the bell rings against)
    await expect(white.locator('.ruser.online')).toHaveCount(1);
    await acceptButton(white).click();
    const result = white.locator('.result-wrap .result');
    await expect(result).toHaveText(/^([BW]\+\d+(\.5)?|0)$/);
    const text = (await result.textContent())!;
    await expect(white.locator('.go-scoring--final .go-scoring__count tfoot')).toHaveText(shown);
    await expect(acceptButton(white)).toHaveCount(0);
    await expect(white).toHaveTitle(/^Game Over - /);
    await expect(white.locator('.rclock-correspondence.running')).toHaveCount(0);

    // Black's bell: "Game vs White" with the result for Black, then the entry opens the finished game
    const winner = text.startsWith('B') ? black : text.startsWith('W') ? white : undefined;
    await expect(bell(black).locator('.data-count')).toHaveAttribute('data-count', /^[1-9]/);
    const list = await bellEntries(black);
    // (this game's entry: a server that played earlier runs keeps those games' entries too)
    const entry = list.locator(`a.site_notification.gameEnd[href^="/${gameId}"]`);
    await expect(entry).toContainText(`Game vs ${nameOf(white)}`);
    await expect(entry).toContainText(
      winner === undefined ? 'Draw' : winner === black ? 'Congratulations, you won!' : 'Defeat',
    );
    await entry.click();
    await expect(black).toHaveURL(new RegExp(`/${gameId}[A-Za-z0-9]*$`));
    await expect(black.locator('.result-wrap .result')).toHaveText(text);
    await expect(black.locator('.go-scoring--final .go-scoring__count tfoot')).toHaveText(shown);
    await expect(black.locator('.rclock-correspondence.running')).toHaveCount(0);

    // the SGF export, read back by goban-engine: the same board on both pages and the result
    const id = new URL(black.url()).pathname.slice(1, 9);
    const response = await black.request.get(`/game/export/${id}?format=sgf`);
    expect(response.ok()).toBe(true);
    const sgf = await response.text();
    expect(sgf).toContain('SZ[9]');
    expect(sgf).toContain('RU[Japanese]');
    expect(sgf).toContain(`RE[${text}]`);
    expect(sgf).toContain(`PB[${nameOf(black)}]`);
    expect(sgf).toContain(`PW[${nameOf(white)}]`);
    const tree = readTreeOf(sgf);
    expect(tree.mainline).toEqual(['ee', 'cc', '..', '..']);
    expect(tree.stones).toEqual({ black: ['ee'], white: ['cc'] });
    for (const color of ['black', 'white'] as const)
      for (const p of [black, white]) await expect(stones(p, color)).toHaveCount(1);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(c => c.close()));
  }
});

// ---- Part 2: the analysis board on a pro game ---------------------------------------------------

const fixture = resolve(__dirname, 'fixtures/ear-reddening-1846.sgf');

const analysisMoves = (page: Page) => page.locator('.analyse__moves move');
const activeMove = (page: Page) => page.locator('.analyse__moves move.active');
const goban = (page: Page) => page.locator('.analyse__go-board svg').first();

/** Where an SGF point is on the analysis board (a coordinate band, one square wide, around the grid). */
async function analysisPoint(page: Page, sgf: string, boardSize: number) {
  const box = (await goban(page).boundingBox())!;
  const square = box.width / (boardSize + 2);
  const [col, row] = [sgf.charCodeAt(0) - 97, sgf.charCodeAt(1) - 97];
  return { x: box.x + (col + 1.5) * square, y: box.y + (row + 1.5) * square };
}

/**
 * Explore the loaded record, add a variation at move 10 and download it, then read the file back:
 * the 325-move main line intact and the new move as a second child of move 10.
 */
async function exploreAndExport(page: Page, phone: boolean) {
  const original = readTreeOf(readFileSync(fixture, 'utf8'));
  expect(original.length).toBe(325);

  await expect(page.locator('.analyse__go-settings')).toContainText('19×19');
  await expect(page.locator('.analyse__go-players')).toHaveText(
    /Black: Yasuda Shusaku \(4d\)\s*White: Inoue Gennan Inseki \(8d\)/,
  );
  await expect(page.locator('.analyse__go-settings')).toContainText('Result: B+2');
  await expect(analysisMoves(page)).toHaveCount(325);
  // Shusaku plays first, at the 3-4 point (komoku) top right
  await expect(analysisMoves(page).first()).toHaveText(/1\s*R16/);

  // Step through with the keys: forward three moves, back one, to the end and back to the start.
  await goban(page).scrollIntoViewIfNeeded();
  const keys = page.keyboard;
  await analysisMoves(page).first().click();
  await expect(activeMove(page)).toHaveText(/1\s*R16/);
  await keys.press('ArrowRight');
  await keys.press('ArrowRight');
  await expect(activeMove(page)).toHaveText(/3\s*Q3/);
  await keys.press('ArrowLeft');
  await expect(activeMove(page)).toHaveText(/2\s*D17/);
  await keys.press('End');
  await expect(activeMove(page)).toHaveText(/325\s*/);
  await keys.press('Home');
  await expect(page.locator('.analyse__moves move.active')).toHaveCount(0);

  // Go to move 10 by clicking it, and play D16, a stone nobody played there: a variation.
  await analysisMoves(page).nth(9).click();
  await expect(activeMove(page)).toHaveText(/10\s*/);
  const p = await analysisPoint(page, 'dd', 19);
  await goban(page).scrollIntoViewIfNeeded();
  if (phone) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  // the list grew by one move, the variation, and the main line is still 325 long
  await expect(analysisMoves(page)).toHaveCount(326);
  await expect(page.locator('.analyse__moves move.mainline')).toHaveCount(325);
  await expect(activeMove(page)).toHaveText(/11\s*D16/);

  // Download the tree and read it back through goban-engine.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SGF' }).click();
  const file = await download;
  const sgf = readFileSync(await file.path(), 'utf8');
  const tree = readTreeOf(sgf);
  expect(tree.length).toBe(325);
  expect(tree.mainline).toEqual(original.mainline);
  expect(tree.stones).toEqual(original.stones);
  expect(tree.captures).toEqual(original.captures);
  expect(tree.branches).toEqual([{ ply: 10, moves: [original.mainline[10], 'dd'] }]);
  expect(sgf).toContain('PB[Yasuda Shusaku]');
  expect(sgf).toContain('RE[B+2]');
}

test('analysis: open a pro game from an SGF file, explore it, add a variation, export it', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/analysis');
  await expect(goban(page)).toBeVisible();
  await page.locator('input.analyse__sgf-file').setInputFiles(fixture);
  await exploreAndExport(page, !!info.project.use.isMobile);
  expect(errors).toEqual([]);
});

// ---- Part 3: SGF import to a stored game (unit 7.5) --------------------------------------------

test('import: paste the same game into /paste, open its analysis board, explore, add a variation, export', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/paste');
  await page.locator('textarea[name="sgf"]').fill(readFileSync(fixture, 'utf8'));
  await page.locator('form.import button[type="submit"]').click();
  // the stored game: a finished game page, with its analysis board one link away
  await expect(page).toHaveURL(/\/[A-Za-z0-9]{8}(\/(white|black))?$/);
  const id = new URL(page.url()).pathname.slice(1, 9);
  await page.goto(`/${id}/analysis`);
  await expect(goban(page)).toBeVisible();
  await expect(page.locator('.analyse__go-game a').first()).toHaveText('Back to the game');
  await exploreAndExport(page, !!info.project.use.isMobile);
  expect(errors).toEqual([]);
});
