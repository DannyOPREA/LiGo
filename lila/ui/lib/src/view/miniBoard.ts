// no side effects allowed due to re-export by index.ts

import { h, type VNode } from 'snabbdom';

import { COLORS } from '@/game/chess';
import { setClockWidget } from '@/game/clock/clockWidget';
import { pubsub } from '@/pubsub';
import { wsSend } from '@/socket';

import { renderGoMini } from './goMini';

export const initMiniBoards = (parent?: HTMLElement): void => {
  // LiGo (unit 3.19, mini-board slice): a Go game's static mini board, `data-state` as a mini game's
  Array.from((parent || document).getElementsByClassName('go-mini--init')).forEach(el => {
    el.classList.remove('go-mini--init');
    const [board, , lm] = el.getAttribute('data-state')!.split(',');
    renderGoMini(el, board, lm);
  });
};

export const renderClock = (color: Color, time: number): VNode =>
  h(`span.mini-game__clock.mini-game__clock--${color}`, {
    attrs: { 'data-time': time, 'data-managed': 1 },
  });

// LiGo (unit 3.19, mini-board slice): a Go game's mini game has a `.go-mini` board instead of a
// chessground, and its `data-state` is `board,color,lastMove,plies` (lila's GameUi.mini). Chess mini
// games went with chessground in 3.19 part 2.
const goMiniOf = (node: Element): HTMLElement | null => node.querySelector('.go-mini');

// A Go game's clocks start once each side has played (lila's `stepGoClock`), so a mini game counts the
// plies it has seen. lila-ws re-sends the last position when a page starts watching, which may be the one
// already shown: that repeat isn't a new ply.
const goPlies = new WeakMap<Element, { plies: number; board: string; lm: string }>();

const setGoClocks = (node: Element, turn: Color, plies: number, times?: { white?: number; black?: number }) =>
  COLORS.forEach(color => {
    const clockEl = node.querySelector('.mini-game__clock--' + color) as HTMLElement | null;
    const time = times ? times[color] : parseInt(clockEl?.getAttribute('data-time') ?? '');
    if (clockEl && time !== undefined && !isNaN(time))
      setClockWidget(clockEl, { time, pause: color !== turn || plies < 2 });
  });

const initGoMiniGame = (node: Element, board: HTMLElement): string | null => {
  const [position, turn, lm, plies] = node.getAttribute('data-state')!.split(',');
  node.classList.remove('mini-game--init');
  renderGoMini(board, position, lm);
  const seen = { plies: parseInt(plies) || 0, board: position, lm: lm ?? '' };
  goPlies.set(node, seen);
  setGoClocks(node, turn as Color, seen.plies);
  return node.getAttribute('data-live');
};

export const initMiniGame = (node: Element): string | null => {
  const goBoard = goMiniOf(node);
  return goBoard ? initGoMiniGame(node, goBoard) : null;
};

export const initMiniGames = (parent?: HTMLElement): void => {
  const nodes = Array.from((parent || document).getElementsByClassName('mini-game--init')),
    ids = nodes.map(x => initMiniGame(x)).filter(Boolean);
  if (ids.length) pubsub.after('socket.hasConnected').then(() => wsSend('startWatching', ids.join(' ')));
};

const updateGoMiniGame = (node: HTMLElement, board: HTMLElement, data: GoMiniGameUpdateData): void => {
  renderGoMini(board, data.board, data.lm);
  const before = goPlies.get(node) ?? { plies: 0, board: '', lm: '' };
  const repeat = before.board === data.board && before.lm === data.lm;
  const seen = { plies: before.plies + (repeat ? 0 : 1), board: data.board, lm: data.lm };
  goPlies.set(node, seen);
  setGoClocks(node, data.turn, seen.plies, { white: data.wc, black: data.bc });
};

export const updateMiniGame = (node: HTMLElement, data: GoMiniGameUpdateData): void => {
  const goBoard = goMiniOf(node);
  // a Go board only takes Go positions, whatever else reaches it
  if (goBoard && typeof data.board === 'string') updateGoMiniGame(node, goBoard, data);
};

export const finishMiniGame = (node: HTMLElement, win?: 'b' | 'w'): void =>
  COLORS.forEach(color => {
    const clock: HTMLElement | null = node.querySelector('.mini-game__clock--' + color);
    // don't interfere with snabbdom clocks
    if (clock && !clock.dataset['managed'])
      $(clock).replaceWith(
        `<span class="mini-game__result">${win ? (win === color[0] ? 1 : 0) : '½'}</span>`,
      );
  });

// lila-ws's `fen` message for a Go game (ADR 0019 §6): the compact board, the player to move, and the
// last move as an SGF point or `pass`.
interface GoMiniGameUpdateData {
  board: string;
  turn: Color;
  lm: string;
  wc?: number;
  bc?: number;
}
