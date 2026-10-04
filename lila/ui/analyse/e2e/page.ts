// Serves the built analysis page to Playwright without a lila server (unit 7.4). The page is a
// trimmed copy of what lila's `views.analyse.ui.userAnalysis` renders: the same CSS, the same
// `main.analyse` markup and the same module with the same init data, in lila's default (dark)
// theme, without the site header. lila's own English words come from the built i18n files.
// Assets come from lila/public as lila serves them at /assets/; any other request fails the test.

import { expect, type Page } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '../../../public');
const origin = 'http://ligo.test';

const manifest = () => {
  try {
    return JSON.parse(readFileSync(join(publicDir, 'compiled/manifest.json'), 'utf8'));
  } catch {
    throw new Error('lila/public/compiled/manifest.json is missing: build the ui first (ui/build)');
  }
};

const i18nFile = (prefix: string) => {
  // The newest build's file: earlier builds leave theirs behind (a fresh checkout, as on CI, has one).
  const dir = join(publicDir, 'compiled/i18n');
  const name = readdirSync(dir)
    .filter(f => f.startsWith(`${prefix}.`) && /^[0-9a-f]+\.js$/.test(f.slice(prefix.length + 1)))
    .sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs)[0];
  if (!name) throw new Error(`no ${prefix} i18n file in lila/public/compiled/i18n: build the ui first`);
  return `/assets/compiled/i18n/${name}`;
};

function html(cfg: Record<string, unknown>): string {
  const m = manifest();
  const css = (name: string) => `<link rel="stylesheet" href="/assets/css/${name}.${m.css[name]}.css">`;
  const js = `/assets/compiled/analyse.user.${m.js['analyse.user'].hash}.js`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Analysis board • LiGo</title>
${css('lib.theme.all')}
${css('site')}
${css('analyse.free')}
<style>@font-face { font-family: 'lichess'; font-display: block; src: url('/assets/font/lichess.woff2') format('woff2') }</style>
<link id="favicon" rel="icon" href="/assets/logo/ligo-favicon.svg">
</head>
<body data-theme="dark" class="coords-in" data-sound-set="standard" style="---zoom:80">
<div id="main-wrap"><main class="analyse analyse--go">
  <div class="analyse__board main-board"><div class="analyse__go-board"></div></div>
  <div class="analyse__tools"></div>
  <div class="analyse__controls"></div>
</main></div>
<script src="/assets/javascripts/vendor/cash.min.js"></script>
<script type="module">
// lila's site bundle isn't on this trimmed page: what the analysis page uses of it, recorded.
window.sounds = [];
const keys = {};
const mousetrap = { bind: (ks, f) => { for (const k of [].concat(ks)) keys[k] = f; return mousetrap; } };
window.keys = keys;
window.site = {
  sri: 'test-sri',
  manifest: { i18n: {} },
  sound: { play: async name => void window.sounds.push(name), say: () => false },
  mousetrap,
  asset: { loadCssPath: async () => {}, loadEsm: async () => ({}), flairSrc: () => '' },
  powertip: {},
  unload: { expected: false },
  blindMode: false,
};
await import(${JSON.stringify(i18nFile('en-GB'))});
await import(${JSON.stringify(i18nFile('site.en-GB'))});
const mod = await import(${JSON.stringify(js)});
window.analyse = mod.initModule({ cfg: ${JSON.stringify(cfg).replace(/</g, '\\u003c')} });
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
  '.mp3': 'audio/mpeg',
};

export interface Opened {
  /** Requests the page made that this harness doesn't answer, and errors it logged. */
  problems: { requests: string[]; errors: string[] };
}

/**
 * Opens `/analysis` and waits for its board. `coords`: lila's preference, 0 for none. `extra` is more of
 * the page's init data: a stored game's page (unit 7.5) adds `sgf` and `game`, and opens at `hash`.
 */
export async function openAnalysis(
  page: Page,
  coords = 1,
  extra: { sgf?: string; game?: { url: string; sgfUrl: string }; hash?: string } = {},
): Promise<Opened> {
  const { hash, ...more } = extra;
  const problems = { requests: [] as string[], errors: [] as string[] };
  page.on('pageerror', e => problems.errors.push(String(e)));
  page.on('console', msg => msg.type() === 'error' && problems.errors.push(msg.text()));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === '/analysis')
      return route.fulfill({ contentType: 'text/html', body: html({ coords, ...more }) });
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
    // The SGF download is a blob: URL made by the page itself.
    if (url.protocol === 'blob:') return route.continue();
    problems.requests.push(url.href);
    return route.abort();
  });
  await page.goto(`${origin}/analysis${hash ?? ''}`);
  await boardSvg(page).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { problems };
}

/** goban's board svg (the analysis board, or the position editor in setup mode). */
export const boardSvg = (page: Page) => page.locator('.analyse__go-board svg').first();

/** The board's size, from the tree's root. */
const sizeOf = (page: Page): Promise<number> =>
  page.evaluate(() => (window as any).analyse.ctrl.root.settings.size as number);

/** Where an SGF point ("dd") is on screen; goban leaves a square-wide coordinate band on each side. */
export async function pointOf(page: Page, move: string, coords = true): Promise<{ x: number; y: number }> {
  const size = await sizeOf(page);
  const box = (await boardSvg(page).boundingBox())!;
  const band = coords ? 1 : 0;
  const square = box.width / (size + 2 * band);
  const [x, y] = [move.charCodeAt(0) - 97, move.charCodeAt(1) - 97];
  return { x: box.x + (x + band + 0.5) * square, y: box.y + (y + band + 0.5) * square };
}

/** Clicks (or taps) an SGF point on the board shown. */
export async function play(page: Page, move: string, touch = false): Promise<void> {
  // The SGF box is under the board: after using it, the board may be scrolled out of view.
  await boardSvg(page).scrollIntoViewIfNeeded();
  const p = await pointOf(page, move);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

/** Clicks (or taps) points in the setup editor, which has the size chosen in the panel. */
export async function place(page: Page, size: number, moves: string[], touch = false): Promise<void> {
  await boardSvg(page).scrollIntoViewIfNeeded();
  for (const move of moves) {
    const box = (await boardSvg(page).boundingBox())!;
    const square = box.width / (size + 2);
    const [x, y] = [move.charCodeAt(0) - 97, move.charCodeAt(1) - 97];
    const [px, py] = [box.x + (x + 1.5) * square, box.y + (y + 1.5) * square];
    if (touch) await page.touchscreen.tap(px, py);
    else await page.mouse.click(px, py);
  }
}

/** The moves in the move list, as the page names them: "1 D4". */
export const moveList = (page: Page) => page.locator('.analyse__moves move');

/** The move list's text, move by move. */
export const moves = (page: Page): Promise<string[]> =>
  moveList(page).evaluateAll(els =>
    els.map(el =>
      [...el.children]
        .map(c => c.textContent?.trim())
        .filter(Boolean)
        .join(' '),
    ),
  );

/** The move the cursor is on. */
export const active = (page: Page) => page.locator('.analyse__moves move.active');

/** The position on the board shown, as rows of `.XO` (libs/board's `state()`). */
export const position = (page: Page) =>
  page.evaluate(() => (window as any).analyse.ctrl.board.board.state().board as string[]);

/** The whole tree as SGF, as the page writes it. */
export const sgfOf = (page: Page) => page.evaluate(() => (window as any).analyse.ctrl.sgf() as string);

/** Presses a key the page binds (lila's mousetrap, recorded by this harness). */
export const key = (page: Page, k: string) =>
  page.evaluate(k => {
    (window as any).keys[k]({ key: k });
  }, k);

/** The names of lila's sounds the page played, in order. */
export const sounds = (page: Page) => page.evaluate(() => (window as unknown as { sounds: string[] }).sounds);

/** Waits for the board to show `n` moves played after the setup. */
export const boardMoves = (page: Page, n: number) =>
  expect.poll(() => page.evaluate(() => (window as any).analyse.ctrl.nodeList.length - 1)).toBe(n);
