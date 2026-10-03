// Accessibility of the game page (unit 9.7, ADR 0026 §4): axe-core finds no serious or critical
// WCAG 2.2 AA problem at desktop and phone sizes, during a game (with the board focused) and after it.
import { expect, test, type Page } from '@playwright/test';

import { axeProblems } from '../../playground/e2e/axe';
import { ConfirmMoves, openRound } from './page';

// Rematch is lila's primary blue under light text (3.3–3.7:1 as its glow animates), the same colour
// problem as lila's buttons everywhere; unit 9.7's second part fixes lila's colours site-wide and
// drops this exclusion (ADR 0026 §4).
const problems = (page: Page) => axeProblems(page, 'main.round', ['.rematch']);

for (const phone of [false, true])
  test.describe(phone ? 'phone' : 'desktop', () => {
    test.use(
      phone
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test('axe: no serious or critical WCAG 2.2 AA problem, during the game and after it', async ({
      page,
    }) => {
      const { problems: seen } = await openRound(page, {
        moves: ['ee', 'cc'],
        confirmMoves: phone ? ConfirmMoves.TOUCH : ConfirmMoves.NEVER,
      });
      expect(await problems(page)).toEqual([]);
      await page.getByRole('application', { name: /^9 by 9$/ }).focus();
      await page.keyboard.press('ArrowUp');
      expect(await problems(page)).toEqual([]);
      await page.locator('button.fbt.resign').click();
      await page.locator('.act-confirm button.yes, button.fbt.yes').first().click();
      await expect(page.locator('.result-wrap .result')).toHaveText('W+R');
      expect(await problems(page)).toEqual([]);
      expect(seen).toEqual({ requests: [], errors: [] });
    });
  });
