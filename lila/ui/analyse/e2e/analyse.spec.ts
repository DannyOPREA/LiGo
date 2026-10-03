// The analysis board on the built page (unit 7.4): stones and passes from an empty board, a
// capture, variations and the move list's menu, the keyboard, SGF in and out, and setup mode.
// Checks what a player sees and what the page writes: the move list, the board, the SGF.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

import {
  active,
  boardMoves,
  key,
  moveList,
  moves,
  openAnalysis,
  place,
  play,
  position,
  sgfOf,
  sounds,
} from './page';

const sgfBox = (page: Page) => page.locator('#analyse-sgf');

/** The page's SGF without its line breaks, which libs/board's writer puts between nodes. */
const flat = async (page: Page) => (await sgfOf(page)).replace(/\s+/g, '');

/** Pastes a record into the SGF box and loads it. */
async function loadSgf(page: Page, sgf: string): Promise<void> {
  await sgfBox(page).fill(sgf);
  await page.locator('.analyse__sgf-actions').getByText('Load SGF', { exact: true }).click();
}

/** Plays stones (or "pass") from the position shown, each waiting for the move list to grow. */
async function playAll(page: Page, points: string[]): Promise<void> {
  for (const point of points) {
    const before = await moveList(page).count();
    if (point === 'pass') await page.getByRole('button', { name: 'Pass' }).click();
    else await play(page, point);
    await expect(moveList(page)).toHaveCount(before + 1);
  }
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('stones, a capture and a pass from an empty board', async ({ page }) => {
    const { problems } = await openAnalysis(page);
    await expect(page.locator('.analyse__go-settings')).toContainText('19×19');
    await expect(page.locator('.analyse__go-turn')).toHaveText('Black to play');

    // Black at A18, White at A19, Black takes it with B19.
    await playAll(page, ['ab', 'aa', 'ba']);
    expect(await moves(page)).toEqual(['1 A18', '2 A19', '3 B19']);
    await expect(active(page)).toHaveText(/3\s*B19/);
    await expect.poll(async () => (await position(page))[0]).toMatch(/^\.X/);
    await expect(page.locator('.go-prisoners')).toContainText('1');
    await expect(page.locator('.analyse__go-turn')).toHaveText('White to play');

    // White playing back into A19 would have no liberties: refused, with the reason, nothing added.
    await play(page, 'aa');
    await expect(page.locator('.analyse__go-notice')).toHaveText(
      'That move would take the last liberty of its own stones (suicide).',
    );
    await expect(moveList(page)).toHaveCount(3);

    // White passes; it is listed and Black is to play.
    await playAll(page, ['pass']);
    expect((await moves(page))[3]).toBe('4 Pass');
    await expect(page.locator('.analyse__go-turn')).toHaveText('Black to play');
    await expect(page.locator('.analyse__go-notice')).toHaveCount(0);

    // A click on a stone does nothing (goban doesn't offer an occupied point).
    await play(page, 'ab');
    await expect(moveList(page)).toHaveCount(4);

    // The SGF box holds the record: setup, then B, W, B and White's pass.
    await expect.poll(() => flat(page)).toMatch(/;B\[ab\];W\[aa\];B\[ba\];W\[\]\)$/);
    await expect(sgfBox(page)).toHaveValue(await sgfOf(page));

    const played = await sounds(page);
    expect(played).toContain('capture');
    expect(played).toContain('error');
    expect(problems).toEqual({ requests: [], errors: [] });
  });

  test('variations, the move list menu and the keyboard', async ({ page }) => {
    const { problems } = await openAnalysis(page);
    await playAll(page, ['dd', 'pp', 'dp']);

    // Back one move and play elsewhere: a variation, the main line stays.
    await key(page, 'left');
    await boardMoves(page, 2);
    await playAll(page, ['pd']);
    expect(await moves(page)).toEqual(['1 D16', '2 Q4', '3 D4', '3 Q16']);
    await expect(page.locator('.analyse__moves move.mainline')).toHaveCount(3);

    // Clicking a move goes there; the board shows that position.
    await moveList(page).first().click();
    await boardMoves(page, 1);
    await expect(active(page)).toHaveText(/1\s*D16/);

    // Keys: end, home, then right steps through the main line.
    await key(page, 'end');
    await boardMoves(page, 3);
    await expect(active(page)).toHaveText(/3\s*D4/);
    await key(page, 'home');
    await boardMoves(page, 0);
    await key(page, 'right');
    await boardMoves(page, 1);

    // The menu on the variation's move makes it the main line.
    await moveList(page).filter({ hasText: 'Q16' }).click({ button: 'right' });
    const menu = page.locator('#analyse-cm');
    await expect(menu.locator('.title')).toHaveText('3. Black Q16');
    await menu.getByText('Make main line').click();
    await expect(page.locator('.analyse__moves move.mainline')).toHaveText([/D16/, /Q4/, /Q16/]);

    // And deletes from a move on.
    await moveList(page).filter({ hasText: 'D4' }).click({ button: 'right' });
    await menu.getByText('Delete from here').click();
    expect(await moves(page)).toEqual(['1 D16', '2 Q4', '3 Q16']);
    await expect.poll(() => flat(page)).toMatch(/;B\[dd\];W\[pp\];B\[pd\]\)$/);

    expect(problems).toEqual({ requests: [], errors: [] });
  });

  test('keyboard play keeps the focus on the board from move to move', async ({ page }) => {
    const { problems } = await openAnalysis(page);
    const board = page.locator('.analyse__go-board [role="application"]');
    await board.focus();
    await page.keyboard.press('Enter');
    await expect(moveList(page)).toHaveCount(1);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(moveList(page)).toHaveCount(2);
    await expect(board).toBeFocused();
    expect(await sgfOf(page)).toMatch(/;W\[[a-s]{2}\]/);
    expect(problems).toEqual({ requests: [], errors: [] });
  });

  test('SGF: load a record with variations, refuse a bad one, download', async ({ page }) => {
    const { problems } = await openAnalysis(page);
    await loadSgf(
      page,
      '(;GM[1]FF[4]SZ[9]KM[7]RU[Chinese]PB[Honinbo]BR[3d]PW[Kitani]RE[W+2]' +
        ';B[ee]C[A fine start.];W[cc](;B[gg];W[gc])(;B[cg]))',
    );
    // lila's layout: the side line (3 C3) comes right after the move it is an alternative to.
    expect(await moves(page)).toEqual(['1 E5', '2 C7', '3 G3', '3 C3', '4 G7']);
    await expect(page.locator('.analyse__go-settings')).toContainText('9×9');
    await expect(page.locator('.analyse__go-settings')).toContainText('Chinese');
    await expect(page.locator('.analyse__go-players')).toHaveText(/Black: Honinbo \(3d\)\s*White: Kitani/);
    await expect(page.locator('.analyse__go-settings')).toContainText('Result: W+2');
    await expect(page.locator('.analyse__moves comment')).toHaveText('A fine start.');
    await boardMoves(page, 0);

    // A record with an illegal move is refused, saying which move, and the tree stays.
    await loadSgf(page, '(;GM[1]FF[4]SZ[9];B[ee];W[ee])');
    await expect(page.locator('.analyse__sgf-error')).toHaveText(
      'Move 2: W[ee] is not a legal move (occupied)',
    );
    await expect(moveList(page)).toHaveCount(5);

    // The download is the tree as SGF, variations and comment included.
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download SGF' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('ligo-analysis.sgf');
    const text = readFileSync(await file.path(), 'utf8');
    expect(text).toBe(await sgfOf(page));
    expect(text).toContain('C[A fine start.]');
    expect(text.replace(/\s+/g, '')).toMatch(/\(;B\[gg\];W\[gc\]\)\(;B\[cg\]\)\)$/);

    // Playing on goes on from the tree: the refusal goes, and the box shows the tree again.
    await sgfBox(page).fill('(;GM[1]FF[4]SZ[9];B[aa])');
    await moveList(page).filter({ hasText: 'C7' }).click();
    await boardMoves(page, 2);
    await play(page, 'ce');
    await expect(moveList(page)).toHaveCount(6);
    await expect(page.locator('.analyse__sgf-error')).toHaveCount(0);
    await expect(sgfBox(page)).toHaveValue(await sgfOf(page));
    await expect.poll(() => flat(page)).toContain(';B[ce]');

    // An SGF file opens the same way.
    await page.locator('input.analyse__sgf-file').setInputFiles({
      name: 'game.sgf',
      mimeType: 'application/x-go-sgf',
      buffer: Buffer.from('(;GM[1]FF[4]SZ[13];B[dd];W[jj])'),
    });
    await expect(page.locator('.analyse__go-settings')).toContainText('13×13');
    expect(await moves(page)).toEqual(['1 D10', '2 K4']);

    expect(problems).toEqual({ requests: [], errors: [] });
  });

  test('setup mode: a new position with stones on both sides, White to play', async ({ page }) => {
    const { problems } = await openAnalysis(page);
    await playAll(page, ['dd']);
    await page.getByRole('button', { name: 'New position' }).click();
    await expect(page.locator('.analyse__setup h2')).toHaveText('New position');
    await page.getByRole('button', { name: '9×9' }).click();
    // A komi that isn't a multiple of 0.5 goes back to the one in use.
    await page.locator('#analyse-setup-komi').fill('7.25');
    await page.locator('#analyse-setup-komi').press('Enter');
    await page.locator('#analyse-setup-komi').blur();
    await expect(page.locator('#analyse-setup-komi')).toHaveValue('6.5');

    await place(page, 9, ['cc', 'gg']);
    await page.getByRole('button', { name: 'White stones' }).click();
    await place(page, 9, ['cg', 'gc']);
    // Tapping a white stone with White chosen takes it away.
    await place(page, 9, ['gc']);
    await page.getByRole('button', { name: 'White', exact: true }).click();
    await page.getByRole('button', { name: 'Start analysis' }).click();

    await expect(page.locator('.analyse__setup')).toHaveCount(0);
    await expect(page.locator('.analyse__go-settings')).toContainText('9×9');
    await expect(page.locator('.analyse__go-turn')).toHaveText('White to play');
    await expect(moveList(page)).toHaveCount(0);
    const sgf = await sgfOf(page);
    expect(sgf).toMatch(/AB\[cc\]\[gg\]/);
    expect(sgf).toMatch(/AW\[cg\]/);
    expect(sgf).not.toMatch(/gc/);
    expect(sgf).toMatch(/PL\[W\]/);

    // White plays first from it.
    await playAll(page, ['ee']);
    expect(await moves(page)).toEqual(['1 E5']);
    await expect(moveList(page).first()).toHaveClass(/white/);

    // A stone without liberties is refused on Start; Cancel goes back to the tree.
    await page.getByRole('button', { name: 'New position' }).click();
    await page.getByRole('button', { name: '9×9' }).click();
    await page.getByRole('button', { name: 'White stones' }).click();
    await place(page, 9, ['aa']);
    await page.getByRole('button', { name: 'Black stones' }).click();
    await place(page, 9, ['ba', 'ab']);
    await page.getByRole('button', { name: 'Start analysis' }).click();
    await expect(page.locator('.analyse__setup-error')).toHaveText('The setup stone at A9 has no liberties');
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(await moves(page)).toEqual(['1 E5']);

    expect(problems).toEqual({ requests: [], errors: [] });
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('taps play stones, and the controls step back and forward', async ({ page }) => {
    const { problems } = await openAnalysis(page);
    for (const point of ['dd', 'pp']) {
      const before = await moveList(page).count();
      await play(page, point, true);
      await expect(moveList(page)).toHaveCount(before + 1);
    }
    expect(await moves(page)).toEqual(['1 D16', '2 Q4']);
    await page.locator('.analyse__controls .jumps button').first().tap();
    await boardMoves(page, 0);
    await page.locator('.analyse__controls .jumps button').last().tap();
    await boardMoves(page, 2);
    expect(problems).toEqual({ requests: [], errors: [] });
  });
});
