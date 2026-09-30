// The board's mount time, part of LiGo's performance budget (ADR 0026 §5, unit 9.5): a 19×19 board
// with 9 handicap stones mounted on the built playground page, with Chromium's CPU slowed 4× to
// stand in for a mid-range phone. The limit is in dev/ci/budget.json, beside the size limits that
// dev/ci/budget.mjs checks.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { boardSvg, openPlayground } from './page';

const budget = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../../dev/ci/budget.json'), 'utf8'),
);

test.use({ viewport: { width: 1280, height: 800 } });

test('a 19×19 board with 9 stones mounts within the budget on a 4× slower CPU', async ({ page }) => {
  const { problems } = await openPlayground(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.getByLabel('Board size', { exact: true }).selectOption('19');
  await page.getByLabel('Handicap', { exact: true }).selectOption('9');

  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    // Each "New game" throws the board away and mounts a fresh one (goban's code is loaded already).
    const start = await page.evaluate(() => performance.now());
    await page.getByRole('button', { name: 'New game' }).click();
    await expect(page.locator('.playground__status > div').first()).toHaveText('White to play.');
    await boardSvg(page).waitFor();
    // Two animation frames: the board has been painted, not just put in the page.
    const end = await page.evaluate(
      () => new Promise<number>(r => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now())))),
    );
    times.push(end - start);
  }
  times.sort((a, b) => a - b);
  const median = times[2];
  console.log(`board mount, 19×19 with 9 stones, CPU 4× slower: median ${median.toFixed(0)} ms (${times.map(t => t.toFixed(0)).join(', ')})`);
  expect(median).toBeLessThanOrEqual(budget.boardMountMs);
  expect(problems).toEqual({ requests: [], errors: [] });
});
