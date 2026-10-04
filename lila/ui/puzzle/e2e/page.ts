// Serves the built trainer page to Playwright without a lila server (unit 8.7). The page is a trimmed
// copy of what lila's `views.puzzle.ui.show` renders: the same CSS, the same `main.puzzle` markup and
// the same module with puzzle data shaped as `JsonView` sends it for a Go puzzle (ADR 0025 §1), in
// lila's default (dark) theme, without the site header. lila's own English words come from the built
// i18n files. The server's answers are stand-ins: `POST /training/complete/...` records the result and
// returns the rating change and the next puzzle, as `PuzzleComplete` does; votes are acknowledged.
// Assets come from lila/public as lila serves them at /assets/; any other request fails the test.

import { expect, type Page } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PuzzleJson } from './puzzles';

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

const i18nFile = (prefix: string) => {
  const name = readdirSync(join(publicDir, 'compiled/i18n')).find(
    f => f.startsWith(`${prefix}.`) && /^[0-9a-f]+\.js$/.test(f.slice(prefix.length + 1)),
  );
  if (!name) throw new Error(`no ${prefix} i18n file in lila/public/compiled/i18n: build the ui first`);
  return `/assets/compiled/i18n/${name}`;
};

export interface PuzzleOptions {
  /** The puzzle to play. */
  puzzle: PuzzleJson;
  /** The puzzle after it, as the server sends it with the result. */
  next?: PuzzleJson;
  /** A signed-in player with this puzzle rating; none for a guest. */
  rating?: number;
  /** What a result moves the rating by, for a signed-in player. */
  ratingDiff?: number;
  confirmMoves?: number;
  coords?: number;
  /** The board and stone preferences lila puts on <body>: goban's theme names. */
  board?: string;
  stones?: string;
}

/** Theme names as `PuzzleUi.show` sends them (`bits.themeNames`). */
const themeNames = {
  mix: { name: 'Puzzle themes', desc: 'A bit of everything.' },
  lifeAndDeath: { name: 'Life and death', desc: 'A group must live, or be killed.' },
  living: { name: 'Living', desc: 'Make your group live: two eyes, or seki.' },
  killing: { name: 'Killing', desc: 'Kill the group before it can make two eyes.' },
  ko: { name: 'Ko', desc: 'The result hangs on a ko fight.' },
  capturingRace: { name: 'Capturing race', desc: 'Two groups short of liberties: who captures first?' },
  tesuji: { name: 'Tesuji', desc: 'A clever local move that works where the obvious one fails.' },
  eyeShape: { name: 'Eye shape', desc: 'Make, or stop, two eyes: the shape of the eye space decides.' },
  snapback: { name: 'Snapback', desc: 'Give up a stone, then capture more by taking it back.' },
  throwIn: { name: 'Throw-in', desc: 'Play a stone into the eye space to shrink it.' },
  corner: { name: 'Corner', desc: 'The fight is in a corner of the board.' },
  edge: { name: 'Edge', desc: 'The fight is along a side of the board.' },
  centre: { name: 'Centre', desc: 'The fight is in the middle of the board.' },
};

const mixAngle = { key: 'mix', name: 'Puzzle themes', desc: 'A bit of everything.' };

const dataOf = (o: Required<Pick<PuzzleOptions, 'rating'>> & { puzzle: PuzzleJson }, signedIn: boolean) => ({
  puzzle: o.puzzle,
  angle: mixAngle,
  ...(signedIn ? { user: { rating: o.rating, provisional: false } } : {}),
});

function html(o: PuzzleOptions): string {
  const m = manifest();
  const css = (name: string) => `<link rel="stylesheet" href="/assets/css/${name}.${m.css[name]}.css">`;
  const js = `/assets/compiled/puzzle.${m.js.puzzle.hash}.js`;
  const signedIn = o.rating !== undefined;
  const opts = {
    data: dataOf({ puzzle: o.puzzle, rating: o.rating ?? 0 }, signedIn),
    pref: { coords: o.coords ?? 1, confirmMoves: o.confirmMoves ?? ConfirmMoves.TOUCH },
    settings: { difficulty: 'normal' },
    themeNames,
    ...(signedIn
      ? {
          themes: {
            dynamic: 'capturingRace eyeShape ko snapback tesuji throwIn',
            static: 'centre corner edge killing lifeAndDeath living',
          },
        }
      : {}),
    showRatings: true,
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Puzzles • LiGo</title>
${css('lib.theme.all')}
${css('site')}
${css('puzzle')}
<style>@font-face { font-family: 'lichess'; font-display: block; src: url('/assets/font/lichess.woff2') format('woff2') }</style>
<link id="favicon" rel="icon" href="/assets/logo/ligo-favicon.svg">
</head>
<body data-theme="dark" class="coords-in" ${signedIn ? 'data-user="kuro"' : ''} data-sound-set="standard"
  ${o.board ? `data-board="${o.board}"` : ''} ${o.stones ? `data-piece-set="${o.stones}"` : ''} style="---zoom:80">
<div id="main-wrap"><main class="puzzle">
  <aside class="puzzle__side"><div class="puzzle__side__metas"></div></aside>
  <div class="puzzle__board main-board"></div>
  <div class="puzzle__tools"></div>
  <div class="puzzle__controls"></div>
</main></div>
<script src="/assets/javascripts/vendor/cash.min.js"></script>
<script type="module">
// lila's site bundle isn't on this trimmed page: what the puzzle page uses of it, recorded.
window.sounds = [];
window.spoken = [];
const keys = {};
const mousetrap = { bind: (ks, f) => { for (const k of [].concat(ks)) keys[k] = f; return mousetrap; } };
window.keys = keys;
window.site = {
  sri: 'test-sri',
  manifest: { i18n: {} },
  sound: { play: async name => void window.sounds.push(name), say: t => { window.spoken.push(t); return false; } },
  mousetrap,
  asset: { loadCssPath: async () => {}, loadEsm: async () => ({}), flairSrc: () => '' },
  powertip: {},
  unload: { expected: false },
  blindMode: false,
  redirect: url => { window.redirected = url; },
};
await import(${JSON.stringify(i18nFile('en-GB'))});
await import(${JSON.stringify(i18nFile('site.en-GB'))});
await import(${JSON.stringify(i18nFile('puzzle.en-GB'))});
const mod = await import(${JSON.stringify(js)});
window.puzzle = mod.initModule(${JSON.stringify(opts)});
</script>
</body>
</html>`;
}

/** A field of the multipart form lila's `xhr.form` sends. */
const formField = (body: string | null, name: string): string | undefined =>
  body?.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1];

const contentTypes: Record<string, string> = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
};

/** One result the page sent to the server (`POST /training/complete/:theme/:id`). */
export interface Completed {
  theme: string;
  id: string;
  win: boolean;
  rated: boolean;
}

export interface Opened {
  /** The results the page sent, in order, and the votes. */
  completed: Completed[];
  votes: Array<{ id: string; vote: boolean }>;
  /** Requests the page made that this harness doesn't answer, and errors it logged. */
  problems: { requests: string[]; errors: string[] };
}

/** Opens a puzzle on the trainer page and waits for its board. */
export async function openPuzzle(page: Page, options: PuzzleOptions): Promise<Opened> {
  const opened: Opened = { completed: [], votes: [], problems: { requests: [], errors: [] } };
  const signedIn = options.rating !== undefined;
  let rating = options.rating ?? 0;
  page.on('pageerror', e => opened.problems.errors.push(String(e)));
  page.on('console', msg => msg.type() === 'error' && opened.problems.errors.push(msg.text()));
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin && url.pathname === `/training/${options.puzzle.id}`)
      return route.fulfill({ contentType: 'text/html', body: html(options) });
    if (url.origin === origin && request.method() === 'POST') {
      const complete = url.pathname.match(/^\/training\/complete\/([^/]+)\/(\w{5})$/);
      if (complete) {
        const body = request.postData();
        const win = formField(body, 'win') === 'true';
        opened.completed.push({
          theme: complete[1],
          id: complete[2],
          win,
          rated: formField(body, 'rated') === 'true',
        });
        const diff = win ? (options.ratingDiff ?? 8) : -(options.ratingDiff ?? 8);
        // the player's rating carries over from one result to the next, as the server's does
        rating += diff;
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            ...(signedIn ? { round: { win, ratingDiff: diff } } : {}),
            next: options.next ? dataOf({ puzzle: options.next, rating }, signedIn) : undefined,
          }),
        });
      }
      const vote = url.pathname.match(/^\/training\/(\w{5})\/vote$/);
      if (vote) {
        opened.votes.push({ id: vote[1], vote: formField(request.postData(), 'vote') === 'true' });
        return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
      }
    }
    if (url.origin === origin && url.pathname.startsWith('/assets/')) {
      const file = join(publicDir, decodeURIComponent(url.pathname.slice('/assets/'.length)));
      if (!file.startsWith(publicDir + '/')) return route.fulfill({ status: 403 });
      try {
        const ext = file.slice(file.lastIndexOf('.'));
        return route.fulfill({ contentType: contentTypes[ext], body: readFileSync(file) });
      } catch {
        opened.problems.requests.push(url.href);
        return route.fulfill({ status: 404 });
      }
    }
    opened.problems.requests.push(`${request.method()} ${url.href}`);
    return route.abort();
  });
  await page.goto(`${origin}/training/${options.puzzle.id}`);
  await boardSvg(page).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return opened;
}

/** goban's board svg. */
export const boardSvg = (page: Page) => page.locator('.puzzle__go-board svg').first();

/** The puzzle on show, from the page's controller. */
const shown = (page: Page): Promise<PuzzleJson> =>
  page.evaluate(() => (window as any).puzzle.ctrl.data.puzzle as PuzzleJson);

/** Where an SGF point is on screen: goban shows only the bounds, with a label band on the board's own edges. */
export async function pointOf(page: Page, move: string): Promise<{ x: number; y: number }> {
  const p = await shown(page);
  const box = (await boardSvg(page).boundingBox())!;
  const b = p.bounds ?? { top: 0, left: 0, bottom: p.width - 1, right: p.width - 1 };
  const band = (edge: boolean) => (edge ? 1 : 0);
  const across = b.right - b.left + 1 + band(b.left === 0) + band(b.right === p.width - 1);
  const square = box.width / across;
  const [x, y] = [move.charCodeAt(0) - 97, move.charCodeAt(1) - 97];
  return {
    x: box.x + (x - b.left + band(b.left === 0) + 0.5) * square,
    y: box.y + (y - b.top + band(b.top === 0) + 0.5) * square,
  };
}

/** Clicks (or taps) an SGF point on the board shown. */
export async function play(page: Page, move: string, touch = false): Promise<void> {
  await boardSvg(page).scrollIntoViewIfNeeded();
  const p = await pointOf(page, move);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

/** The position on the board shown, as rows of `.XO` (libs/board's `state()`). */
export const position = (page: Page) =>
  page.evaluate(() => (window as any).puzzle.ctrl.board.api.state().board as string[]);

/** The moves played in this attempt (the player's and goban's replies), as SGF points. */
export const line = (page: Page) =>
  page.evaluate(() => (window as any).puzzle.ctrl.board.api.line() as string[]);

/** The names of lila's sounds the page played, in order. */
export const sounds = (page: Page) => page.evaluate(() => (window as unknown as { sounds: string[] }).sounds);

/** Presses a key the page binds (lila's mousetrap, recorded by this harness). */
export const key = (page: Page, k: string) =>
  page.evaluate(k => {
    (window as any).keys[k]({ key: k });
  }, k);

/** The feedback panel's class: `play`, `good`, `fail` or `after`. */
export const feedback = (page: Page) => page.locator('.puzzle__feedback');

/** Waits until the board shows `n` moves of the attempt. */
export const boardMoves = (page: Page, n: number) =>
  expect.poll(async () => (await line(page)).length).toBe(n);
