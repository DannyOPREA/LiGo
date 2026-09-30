// The board's mount time, part of LiGo's performance budget (ADR 0026 §5, unit 9.5): a 19×19 board
// with 9 handicap stones mounted on the built playground page, with Chromium's CPU slowed 4× to
// stand in for a mid-range phone. The limit is in dev/ci/budget.json, beside the size limits that
// dev/ci/budget.mjs checks.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openPlayground } from './page';

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
    // Timed inside the page, from the click on "New game" (which throws the board away and mounts a
    // fresh one; goban's code is loaded already) until a new board's SVG is in place and two frames
    // have been painted. Playwright's own round trips are not counted.
    await page.evaluate(() => {
      const w = window as unknown as { mountTime?: Promise<number> };
      w.mountTime = new Promise<number>(done => {
        const old = document.querySelector('.playground__board [role=application]');
        document.addEventListener(
          'click',
          () => {
            const start = performance.now();
            const poll = () => {
              const board = document.querySelector('.playground__board [role=application]');
              // goban draws the whole board at once, in a shadow root.
              if (board && board !== old && board.shadowRoot?.querySelector('svg'))
                requestAnimationFrame(() => requestAnimationFrame(() => done(performance.now() - start)));
              else requestAnimationFrame(poll);
            };
            poll();
          },
          { capture: true, once: true },
        );
      });
    });
    await page.getByRole('button', { name: 'New game' }).click();
    times.push(await page.evaluate(() => (window as unknown as { mountTime: Promise<number> }).mountTime));
    await expect(page.locator('.playground__status > div').first()).toHaveText('White to play.');
  }
  times.sort((a, b) => a - b);
  const median = times[2];
  console.log(
    `board mount, 19×19 with 9 stones, CPU 4× slower: median ${median.toFixed(0)} ms (${times.map(t => t.toFixed(0)).join(', ')})`,
  );
  expect(median).toBeLessThanOrEqual(budget.boardMountMs);
  expect(problems).toEqual({ requests: [], errors: [] });
});
