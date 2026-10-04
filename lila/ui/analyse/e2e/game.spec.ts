// A stored game on the analysis page (unit 7.5, ADR 0023 §2): the page lila serves at
// `/<gameId>/analysis` is the analysis board loaded with the game's SGF text and the links back to the game
// and to its SGF download. These tests give the built page the init data that page gets (see page.ts) and
// check what a player sees: the whole record with its variations and comments, who played and the result,
// the links, and the move a `#<ply>` link from the game page opens at.
import { expect, test } from '@playwright/test';

import { active, boardMoves, moveList, moves, openAnalysis, position, sgfOf } from './page';

const game = { url: '/abcd1234', sgfUrl: '/game/export/abcd1234?format=sgf' };

/** An imported record: players with ranks, a result, a comment, and a side line the server doesn't store. */
const IMPORT =
  '(;GM[1]FF[4]SZ[9]KM[6.5]RU[Japanese]PB[Honinbo]BR[3d]PW[Kitani]WR[1d]RE[B+R]DT[2026-10-04]' +
  ';B[ee]C[A fine start.];W[cc](;B[gg];W[gc];B[cg])(;B[cg];W[gg]))';

test.describe('a stored game', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('opens with its variations, comments, players and result', async ({ page }) => {
    const { problems } = await openAnalysis(page, 1, { sgf: IMPORT, game });
    // lila's layout: the side line (3 C3, 4 G3) comes right after the move it is an alternative to,
    // and the main line goes on after it
    expect(await moves(page)).toEqual(['1 E5', '2 C7', '3 G3', '3 C3', '4 G3', '4 G7', '5 C3']);
    await expect(page.locator('.analyse__moves comment')).toHaveText('A fine start.');
    await expect(page.locator('.analyse__go-settings')).toContainText('9×9');
    await expect(page.locator('.analyse__go-settings')).toContainText('Japanese');
    await expect(page.locator('.analyse__go-players')).toHaveText(
      /Black: Honinbo \(3d\)\s*White: Kitani \(1d\)/,
    );
    await expect(page.locator('.analyse__go-settings')).toContainText('Result: B+R');
    // it starts at the first position and nothing was refused
    await boardMoves(page, 0);
    await expect(page.locator('.analyse__sgf-error')).toHaveCount(0);
    // the SGF box holds the whole record, the side line included
    expect((await sgfOf(page)).replace(/\s+/g, '')).toContain('(;B[gg];W[gc];B[cg])(;B[cg];W[gg])');
    expect(problems).toEqual({ requests: [], errors: [] });
  });

  test('links back to the game and to its SGF download', async ({ page }) => {
    await openAnalysis(page, 1, { sgf: IMPORT, game });
    const links = page.locator('.analyse__go-game a');
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveText('Back to the game');
    await expect(links.nth(0)).toHaveAttribute('href', '/abcd1234');
    await expect(links.nth(1)).toHaveText('Download the game as SGF');
    await expect(links.nth(1)).toHaveAttribute('href', '/game/export/abcd1234?format=sgf');
  });

  test('plain /analysis has no game links', async ({ page }) => {
    await openAnalysis(page);
    await expect(page.locator('.analyse__go-game')).toHaveCount(0);
  });

  test('a #ply link opens at that move, counted as the game page counts', async ({ page }) => {
    // Black moves first, so the game's ply 1 is the empty start and move 3 is its ply 4.
    await openAnalysis(page, 1, { sgf: IMPORT, game, hash: '#4' });
    await boardMoves(page, 3);
    await expect(active(page)).toHaveText(/3\s*G3/);
    const rows = await position(page);
    expect(rows[6][6]).toBe('X');
  });

  test('a handicap game counts its plies from zero', async ({ page }) => {
    // White moves first after two handicap stones: the game's ply 2 is move 2.
    const handicap = '(;GM[1]FF[4]SZ[9]KM[0.5]HA[2]AB[cg][gc];W[ee];B[cc];W[gg])';
    await openAnalysis(page, 1, { sgf: handicap, game, hash: '#2' });
    await boardMoves(page, 2);
    await expect(moveList(page)).toHaveCount(3);
  });

  test('a record that cannot be read leaves an empty board and says why', async ({ page }) => {
    await openAnalysis(page, 1, { sgf: '(;GM[1]FF[4]SZ[9];B[ee];W[ee])', game });
    await expect(page.locator('.analyse__sgf-error')).toHaveText(
      'Move 2: W[ee] is not a legal move (occupied)',
    );
    await expect(moveList(page)).toHaveCount(0);
  });
});
