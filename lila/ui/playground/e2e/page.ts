import { expect, type Page } from '@playwright/test';
// Serves the built playground page to Playwright without a lila server (unit 2.4). The page is a
// trimmed copy of what lila's `views.playground.home` renders: the same CSS and module, the same
// `#playground` element and init data, in lila's default (dark) theme, without the site header. Assets come from lila/public as lila serves them at /assets/;
// any other request fails the test, so the page can't quietly depend on the network.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '../../../public');
const origin = 'http://ligo.test';

/** `Pref.ConfirmMoves` (lila/modules/pref). */
export const ConfirmMoves = { NEVER: 0, TOUCH: 1, ALWAYS: 2 } as const;

const manifest = () => {
  try {
    return JSON.parse(readFileSync(join(publicDir, 'compiled/manifest.json'), 'utf8'));
  } catch {
    throw new Error('lila/public/compiled/manifest.json is missing: build the ui first (ui/build)');
  }
};

function html(confirmMoves: number): string {
  const m = manifest();
  const css = (name: string) => `<link rel="stylesheet" href="/assets/css/${name}.${m.css[name]}.css">`;
  const js = `/assets/compiled/playground.${m.js.playground.hash}.js`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Playground • LiGo</title>
${css('lib.theme.all')}
${css('site')}
${css('playground')}
</head>
<body data-theme="dark">
<div id="main-wrap"><main id="playground"><p>Loading the Go playground…</p></main></div>
<script type="module">
window.site ||= {};
const m = await import(${JSON.stringify(js)});
m.initModule(${JSON.stringify({ confirmMoves })});
</script>
</body>
</html>`;
}

const contentTypes: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export interface Opened {
  /** Requests the page made that this server doesn't answer, and errors it logged. */
  problems: { requests: string[]; errors: string[] };
}

/** Opens the playground with the given "Confirm moves" preference and waits for the board. */
export async function openPlayground(page: Page, confirmMoves: number = ConfirmMoves.TOUCH): Promise<Opened> {
  const problems = { requests: [] as string[], errors: [] as string[] };
  page.on('pageerror', e => problems.errors.push(String(e)));
  page.on('console', msg => msg.type() === 'error' && problems.errors.push(msg.text()));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === '/playground')
      return route.fulfill({ contentType: 'text/html', body: html(confirmMoves) });
    if (url.origin === origin && url.pathname.startsWith('/assets/')) {
      const file = join(publicDir, decodeURIComponent(url.pathname.slice('/assets/'.length)));
      if (!file.startsWith(publicDir + '/')) return route.fulfill({ status: 403 });
      try {
        const ext = file.slice(file.lastIndexOf('.'));
        return route.fulfill({ contentType: contentTypes[ext], body: readFileSync(file) });
      } catch {
        problems.requests.push(url.href);
        return route.fulfill({ status: 404 });
      }
    }
    problems.requests.push(url.href);
    return route.abort();
  });
  await page.goto(`${origin}/playground`);
  await boardSvg(page).waitFor();
  await expect(page.locator('.playground__status > div').first()).toHaveText(/to play\.$/);
  await page.evaluate(() => document.fonts.ready);
  return { problems };
}

/** goban's board svg (it draws in a shadow root, so a locator, not querySelector). */
export const boardSvg = (page: Page) => page.locator('.playground__board svg').first();

/** Where an SGF point ("dd") is on screen: goban leaves a square-wide coordinate band on each side. */
export async function pointOf(page: Page, move: string, size: number): Promise<{ x: number; y: number }> {
  const box = (await boardSvg(page).boundingBox())!;
  const square = box.width / (size + 2);
  const [x, y] = [move.charCodeAt(0) - 97, move.charCodeAt(1) - 97];
  return { x: box.x + (x + 1.5) * square, y: box.y + (y + 1.5) * square };
}

/** Clicks (or, on a touch context, taps) an SGF point. */
export async function play(page: Page, move: string, size: number, touch = false): Promise<void> {
  const p = await pointOf(page, move, size);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

export const status = (page: Page) => page.locator('.playground__status > div').first();
export const captures = (page: Page) => page.locator('.playground__captures');

/** Starts a new game of the given size from the settings form. */
export async function newGame(page: Page, size: 9 | 13 | 19): Promise<void> {
  await page.getByLabel('Board size', { exact: true }).selectOption(String(size));
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.locator('.playground__game')).toHaveText(new RegExp(`^${size}×${size},`));
  await boardSvg(page).waitFor();
}
