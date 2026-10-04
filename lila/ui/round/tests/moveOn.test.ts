import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import type RoundController from '../src/ctrl';
import MoveOn from '../src/moveOn';

// lila's "play the next game" setting (unit 7.7): a correspondence player who has nothing left to do in this
// game is taken to the next one, but never a spectator, nor a player the game still waits for (their move,
// or a count they have not accepted).

describe('play the next game', () => {
  const realFetch = globalThis.fetch;
  let fetched: string[];
  let went: string[];

  beforeEach(() => {
    fetched = [];
    went = [];
    globalThis.fetch = async (url: string | URL | Request) => {
      fetched.push(String(url));
      return new Response(JSON.stringify({ next: 'nextgame1234' }), {
        headers: { 'content-type': 'application/json' },
      });
    };
    localStorage.clear();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const moveOn = (o: { spectator?: boolean; myTurn?: boolean; speed?: string; on?: boolean } = {}) => {
    const ctrl = {
      data: {
        game: { id: 'abcdefgh', speed: o.speed ?? 'correspondence' },
        player: { id: 'wxyz', spectator: !!o.spectator, color: 'black' },
        opponent: {},
      },
      isMyTurn: () => !!o.myTurn,
      setRedirecting: () => {},
      opts: {},
    } as unknown as RoundController;
    const m = new MoveOn(ctrl, 'move-on', href => went.push(href));
    localStorage.setItem('move-on', (o.on ?? true) ? '1' : '0');
    return m;
  };
  // the whats-next answer is a promise: let it settle
  const settled = () => new Promise(resolve => setTimeout(resolve, 0));

  test('a correspondence player with nothing left to do goes to the next game the server names', async () => {
    moveOn().next();
    await settled();
    assert.deepEqual(fetched, ['/whats-next/abcdefghwxyz']);
    assert.deepEqual(went, ['/nextgame1234']);
  });

  test('stays when the game waits for the player: their move, or a count they have not accepted', async () => {
    moveOn({ myTurn: true }).next();
    await settled();
    assert.deepEqual([fetched, went], [[], []]);
  });

  test('a spectator, a real-time game, or the setting off: nothing happens', async () => {
    moveOn({ spectator: true }).next();
    moveOn({ speed: 'blitz' }).next();
    moveOn({ on: false }).next();
    await settled();
    assert.deepEqual([fetched, went], [[], []]);
  });

  test('turning the setting on goes straight to the next game', () => {
    const m = moveOn({ on: false });
    m.toggle();
    assert.equal(m.get(), true);
    assert.deepEqual(went, ['/round-next/abcdefgh']);
  });
});
