import assert from 'node:assert/strict';
import { after, before, describe, mock, test } from 'node:test';

import { initMiniBoards, initMiniGame, updateMiniGame } from '../src/view/miniBoard';

// LiGo (unit 3.19, mini-board slice): a Go mini game draws its board and runs its clocks the way lila's
// Go clock does: paused until each side has played, then for the player to move.
const empty = '9/9/9/9/9/9/9/9/9';

function miniGame(state: string): HTMLElement {
  const node = document.createElement('a');
  node.className = 'mini-game mini-game--init';
  node.setAttribute('data-state', state);
  for (const part of ['white', 'board', 'black']) {
    const span = document.createElement('span');
    if (part === 'board') span.className = 'go-mini';
    else {
      span.className = `mini-game__clock mini-game__clock--${part}`;
      span.setAttribute('data-time', '60');
    }
    node.appendChild(span);
  }
  document.body.appendChild(node);
  return node;
}

const running = (node: Element) =>
  [...node.querySelectorAll('.clock--run')].map(e => (e.className.includes('--white') ? 'white' : 'black'));
const stones = (node: Element) =>
  node.querySelectorAll('.go-mini circle.black, .go-mini circle.white').length;

describe('Go mini games', () => {
  // the clock widgets tick on timers: mocked, so none outlives the tests
  before(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval'] }));
  after(() => mock.timers.reset());

  test('draws the board and keeps both clocks still before anyone has played', () => {
    const node = miniGame(`${empty},black,,0`);
    initMiniGame(node);
    assert.ok(node.querySelector('.go-mini svg'));
    assert.deepEqual(running(node), []);
  });

  test('clocks start once each side has played, a pass included, for the player to move', () => {
    const node = miniGame(`${empty},black,,0`);
    initMiniGame(node);
    updateMiniGame(node, { board: '9/9/9/9/4b4/9/9/9/9', turn: 'white', lm: 'ee', wc: 60, bc: 59 });
    assert.deepEqual(running(node), []);
    updateMiniGame(node, { board: '9/9/9/9/4b4/9/9/9/9', turn: 'black', lm: 'pass', wc: 59, bc: 59 });
    assert.deepEqual(running(node), ['black']);
    assert.equal(stones(node), 1);
  });

  test('a game rendered after two plies runs the clock of the player to move', () => {
    const node = miniGame('9/9/9/9/4bw3/9/9/9/9,black,fe,2');
    initMiniGame(node);
    assert.deepEqual(running(node), ['black']);
    assert.ok(node.querySelector('.go-mini circle.last.on-white'));
  });

  test('a position re-sent when the page starts watching is not a new ply', () => {
    const node = miniGame('9/9/9/9/4b4/9/9/9/9,white,ee,1');
    initMiniGame(node);
    updateMiniGame(node, { board: '9/9/9/9/4b4/9/9/9/9', turn: 'white', lm: 'ee', wc: 60, bc: 60 });
    assert.deepEqual(running(node), []);
    updateMiniGame(node, { board: '9/9/9/9/4bw3/9/9/9/9', turn: 'black', lm: 'fe', wc: 59, bc: 60 });
    assert.deepEqual(running(node), ['black']);
  });

  test('a chess-shaped message leaves a Go board alone', () => {
    const node = miniGame('9/9/9/9/4b4/9/9/9/9,white,ee,1');
    initMiniGame(node);
    updateMiniGame(node, { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w', lm: 'e2e4' });
    assert.equal(stones(node), 1);
  });

  test('anything that is not a board draws nothing', () => {
    const node = miniGame('<img src=x onerror=alert(1)>,black,,0');
    initMiniGame(node);
    assert.equal(node.querySelector('.go-mini')!.childNodes.length, 0);
  });

  test('a static mini board (profile game rows) is drawn from its data-state', () => {
    const board = document.createElement('span');
    board.className = 'go-mini go-mini--init';
    board.setAttribute('data-state', '9/9/9/9/4b4/9/9/9/9,white,ee,1');
    document.body.appendChild(board);
    initMiniBoards();
    assert.equal(stones(board), 1);
    assert.ok(!board.classList.contains('go-mini--init'));
  });
});
