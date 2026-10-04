import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { NowPlaying } from '../src/interfaces';

// lib/i18n builds its date formatter for the page's language when it loads.
document.documentElement.lang = 'en-GB';
const { waitingFor } = await import('../src/view/playing');

// Unit 7.7: what a game in the "now playing" list says it is waiting for (ADR 0023 §4). The server
// says `isMyTurn` for a player who has not accepted the count (7.6); the row says what to do.

const game = (o: Partial<NowPlaying>): NowPlaying =>
  ({ isMyTurn: false, hasMoved: true, ...o }) as NowPlaying;

describe('the now-playing list', () => {
  test('a game where it is not your turn says nothing', () => {
    assert.equal(waitingFor(game({ isMyTurn: false, secondsLeft: 500 })), undefined);
  });

  test('your turn, with a clock: the time left; without one: "Your turn"', () => {
    assert.equal(waitingFor(game({ isMyTurn: true, secondsLeft: 86400 * 3 })), 'time');
    assert.equal(waitingFor(game({ isMyTurn: true })), 'move');
    assert.equal(waitingFor(game({ isMyTurn: true, secondsLeft: 500, hasMoved: false })), 'move');
  });

  test('in the scoring phase the count is waiting, whatever the turn clock says', () => {
    const count = { isMyTurn: true, secondsLeft: 86400 * 3, go: { phase: 'scoring' } };
    assert.equal(waitingFor(game(count)), 'count');
    assert.equal(waitingFor(game({ ...count, isMyTurn: false })), undefined, 'accepted: nothing to do');
    assert.equal(waitingFor(game({ ...count, go: { phase: 'play' } })), 'time');
  });
});
