// The lobby load test (unit 6.9, ADR 0022 §10), run by k6 through `dev/ligo loadtest`.
//
// setup() signs up 2 x PAIRS players at 5k (so every pair is an even game). Then each virtual user
// (one per player) does what the lobby does with a tile click:
//  1. opens the lobby websocket with its session cookie and sends `poolIn` for the 9x9 3+2 pool;
//  2. waits for the `redirect` to its new game (pool_wait_ms);
//  3. reads its colour and the socket version from the game's JSON, opens the round websocket and
//     plays MOVES stones in turn (move_ms: from sending a stone to the server's move event for it);
//  4. Black resigns after White's last stone; the game counts once both players see it end.
// Stones go on the edge rows (Black rows a-b, White rows h-i), so nothing is ever captured.
// Licence: MIT (LiGo's own code, ADR 0006).

import http from 'k6/http';
import ws from 'k6/ws';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:9663';
const WS = __ENV.WS_URL || 'ws://localhost:9664';
const PAIRS = Number(__ENV.PAIRS || 10);
const MOVES = Math.min(Number(__ENV.MOVES || 10), 18);
const POOL = __ENV.POOL || '9x9-3m-2s';

const poolWait = new Trend('pool_wait_ms', true);
const moveTime = new Trend('move_ms', true);
const gameTime = new Trend('game_ms', true);
const gamesEnded = new Counter('games_ended');
const completed = new Rate('player_completed');

export const options = {
  setupTimeout: '5m',
  scenarios: {
    pools: { executor: 'per-vu-iterations', vus: 2 * PAIRS, iterations: 1, maxDuration: '5m' },
  },
  thresholds: {
    player_completed: ['rate>=0.95'],
    move_ms: ['p(95)<1000'],
  },
};

// letters a-j only, so a name can't look like a title (GM, FM, ...)
const letters = n => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 10))).join('');

export function setup() {
  const players = [];
  const jar = http.cookieJar();
  for (let i = 0; i < 2 * PAIRS; i++) {
    jar.clear(BASE);
    const name = `lt${letters(12)}`;
    const res = http.post(
      `${BASE}/signup`,
      {
        username: name,
        password: `${name}-Go-pass`,
        email: `${name}@gmail.com`, // on lila's allowlist: no MX lookup
        'agreement.assistance': 'true',
        'agreement.nice': 'true',
        'agreement.account': 'true',
        goRank: '5k',
      },
      { headers: { 'x-requested-with': 'XMLHttpRequest', Origin: BASE } },
    );
    const session = jar.cookiesForURL(BASE).lila2;
    if (res.status >= 400 || !session) throw new Error(`signup ${name}: HTTP ${res.status}`);
    players.push({ name, cookie: `lila2=${session[0]}` });
  }
  jar.clear(BASE);
  return { players };
}

const sri = () => letters(12);

function headers(cookie) {
  return { Cookie: cookie, Origin: BASE };
}

/** Joins the pool and returns the new game's full id (game id + player id), or undefined. */
function joinPool(cookie) {
  let fullId;
  const start = Date.now();
  ws.connect(`${WS}/lobby/socket/v5?sri=${sri()}`, { headers: headers(cookie) }, socket => {
    socket.on('open', () => {
      socket.send(JSON.stringify({ t: 'poolIn', d: { id: POOL, handicap: false } }));
      socket.setInterval(() => socket.send('p'), 2000);
    });
    socket.on('message', raw => {
      if (raw === '0') return; // pong
      const msg = JSON.parse(raw);
      if (msg.t === 'redirect') {
        fullId = msg.d.id;
        poolWait.add(Date.now() - start);
        socket.close();
      }
    });
    socket.setTimeout(() => socket.close(), 90_000);
  });
  return fullId;
}

/** The edge points of a colour: Black rows a-b, White rows i-h (SGF coordinates). */
const points = color => {
  const rows = color === 'black' ? ['a', 'b'] : ['i', 'h'];
  return rows.flatMap(r => 'abcdefghi'.split('').map(c => c + r));
};

/** Plays the game to its end; true when this player saw it end. */
function play(cookie, fullId) {
  const res = http.get(`${BASE}/${fullId}`, {
    headers: { ...headers(cookie), Accept: 'application/vnd.lichess.v5+json' },
  });
  if (!check(res, { 'game JSON': r => r.status === 200 })) return false;
  const data = res.json();
  const color = data.player.color;
  const mine = points(color);
  let played = 0;
  let sentAt = 0;
  let ack = 0;
  let ended = false;
  const start = Date.now();
  const url = `${WS}/play/${fullId}/v6?sri=${sri()}&v=${data.player.version}`;
  ws.connect(url, { headers: headers(cookie) }, socket => {
    // Black moves at even plies of an even game
    const myTurn = ply => (ply % 2 === 0) === (color === 'black');
    const move = ply => {
      if (!myTurn(ply)) return;
      if (played < MOVES) {
        sentAt = Date.now();
        socket.send(JSON.stringify({ t: 'move', d: { u: mine[played], a: ++ack } }));
        played++;
      } else if (color === 'black') socket.send(JSON.stringify({ t: 'resign' }));
    };
    const onEvent = ev => {
      if (ev.t === 'move' && ev.d) {
        const ply = ev.d.ply;
        if (!myTurn(ply - 1)) move(ply); // the opponent's stone: our turn
        else if (sentAt) {
          moveTime.add(Date.now() - sentAt); // our own stone, back from the server
          sentAt = 0;
        }
      } else if (ev.t === 'endData' || ev.t === 'end') {
        if (!ended) {
          ended = true;
          gameTime.add(Date.now() - start);
          if (color === 'black') gamesEnded.add(1);
          socket.close();
        }
      }
    };
    socket.on('open', () => {
      socket.setInterval(() => socket.send('p'), 2000);
      move(data.game.turns ?? 0);
    });
    socket.on('message', raw => {
      if (raw === '0') return;
      const msg = JSON.parse(raw);
      if (msg.t === 'b' && Array.isArray(msg.d)) msg.d.forEach(onEvent);
      else onEvent(msg);
    });
    socket.setTimeout(() => socket.close(), 180_000);
  });
  return ended;
}

export default function (data) {
  const me = data.players[__VU - 1];
  const fullId = joinPool(me.cookie);
  const ok = !!fullId && play(me.cookie, fullId);
  completed.add(ok);
}

export function handleSummary(summary) {
  const m = summary.metrics;
  const val = (name, stat) => (m[name] ? Math.round(m[name].values[stat]) : 'n/a');
  const line =
    `LOADTEST pairs=${PAIRS} stones=${MOVES} games_ended=${val('games_ended', 'count')} ` +
    `players_completed=${m.player_completed ? (100 * m.player_completed.values.rate).toFixed(1) : 'n/a'}% ` +
    `pool_wait_ms(p50/p95/max)=${val('pool_wait_ms', 'med')}/${val('pool_wait_ms', 'p(95)')}/${val('pool_wait_ms', 'max')} ` +
    `move_ms(p50/p95/max)=${val('move_ms', 'med')}/${val('move_ms', 'p(95)')}/${val('move_ms', 'max')} ` +
    `game_ms(p50)=${val('game_ms', 'med')}`;
  return { stdout: `\n${line}\n`, 'loadtest-summary.json': JSON.stringify(summary, null, 2) };
}
