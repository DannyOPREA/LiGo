import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { Notification } from '../src/interfaces';

// Unit 7.7: the bell's entries for a correspondence Go game.
//
// The tests' i18n stand-in answers a key with a function, which snabbdom would take for element data
// rather than text. Here the plain keys of `site` are strings that name themselves ("site.draw") and the
// two keys that take a name are functions, so what a renderer wrote can be read off its vnode.
const stand: any = globalThis.i18n;
const site = new Proxy(Object.create(null), {
  get: (_t, key: string) =>
    key === 'gameVsX' || key === 'resVsX'
      ? (...args: unknown[]) => `site.${key}(${args.join(', ')})`
      : `site.${key}`,
});
Object.defineProperty(globalThis, 'i18n', {
  value: new Proxy(Object.create(null), { get: (_t, ns: string) => (ns === 'site' ? site : stand[ns]) }),
  configurable: true,
  writable: true,
});

// lib/i18n builds its date formatter for the page's language when it loads.
document.documentElement.lang = 'en-GB';
const { default: makeRenderers } = await import('../src/renderers');

const note = (type: string, content: Record<string, unknown>): Notification =>
  ({ type, content, read: false, date: 1_700_000_000_000 }) as Notification;

const renderers = makeRenderers();
const opponent = { id: 'shiro', name: 'Shiro' };
const words = (vnode: unknown) => JSON.stringify(vnode);

describe('the scoring-phase entry (ADR 0023 §4)', () => {
  const n = note('scoringPhase', { id: 'abcd1234', op: 'Shiro' });

  test('has a renderer, so the bell no longer shows an empty entry', () => {
    assert.ok(renderers.scoringPhase);
  });

  test('says it is time to count, links to the game and names the opponent', () => {
    const vnode = renderers.scoringPhase.html(n);
    assert.equal(vnode.sel?.startsWith('a'), true, 'a link');
    assert.equal(vnode.data?.attrs?.href, '/abcd1234');
    assert.match(words(vnode.children), /site\.scoringPhaseStarted/);
    assert.match(words(vnode.children), /site\.gameVsX\(Shiro\)/);
    assert.equal(renderers.scoringPhase.text(n), 'site.scoringPhaseStarted');
  });
});

describe('the game-end entry', () => {
  const end = (c: Record<string, unknown>) => note('gameEnd', { id: 'abcd1234wxyz', opponent, ...c });
  const html = (n: Notification) => words(renderers.gameEnd.html(n).children);

  test('a win and a defeat read as they did', () => {
    assert.match(html(end({ win: true })), /site\.congratsYouWon/);
    assert.match(html(end({ win: false })), /site\.defeat/);
  });

  test('a tie is still a draw', () => {
    assert.match(html(end({})), /site\.draw/);
    assert.match(String(renderers.gameEnd.text(end({}))), /site\.draw/);
  });

  test('a game that ended with no result says so instead of "draw"', () => {
    const n = end({ noResult: true });
    assert.match(html(n), /site\.gameEndedWithNoResult/);
    assert.doesNotMatch(html(n), /site\.draw/);
    assert.match(String(renderers.gameEnd.text(n)), /site\.gameEndedWithNoResult/);
  });
});
