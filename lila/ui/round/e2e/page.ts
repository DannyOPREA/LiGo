// Serves the built round page to Playwright without a lila server (unit 3.18), with a stand-in for
// the game's websocket. The page is a trimmed copy of what lila's `views.round.player` renders: the
// same CSS, the same `main.round` markup and the same module with round data shaped as lila's
// `round.JsonView` sends it for a Go game (units 3.12–3.13), in lila's default (dark) theme, without
// the site header. lila's own English words come from the built i18n files. The stand-in socket
// answers pings, acknowledges messages and turns a sent move into the server's `move` event (ADR 0019
// §6) without checking it: the rules are the board's and the server's, tested elsewhere.
// Assets come from lila/public as lila serves them at /assets/; any other request fails the test.

import { expect, type Page, type WebSocketRoute } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '../../../public');
const origin = 'http://ligo.test';
export const gameId = 'abcdefgh';
const playerId = 'pppp';

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
  // The newest build's file: earlier builds leave theirs behind (a fresh checkout, as on CI, has one).
  const dir = join(publicDir, 'compiled/i18n');
  const name = readdirSync(dir)
    .filter(f => f.startsWith(`${prefix}.`) && /^[0-9a-f]+\.js$/.test(f.slice(prefix.length + 1)))
    .sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs)[0];
  if (!name) throw new Error(`no ${prefix} i18n file in lila/public/compiled/i18n: build the ui first`);
  return `/assets/compiled/i18n/${name}`;
};

export interface GameOptions {
  size?: 9 | 13 | 19;
  /** Moves already played: SGF points and `pass`. */
  moves?: string[];
  handicap?: number;
  color?: Color;
  confirmMoves?: number;
  /** Seconds on each clock (Fischer, 2 s increment, or main time with `byoyomi`); none for no clock. */
  clock?: number;
  /** A byo-yomi clock (unit 4.7): periods each side has left and their length in seconds. */
  byoyomi?: { periods: number; byo: number } | null;
  /** A game loaded in its scoring phase: the server's `scoring` (ADR 0020 §6). */
  scoring?: unknown;
  /** The board and stone preferences (`theme`, `pieceSet`) lila puts on <body>: goban's theme names. */
  board?: string;
  stones?: string;
}

type Color = 'black' | 'white';

/** The round data lila sends for a Go game in play (round.JsonView.playerJson). */
function roundData(o: Required<GameOptions>) {
  const firstPly = o.handicap >= 2 ? 0 : 1;
  const turns = firstPly + o.moves.length;
  const toMove: Color = turns % 2 === 0 ? 'white' : 'black';
  const other: Color = o.color === 'black' ? 'white' : 'black';
  const person = (color: Color, name: string) => ({
    color,
    user: { id: name.toLowerCase(), username: name, online: true },
    rating: 1500,
    provisional: true,
    onGame: true,
  });
  return {
    game: {
      id: gameId,
      variant: { key: 'standard', name: 'Standard', short: 'Std' },
      speed: 'blitz',
      perf: 'go',
      rated: false,
      source: 'lobby',
      status: { id: 20, name: 'started' },
      createdAt: 0,
      turns,
      player: toMove,
      ...(firstPly > 0 ? { startedAtTurn: firstPly } : {}),
      go: {
        size: o.size,
        rules: 'japanese',
        komi: o.handicap >= 2 ? 0.5 : 6.5,
        moves: o.moves.join(' '),
        prisoners: { b: 0, w: 0 },
        phase: o.scoring ? 'scoring' : 'play',
        ...(o.handicap >= 2 ? { handicap: o.handicap } : {}),
      },
      ...(o.scoring ? { scoring: o.scoring } : {}),
    },
    player: { ...person(o.color, o.color === 'black' ? 'Kuro' : 'Shiro'), id: playerId, version: 0 },
    opponent: person(other, other === 'black' ? 'Kuro' : 'Shiro'),
    pref: {
      animationDuration: 250,
      coords: 1,
      resizeHandle: 1,
      replay: 2,
      clockTenths: 1,
      clockBar: true,
      clockSound: true,
      confirmResign: true,
      confirmMoves: o.confirmMoves,
    },
    ...(o.clock
      ? {
          clock: {
            running: o.moves.length >= 2,
            initial: o.clock,
            increment: o.byoyomi ? 0 : 2,
            white: o.clock,
            black: o.clock,
            emerg: o.byoyomi ? Math.min(10, Math.max(3, Math.floor(o.byoyomi.byo / 3))) : 30,
            moretime: 15,
            ...(o.byoyomi
              ? { periods: { b: o.byoyomi.periods, w: o.byoyomi.periods }, byo: o.byoyomi.byo }
              : {}),
          },
        }
      : {}),
    takebackable: true,
    moretimeable: true,
    steps: [
      { ply: 0, uci: null, san: null, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
    ],
  };
}

/** Text safe inside a double-quoted HTML attribute ("Slate & Shell"). */
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function html(o: Required<GameOptions>): string {
  const m = manifest();
  const css = (name: string) => `<link rel="stylesheet" href="/assets/css/${name}.${m.css[name]}.css">`;
  const js = `/assets/compiled/round.${m.js.round.hash}.js`;
  const opts = { data: roundData(o), userId: o.color === 'black' ? 'kuro' : 'shiro' };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Play • LiGo</title>
${css('lib.theme.all')}
${css('site')}
${css('round')}
<style>@font-face { font-family: 'lichess'; font-display: block; src: url('/assets/font/lichess.woff2') format('woff2') }</style>
<link id="favicon" rel="icon" href="/assets/logo/ligo-favicon.svg">
</head>
<body data-theme="dark" class="coords-in playing fixed-scroll" data-socket-domains="ligo.test"
  data-user="${opts.userId}" data-sound-set="standard" data-board="${attr(o.board)}" data-piece-set="${attr(o.stones)}"
  style="---zoom:80">
<div id="main-wrap"><main class="round">
  <aside class="round__side"></aside>
  <div class="round__app"><div class="round__app__board main-board"></div><div class="col1-rmoves-preload"></div></div>
  <div class="round__underboard"></div>
  <div class="round__underchat"></div>
</main></div>
<script src="/assets/javascripts/vendor/cash.min.js"></script>
<script type="module">
// lila's site bundle isn't on this trimmed page: what the round page uses of it, recorded.
window.sounds = [];
const chain = new Proxy(() => chain, { get: () => chain });
window.site = {
  sri: 'test-sri',
  manifest: { i18n: {} },
  sound: {
    play: async name => void window.sounds.push(name),
    say: () => false,
    speech: () => false,
    preloadBoardSounds: () => {},
    byoyomi: (periods, seconds) => void window.sounds.push(\`byoyomi \${periods} \${seconds}\`),
    byoyomiReset: () => void window.sounds.push('byoyomiReset'),
  },
  mousetrap: chain,
  asset: { loadCssPath: async () => {}, loadEsm: async () => ({}), flairSrc: () => '' },
  powertip: {},
  unload: { expected: false },
  quietMode: false,
  blindMode: false,
  reload: () => { window.reloaded = true; },
};
await import(${JSON.stringify(i18nFile('en-GB'))});
await import(${JSON.stringify(i18nFile('site.en-GB'))});
await import(${JSON.stringify(i18nFile('preferences.en-GB'))});
const m = await import(${JSON.stringify(js)});
window.round = await m.initModule(${JSON.stringify(opts)});
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

/**
 * The game's websocket as lila-ws and lila would answer it for this unit: pongs, acks, and each
 * move the page sends (or the test plays for the opponent) sent back as the server's `move` event.
 */
export class FakeServer {
  /** Messages the page sent (pings aside), in order. */
  readonly received: Array<{ t: string; d?: any }> = [];
  private ws?: WebSocketRoute;
  private version = 0;

  constructor(
    public ply: number,
    private readonly clock?: number,
  ) {}

  attach(ws: WebSocketRoute): void {
    this.ws = ws;
    ws.onMessage(raw => {
      const text = String(raw);
      if (text === 'p' || text === 'null' || text.startsWith('{"t":"p"')) return ws.send('0');
      const msg = JSON.parse(text);
      this.received.push(msg);
      if (msg.d?.a) ws.send(JSON.stringify({ t: 'ack', d: msg.d.a }));
      if (msg.t === 'move') this.move(msg.d.u);
      if (msg.t === 'resign')
        this.event('endData', { status: { id: 31, name: 'resign' }, winner: 'white', boosted: false });
    });
  }

  connected = (): boolean => !!this.ws;

  /** Sends the server's `move` event for a stone or a pass by whoever's turn it is. */
  move(move: string, extra: Record<string, unknown> = {}): void {
    this.ply++;
    this.event('move', {
      ...(move === 'pass' ? { pass: true } : { p: move }),
      ply: this.ply,
      cap: [],
      prisoners: { b: 0, w: 0 },
      phase: 'play',
      board: '',
      ...(this.clock ? { clock: { white: this.clock, black: this.clock } } : {}),
      ...extra,
    });
  }

  event(t: string, d: unknown): void {
    this.ws!.send(JSON.stringify({ t, v: ++this.version, d }));
  }
}

export interface Opened {
  server: FakeServer;
  /** Requests the page made that this harness doesn't answer, and errors it logged. */
  problems: { requests: string[]; errors: string[] };
}

/** Opens a Go game on the round page and waits for its board and its socket. */
export async function openRound(page: Page, options: GameOptions = {}): Promise<Opened> {
  const o: Required<GameOptions> = {
    size: 9,
    moves: [],
    handicap: 0,
    color: 'black',
    confirmMoves: ConfirmMoves.NEVER,
    clock: 180,
    byoyomi: null,
    scoring: null,
    board: 'Plain',
    stones: 'Plain',
    ...options,
  };
  const server = new FakeServer((o.handicap >= 2 ? 0 : 1) + o.moves.length, o.clock || undefined);
  const problems = { requests: [] as string[], errors: [] as string[] };
  page.on('pageerror', e => problems.errors.push(String(e)));
  page.on('console', msg => msg.type() === 'error' && problems.errors.push(msg.text()));
  await page.routeWebSocket(/\/play\//, ws => server.attach(ws));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === `/${gameId}${playerId}`)
      return route.fulfill({ contentType: 'text/html', body: html(o) });
    // At the end lila sends the side panel again (Round.sides); this page's is empty.
    if (url.origin === origin && url.pathname === `/${gameId}/${o.color}/sides`)
      return route.fulfill({ contentType: 'text/html', body: '<aside class="round__side"></aside>' });
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
  await page.goto(`${origin}/${gameId}${playerId}`);
  await boardSvg(page).waitFor();
  await expect.poll(server.connected).toBe(true);
  await page.evaluate(() => document.fonts.ready);
  return { server, problems };
}

/** goban's board svg. */
export const boardSvg = (page: Page) => page.locator('.round__go-board svg').first();

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

/** The names of lila's sounds the page played, in order. */
export const sounds = (page: Page) => page.evaluate(() => (window as unknown as { sounds: string[] }).sounds);

/** The board's position as rows of `.XO` (libs/board's `state()`), read through the page's controller. */
export const position = (page: Page) =>
  page.evaluate(() => (window as any).round.board.board.state().board as string[]);

/** The moves listed beside the board. */
export const moveList = (page: Page) => page.locator('aPp Z7yx');
