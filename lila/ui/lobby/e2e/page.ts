// Serves the built lobby page to Playwright without a lila server (unit 6.6), with a stand-in for the
// lobby's websocket. The page is a trimmed copy of what lila's `views.lobby.home` renders: the same CSS,
// the same `main.lobby` markup (`views.lobby.bits.lobbyApp`) and the same module, with the init data
// shaped as `home.scala` sends it: the seven pools (PoolList.json), the two correspondence tiles
// (CorresPresets.json), and the viewer, a member or a guest. lila's own English words come from the
// built i18n files. The stand-in socket answers pings, records what the page sends and lets a test push
// `poolSizes` and `poolRange`, as LobbySocket does. Casual and correspondence clicks POST forms, which
// the harness records and answers; any other request the harness doesn't know fails the test.
// Assets come from lila/public as lila serves them at /assets/.

import { expect, type Page, type WebSocketRoute } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '../../../public');
const origin = 'http://ligo.test';

/** The instant the page's clock is frozen at (and starts from). */
export const startTime = new Date('2026-10-01T12:00:00Z');

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

// The shared chunk the lobby imports lib's `pubsub` from (its names are minified, so found by its code).
const pubsubChunk = (imports: string[]): string => {
  const name = imports.find(f =>
    readFileSync(join(publicDir, 'compiled', f), 'utf8').includes('oneTimeEvents'),
  );
  if (!name) throw new Error('no pubsub chunk among the lobby bundle imports: rebuild the ui');
  return `/assets/compiled/${name}`;
};

/** modules/pool PoolList.json: the seven pools (ADR 0022 §1). */
export const pools = [
  {
    id: '9x9-1m-5x10s',
    size: 9,
    clock: '1+5×10s',
    speed: 'bullet',
    byo: { limit: 60, periods: 5, period: 10 },
  },
  {
    id: '9x9-3m-3x20s',
    size: 9,
    clock: '3+3×20s',
    speed: 'blitz',
    byo: { limit: 180, periods: 3, period: 20 },
  },
  { id: '9x9-3m-2s', size: 9, clock: '3+2', speed: 'blitz', lim: 3, inc: 2 },
  {
    id: '19x19-5m-5x10s',
    size: 19,
    clock: '5+5×10s',
    speed: 'blitz',
    byo: { limit: 300, periods: 5, period: 10 },
  },
  {
    id: '19x19-10m-5x30s',
    size: 19,
    clock: '10+5×30s',
    speed: 'rapid',
    byo: { limit: 600, periods: 5, period: 30 },
  },
  {
    id: '19x19-20m-5x30s',
    size: 19,
    clock: '20+5×30s',
    speed: 'rapid',
    byo: { limit: 1200, periods: 5, period: 30 },
  },
  { id: '19x19-10m-10s', size: 19, clock: '10+10', speed: 'rapid', lim: 10, inc: 10 },
];

/** modules/lobby CorresPresets.json: the two correspondence tiles (ADR 0022 §1). */
export const corres = [
  { id: '19x19-1d', days: 1, go: { size: 19, rules: 'japanese', komi: 6.5 } },
  { id: '19x19-3d', days: 3, go: { size: 19, rules: 'japanese', komi: 6.5 } },
];

/** GoRating.rankTable, as the lobby's data carries it (unit 5.7): 1650 is 4k. */
const rankTable = JSON.parse(readFileSync(join(publicDir, '../ui/playground/e2e/rank-table.json'), 'utf8'));

export interface LobbyOptions {
  /** A signed-in member (rated Go 1650), or a guest. */
  member?: boolean;
  /** The URL to open, with its query and hash: '/?user=Shiro#friend' is a profile's challenge link. */
  path?: string;
}

/** GoRating.rankTable, as the lobby page data carries it (ADR 0021 §3). */
const rankTable = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../playground/e2e/rank-table.json'), 'utf8'),
);

/** What GET /setup/go-handicap/:username answers (controllers.Setup.goHandicap): stones per rated board. */
export interface HandicapAdvice {
  19: { suggested: number; min: number; max: number };
  9: { suggested: number; min: number; max: number };
  black: boolean;
}

function initOptions(o: LobbyOptions) {
  return {
    data: {
      ...(o.member ? { me: { username: 'Kuro', isBot: false } } : {}),
      nbNowPlaying: 0,
      nbMyTurn: 0,
      nowPlaying: [],
      ratingMap: o.member ? { go: 1650 } : null,
      ...(o.member ? { goRank: '3k', rankTable } : {}),
      counters: { members: 120, rounds: 4 },
      rankTable,
    },
    showRatings: true,
    pools,
    corres,
  };
}

function html(o: LobbyOptions): string {
  const m = manifest();
  const css = (name: string) => `<link rel="stylesheet" href="/assets/css/${name}.${m.css[name]}.css">`;
  const js = `/assets/compiled/lobby.${m.js.lobby.hash}.js`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LiGo</title>
${css('lib.theme.all')}
${css('site')}
${css('lobby')}
<style>@font-face { font-family: 'lichess'; font-display: block; src: url('/assets/font/lichess.woff2') format('woff2') }</style>
<link id="favicon" rel="icon" href="/assets/logo/ligo-favicon.svg">
</head>
<body data-theme="dark" class="fixed-scroll" data-socket-domains="ligo.test"
  ${o.member ? 'data-user="kuro"' : ''} data-sound-set="standard" data-board="Plain" data-piece-set="Plain">
<div id="main-wrap"><main class="lobby">
  <div class="lobby__side"><div class="about-side">LiGo is a free, open-source Go server.</div></div>
  <div class="lobby__app"><div class="tabs-horiz"><span>&nbsp;</span></div><div class="lobby__app__content lpools"></div></div>
  <div class="lobby__table"><div class="lobby__start">
    <button class="button button-metal lobby__start__button lobby__start__button--hook">Create a game</button>
    <button class="button button-metal lobby__start__button lobby__start__button--friend">Challenge a friend</button>
  </div></div>
</main></div>
<script src="/assets/javascripts/vendor/cash.min.js"></script>
<script type="module">
// lila's site bundle isn't on this trimmed page: what the lobby uses of it.
const chain = new Proxy(() => chain, { get: () => chain });
window.site = {
  sri: 'test-sri',
  manifest: { i18n: {} },
  sound: { play: async () => {}, say: () => false, speech: () => false, preloadBoardSounds: () => {} },
  mousetrap: chain,
  // dialogs load their own styles (bits.dialog, and the window's lobby.setup) by hashed path, as lila's site bundle does
  asset: {
    loadCssPath: key => new Promise(done => {
      if (document.querySelector('link[data-css="' + key + '"]')) return done();
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/assets/css/' + key + '.' + ${JSON.stringify(m.css)}[key] + '.css';
      link.dataset.css = key;
      link.onload = link.onerror = () => done();
      document.head.append(link);
    }),
    removeCssPath: () => {},
    loadEsm: async () => ({}),
    flairSrc: () => '',
  },
  powertip: {},
  unload: { expected: false },
  quietMode: false,
  blindMode: false,
  redirect: to => { window.redirectedTo = to; },
  reload: () => { window.reloaded = true; },
};
await import(${JSON.stringify(i18nFile('en-GB'))});
await import(${JSON.stringify(i18nFile('site.en-GB'))});
// lila's site bundle completes 'polyfill.dialog', which dialogs (a guest's correspondence click) wait for
for (const v of Object.values(await import(${JSON.stringify(pubsubChunk(m.js.lobby.imports))})))
  if (v && typeof v.complete === 'function' && typeof v.after === 'function') v.complete('polyfill.dialog');
const m = await import(${JSON.stringify(js)});
window.lobby = await m.initModule(${JSON.stringify(initOptions(o))});
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

/** The lobby's websocket as lila-ws and lila would answer it: pongs, and what the test pushes. */
export class FakeLobby {
  /** Messages the page sent (pings aside), in order. */
  readonly received: Array<{ t: string; d?: any }> = [];
  private ws?: WebSocketRoute;

  attach(ws: WebSocketRoute): void {
    this.ws = ws;
    ws.onMessage(raw => {
      const text = String(raw);
      if (text === 'p' || text === 'null' || text.startsWith('{"t":"p"')) return ws.send('0');
      this.received.push(JSON.parse(text));
    });
  }

  connected = (): boolean => !!this.ws;

  /** What the page sent with this message type. */
  sent = (t: string) => this.received.filter(m => m.t === t).map(m => m.d);

  push(t: string, d: unknown): void {
    this.ws!.send(JSON.stringify({ t, d }));
  }

  /** LobbySocket's `poolSizes`: how many wait in each pool. */
  poolSizes = (sizes: Record<string, number>) => this.push('poolSizes', sizes);

  /** LobbySocket's `hooks`: every open real-time game, as lila sends them when the Live list opens. */
  hooks = (list: unknown[]) => this.push('hooks', list);

  /** LobbySocket's `poolRange`: who the waiting player can meet. */
  poolRange = (range: { id: string; weakest: string; strongest: string; stones: number }) =>
    this.push('poolRange', range);
}

export interface Opened {
  server: FakeLobby;
  /** Form bodies POSTed to /setup/hook/<sri>, as key/value objects, in order. */
  hooks: Array<Record<string, string>>;
  /** Challenges POSTed to /setup/friend: the named player (the `user` parameter) and the form. */
  friends: Array<{ user: string | null; form: Record<string, string> }>;
  /** What GET /setup/go-handicap/:username answers; a test may change it before opening the window. */
  advice: HandicapAdvice;
  /** The usernames the page asked a suggestion for. */
  adviceAsked: string[];
  /** What GET /lobby/seeks answers: a test adds seeks here. */
  seeks: Array<Record<string, unknown>>;
  /** Requests the page made that this harness doesn't answer, and errors it logged. */
  problems: { requests: string[]; errors: string[] };
}

/**
 * Opens the lobby page as a member or a guest and waits for its tiles and its socket. The page's clock
 * is frozen at `startTime` (Playwright's `page.clock`): time moves only when a test runs it.
 */
export async function openLobby(page: Page, options: LobbyOptions = {}): Promise<Opened> {
  const server = new FakeLobby();
  const hooks: Array<Record<string, string>> = [];
  const seeks: Array<Record<string, unknown>> = [];
  const friends: Opened['friends'] = [];
  const adviceAsked: string[] = [];
  const advice: HandicapAdvice = {
    19: { suggested: 5, min: 4, max: 6 },
    9: { suggested: 1, min: 0, max: 2 },
    black: true,
  };
  const problems = { requests: [] as string[], errors: [] as string[] };
  page.on('pageerror', e => problems.errors.push(String(e)));
  page.on('console', msg => msg.type() === 'error' && problems.errors.push(msg.text()));
  await page.clock.install({ time: startTime });
  await page.routeWebSocket(/\/lobby\/socket\//, ws => server.attach(ws));
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin && url.pathname === '/')
      return route.fulfill({ contentType: 'text/html', body: html(options) });
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
    // a casual tile's open game, or a correspondence tile's seek
    if (url.origin === origin && request.method() === 'POST' && url.pathname.startsWith('/setup/hook/')) {
      hooks.push(formFields(request.postData() ?? ''));
      return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    }
    // a challenge: to a link, or to the player named by `?user=`
    if (url.origin === origin && request.method() === 'POST' && url.pathname === '/setup/friend') {
      friends.push({ user: url.searchParams.get('user'), form: formFields(request.postData() ?? '') });
      return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
    }
    if (url.origin === origin && url.pathname.startsWith('/setup/go-handicap/')) {
      adviceAsked.push(decodeURIComponent(url.pathname.slice('/setup/go-handicap/'.length)));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(advice) });
    }
    if (url.origin === origin && url.pathname === '/lobby/seeks')
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(seeks) });
    problems.requests.push(`${request.method()} ${url.href}`);
    return route.abort();
  });
  await page.goto(`${origin}${options.path ?? '/'}`);
  await page.locator('.lpool').first().waitFor();
  await expect.poll(server.connected).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  return { server, hooks, friends, advice, adviceAsked, seeks, problems };
}

/** The fields of a form lila's `form()` sends (multipart/form-data). */
const formFields = (body: string): Record<string, string> =>
  Object.fromEntries(
    [...body.matchAll(/name="([^"]+)"\r?\n\r?\n([^\r\n]*)\r?\n/g)].map(m => [m[1], m[2]] as [string, string]),
  );

/** Tiles by what they show. */
export const tile = (page: Page, id: string) => page.locator(`.lpool[data-id="${id}"]`);
