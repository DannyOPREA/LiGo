// Accessibility of the playground (unit 9.4, ADR 0026 §4): axe-core finds no serious or critical
// WCAG 2.2 AA problem at desktop and phone sizes, and a whole short game can be played from the
// keyboard with what a screen reader reads out checked along the way.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { ConfirmMoves, captures, openPlayground, status } from './page';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function problems(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).include('.playground').withTags(WCAG).analyze();
  // lila's own buttons (white on its primary blue #3692e7, 3.3:1) fail colour contrast on every
  // page; unit 9.7 fixes them site-wide (ADR 0026 §4). Only that pair of colours is let off.
  const lilaBlue = (n: { any: { data?: unknown }[] }) =>
    n.any.some(c => {
      const d = c.data as { fgColor?: string; bgColor?: string } | undefined;
      return d?.fgColor === '#ffffff' && d?.bgColor === '#3692e7';
    });
  return violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => (v.id === 'color-contrast' ? { ...v, nodes: v.nodes.filter(n => !lilaBlue(n)) } : v))
    .filter(v => v.nodes.length > 0)
    .map(v => `${v.id}: ${v.help} (${v.nodes.map(n => n.target.join(' ')).join(', ')})`);
}

const said = (page: Page) => page.locator('.playground__board [role=status]');
const board = (page: Page) => page.getByRole('application', { name: /^\d+ by \d+$/ });

for (const phone of [false, true])
  test.describe(phone ? 'phone' : 'desktop', () => {
    test.use(
      phone
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
        : { viewport: { width: 1280, height: 800 } },
    );

    test('axe: no serious or critical WCAG 2.2 AA problem', async ({ page }) => {
      await openPlayground(page, ConfirmMoves.TOUCH);
      expect(await problems(page)).toEqual([]);
      await board(page).focus();
      await page.keyboard.press('ArrowUp');
      expect(await problems(page)).toEqual([]);
    });
  });

test.describe('keyboard only', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('play, capture and pass without a mouse; each move is read out', async ({ page }) => {
    const { problems: seen } = await openPlayground(page, ConfirmMoves.NEVER);
    await board(page).focus();
    // Black A8, White A9, Black B9 takes it: the cursor starts on E5 of the 9×9 board.
    for (const [keys, text] of [
      [['Home', 'PageUp', 'ArrowDown', 'Enter'], 'Black A8'],
      [['ArrowUp', 'Enter'], 'White A9'],
      [['ArrowRight', 'Enter'], 'Black B9, 1 stone captured'],
    ] as const) {
      for (const key of keys) await page.keyboard.press(key);
      await expect(said(page)).toHaveText(new RegExp(`^${text}\\s?$`));
    }
    await expect(captures(page)).toContainText('Black prisoners: 1');
    await page.keyboard.press('ArrowLeft');
    await expect(said(page)).toHaveText(/^A9 empty\s?$/);
    await page.keyboard.press('p');
    await expect(said(page)).toHaveText(/^White passes\s?$/);
    await expect(status(page)).toHaveText('Black to play.');
    expect(seen).toEqual({ requests: [], errors: [] });
  });
});
