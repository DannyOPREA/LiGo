import { Chessground as makeChessground } from '@lichess-org/chessground';
import { COLORS } from 'chessops';
import { charToRole } from 'chessops/util';

import { defined } from 'lib';
import { throttle } from 'lib/async';
import { renderChat } from 'lib/chat/renderChat';
import { isTouchDevice } from 'lib/device';
import { renderEval } from 'lib/eval';
import { type Player, plyOpponentColor } from 'lib/game';
import { plyToTurn } from 'lib/game/chess';
import {
  renderSan,
  renderPieces,
  renderBoard,
  renderMainline,
  renderComments,
  boardCommandsHandler,
  selectionHandler,
  arrowKeyHandler,
  positionJumpHandler,
  pieceJumpingHandler,
  castlingFlavours,
  inputToMove,
  lastCapturedCommandHandler,
  type DropMove,
  possibleMovesHandler,
  renderPockets,
  pocketsStr,
  leaveSquareHandler,
} from 'lib/nvui/chess';
import { commands, boardCommands, addBreaks } from 'lib/nvui/command';
import { scanDirectionsHandler } from 'lib/nvui/directionScan';
import { liveText } from 'lib/nvui/notify';
import { renderAdvancedSettings } from 'lib/nvui/renderAdvancedSettings';
import { ops, path as treePath } from 'lib/tree/tree';
import { type VNode, type LooseVNodes, type VNodeChildren, hl, bind, noTrans, onInsert } from 'lib/view';
import { profileUrl } from 'lib/view/userLink';

import type { AnalyseNvuiContext } from '../analyse.nvui';
import type AnalyseCtrl from '../ctrl';
import { makeConfig as makeCgConfig } from '../ground';
import type { AnalyseData } from '../interfaces';
import { currentLineIndex, renderCurrentNode } from '../nvuiUtil';
import renderClocks from '../view/clocks';
import { renderResult } from '../view/components';

const throttled = (sound: string) => throttle(100, () => site.sound.play(sound));
const selectSound = throttled('select');
const borderSound = throttled('outOfBound');
const errorSound = throttled('error');

export function initNvui(ctx: AnalyseNvuiContext): void {
  const { ctrl, notify } = ctx;
  site.mousetrap.unbind('c');
  site.mousetrap.bind('c', () => notify.set(renderEvalAndDepth(ctrl)));
}

export function renderNvui(ctx: AnalyseNvuiContext): VNode {
  const { ctrl, notify, moveStyle, pieceStyle, prefixStyle, positionStyle, boardStyle, pageStyle } = ctx;
  const d = ctrl.data,
    style = moveStyle.get(),
    clocks = renderClocks(ctrl, ctrl.path),
    pockets = ctrl.node.crazy?.pockets,
    acpl = renderAcpl(ctx);
  ctrl.chessground = makeChessground(document.createElement('div'), {
    ...makeCgConfig(ctrl),
    animation: { enabled: false },
    drawable: { enabled: false },
    coordinates: false,
  });
  const boardFirst = isTouchDevice() && pageStyle.get() === 'board-actions';

  if (boardFirst) {
    pieceStyle.set('name');
    prefixStyle.set('name');
    boardStyle.set('plain');
  }

  const boardView = [
    hl('h2', i18n.site.board),
    hl(
      'div.board',
      { hook: onInsert(el => boardEventsHook(ctx, el)) },
      renderBoard(
        ctrl.chessground.state.pieces,
        ctrl.data.game.variant.key === 'racingKings' ? 'white' : ctrl.bottomColor(),
        pieceStyle.get(),
        prefixStyle.get(),
        positionStyle.get(),
        boardStyle.get(),
      ),
    ),
  ];

  return hl('main.analyse', [
    hl('div.nvui', [
      ...(boardFirst ? boardView : []),
      boardFirst && renderTouchDeviceCommands(ctx),
      hl('h2', i18n.nvui.gameInfo),
      ...COLORS.map(color => hl('p', [`${i18n.site[color]}: `, renderPlayer(ctrl, playerByColor(d, color))])),
      hl('p', `${i18n.site[d.game.rated ? 'rated' : 'casual']} ${d.game.perf || d.game.variant.name}`),
      d.clock ? hl('p', `Clock: ${d.clock.initial / 60} + ${d.clock.increment}`) : null,
      hl('h2', i18n.nvui.moveList),
      hl('p.moves', { attrs: { role: 'log', 'aria-live': 'off' } }, renderCurrentLine(ctx)),
      hl('h2', i18n.nvui.pieces),
      renderPieces(ctrl.chessground.state.pieces, style, ctrl.bottomColor()),
      pockets && hl('h2', i18n.nvui.pockets),
      pockets && renderPockets(pockets),
      renderAriaResult(ctrl),
      hl('h2', i18n.nvui.lastMove),
      liveText(renderCurrentNode(ctx), 'polite', 'p.position.lastMove'),
      clocks &&
        hl('div.clocks', [
          hl('h2', i18n.site.clock),
          hl('div.clocks', [hl('div.topc', clocks[0]), hl('div.botc', clocks[1])]),
        ]),
      hl('h2', i18n.nvui.inputForm),
      hl(
        'form#move-form',
        {
          hook: onInsert<HTMLFormElement>(el => {
            const $form = $(el);
            const $input = $form.find('.move').val('');
            $form.on('submit', onSubmit(ctx, $input));
          }),
        },
        [
          hl('label', [
            i18n.nvui.inputForm,
            hl('input.move.mousetrap', {
              attrs: { name: 'move', type: 'text', autocomplete: 'off' },
            }),
          ]),
        ],
      ),
      notify.render(),
      // (unit 3.5) no local engine and no analysis request: only a stored analysis is listed
      acpl && [hl('h2', i18n.site.computerAnalysis), acpl],
      ...(boardFirst ? [] : boardView),
      hl('div.boardstatus', { attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } }, ''),
      hl('div.content', {
        hook: onInsert(elem => {
          const $root = $(elem);
          $root.append($('.blind-content').removeClass('none'));
          $root.find('.copy-pgn').on('click', function (this: HTMLElement) {
            navigator.clipboard.writeText(this.dataset.pgn!).then(() => {
              notify.set(i18n.nvui.copiedToClipboard('PGN'));
            });
          });
          $root.find('.copy-fen').on('click', function (this: HTMLElement) {
            const fen = document.querySelector<HTMLInputElement>('.analyse__underboard__fen input')?.value;
            if (fen) {
              navigator.clipboard.writeText(fen).then(() => {
                notify.set(i18n.nvui.copiedToClipboard('FEN'));
              });
            }
          });
        }),
      }),
      ...renderAdvancedSettings(moveStyle, pageStyle, pieceStyle, prefixStyle, positionStyle, boardStyle, {
        redraw: ctrl.redraw,
      }),
      hl('h2', i18n.site.keyboardShortcuts),
      hl(
        'p',
        [
          'Use arrow keys to navigate in the game.',
          `z: ${i18n.site.toggleAllAnalysis}`,
          'c: announce computer evaluation',
        ].reduce(addBreaks, []),
      ),
      boardCommands(),
      hl('h2', i18n.nvui.inputFormCommandList),
      hl(
        'p',
        [
          'Type these commands in the command input.',
          ...inputCommands
            .filter(c => !c.invalid?.(ctrl))
            .flatMap(command => [noTrans(`${command.cmd}: `), command.help]),
        ].reduce<VNodeChildren[]>(
          (acc, curr, i) => (i % 2 !== 0 ? addBreaks(acc, curr) : acc.concat(curr)),
          [],
        ),
      ),
      hl('h2', 'Chat'),
      ctrl.chatCtrl && renderChat(ctrl.chatCtrl),
    ]),
  ]);
}

function renderTouchDeviceCommands(ctx: AnalyseNvuiContext): LooseVNodes {
  const { notify, ctrl } = ctx;
  return [
    hl('div.actions', [
      hl('button', { hook: bind('click', ctrl.navigate.prev) }, 'previous move'),
      hl('button', { hook: bind('click', ctrl.navigate.next) }, 'next move'),
      hl('button', { hook: bind('click', () => notify.set(renderEvalAndDepth(ctrl))) }, 'evaluation'),
      hl(
        'button',
        {
          hook: bind('click', () => {
            notify.set(`${$('.nvui .botc').text()} - ${$('.nvui .topc').text()}`);
          }),
        },
        'clocks',
      ),
      hl('button', { hook: bind('click', ctrl.navigate.first) }, 'first move'),
      hl('button', { hook: bind('click', ctrl.navigate.last) }, 'last move'),
    ]),
  ];
}

function boardEventsHook(
  { ctrl, pieceStyle, prefixStyle, moveStyle, notify }: AnalyseNvuiContext,
  el: HTMLElement,
): void {
  const $board = $(el);
  const $buttons = $board.find('button');
  const steps = () => ctrl.tree.getNodeList(ctrl.path);
  const fenSteps = () => steps().map(step => step.fen);
  $buttons.on('blur', leaveSquareHandler($buttons));
  $buttons.on(
    'click',
    selectionHandler(() => plyOpponentColor(ctrl.node.ply)),
  );
  $buttons.on('keydown', (e: KeyboardEvent) => {
    if (e.shiftKey && e.key.match(/^[ad]$/i)) jumpMoveOrLine(ctrl)(e);
    else if (/^x$/i.test(e.key))
      scanDirectionsHandler(ctrl.bottomColor(), ctrl.chessground.state.pieces, moveStyle.get())(e);
    else if (['o', 'l', 't'].includes(e.key)) boardCommandsHandler()(e);
    else if (e.key.startsWith('Arrow')) arrowKeyHandler(ctrl.bottomColor(), borderSound)(e);
    else if (e.key === 'c') lastCapturedCommandHandler(fenSteps, pieceStyle.get(), prefixStyle.get())();
    else if (e.key === 'i') {
      e.preventDefault();
      document.querySelector<HTMLElement>('input.move')?.focus();
    } else if (e.key === 'f') {
      if (ctrl.data.game.variant.key !== 'racingKings') {
        notify.set('Flipping the board');
        setTimeout(() => ctrl.flip(), 1000);
      }
    } else if (/^Digit([1-8])$/.test(e.code)) positionJumpHandler()(e);
    else if (/^[kqrbnp]$/i.test(e.key)) pieceJumpingHandler(selectSound, errorSound)(e);
    else if (e.key.toLowerCase() === 'm')
      possibleMovesHandler(ctrl.turnColor(), ctrl.chessground, ctrl.data.game.variant.key, ctrl.nodeList)(e);
    else if (e.key.toLowerCase() === 'v') notify.set(renderEvalAndDepth(ctrl));
  });
}

function renderEvalAndDepth(ctrl: AnalyseCtrl): string {
  return (ctrl.allowedEval() && evalInfo(ctrl.node.eval)) || 'no stored evaluation';
}

const evalInfo = (bestEv: EvalScore | undefined): string =>
  defined(bestEv?.cp)
    ? renderEval(bestEv.cp).replace('-', '−')
    : defined(bestEv?.mate)
      ? `mate in ${Math.abs(bestEv.mate)} for ${bestEv.mate > 0 ? 'white' : 'black'}`
      : '';

function renderAriaResult(ctrl: AnalyseCtrl): VNode[] {
  const result = renderResult(ctrl);
  const res = result.length ? result : i18n.site.none;
  return [
    hl('h2', i18n.nvui.gameStatus),
    hl('div', { attrs: { role: 'status', 'aria-live': 'assertive', 'aria-atomic': 'true' } }, res),
  ];
}

function renderCurrentLine({ ctrl, moveStyle }: AnalyseNvuiContext) {
  if (ctrl.path.length === 0) return renderMainline(ctrl.mainline, ctrl.path, moveStyle.get(), true);
  else {
    const futureNodes = ctrl.node.children.length > 0 ? ops.mainlineNodeList(ctrl.node.children[0]) : [];
    return renderMainline(ctrl.nodeList.concat(futureNodes), ctrl.path, moveStyle.get(), true);
  }
}

function onSubmit(ctx: AnalyseNvuiContext, $input: Cash) {
  const { ctrl, notify } = ctx;
  return (e: SubmitEvent) => {
    e.preventDefault();
    const input = castlingFlavours(($input.val() as string).trim());
    // Allow commands with/without a leading '/'
    const command = getCommand(input) || getCommand(input.slice(1));
    if (command && !command.invalid?.(ctrl)) command.cb(ctx, input);
    else {
      const move = inputToMove(input, ctrl.node.fen, ctrl.chessground);
      const isDrop = (u?: string | DropMove) => !!(u && typeof u !== 'string');
      const isInvalidDrop = (d: DropMove) =>
        !ctrl.crazyValid(d.role, d.key) || ctrl.chessground.state.pieces.has(d.key);
      const isInvalidCrazy = isDrop(move) && isInvalidDrop(move);

      if (!move || isInvalidCrazy) notify.set(`Invalid move: ${input}`);
      else sendMove(move, ctrl);
    }
    $input.val('');
  };
}

type Command = 'b' | 'p' | 's' | 'eval' | 'prev' | 'next' | 'prev line' | 'next line' | 'pocket';
type InputCommand = {
  cmd: Command;
  help: VNode | string;
  cb: (ctrl: AnalyseNvuiContext, input: string) => void;
  invalid?: (ctrl: AnalyseCtrl) => boolean;
};

const inputCommands: InputCommand[] = [
  {
    cmd: 'b',
    help: commands().board.help,
    cb: ({ ctrl, notify, moveStyle }, input) =>
      notify.set(commands().board.apply(input, ctrl.chessground.state.pieces, moveStyle.get()) || ''),
  },
  {
    cmd: 'p',
    help: commands().piece.help,
    cb: ({ ctrl, notify, moveStyle }, input) =>
      notify.set(
        commands().piece.apply(input, ctrl.chessground.state.pieces, moveStyle.get()) ||
          `Bad input: ${input}. Exptected format: ${commands().piece.help}`,
      ),
  },
  {
    cmd: 's',
    help: commands().scan.help,
    cb: ({ ctrl, notify, moveStyle }, input) =>
      notify.set(
        commands().scan.apply(input, ctrl.chessground.state.pieces, moveStyle.get()) ||
          `Bad input: ${input}. Exptected format: ${commands().scan.help}`,
      ),
  },
  {
    cmd: 'eval',
    help: noTrans("announce last move's computer evaluation"),
    cb: ({ ctrl, notify }) => notify.set(renderEvalAndDepth(ctrl)),
  },
  {
    cmd: 'prev',
    help: noTrans('return to the previous move'),
    cb: ({ ctrl }) => doAndRedraw(ctrl, ctrl.navigate.prev),
  },
  {
    cmd: 'next',
    help: noTrans('go to the next move'),
    cb: ({ ctrl }) => doAndRedraw(ctrl, ctrl.navigate.next),
  },
  {
    cmd: 'prev line',
    help: noTrans('switch to the previous variation'),
    cb: ({ ctrl }) => doAndRedraw(ctrl, jumpPrevLine),
  },
  {
    cmd: 'next line',
    help: noTrans('switch to the next variation'),
    cb: ({ ctrl }) => doAndRedraw(ctrl, jumpNextLine),
  },
  {
    cmd: 'pocket',
    help: noTrans('Read out pockets for white or black. Example: "pocket black"'),
    cb: ({ ctrl, notify }, input) => {
      const pockets = ctrl.node.crazy?.pockets;
      const color = input.split(' ')?.[1]?.trim();
      return notify.set(
        pockets
          ? color
            ? pocketsStr(color === 'white' ? pockets[0] : pockets[1]) || i18n.site.none
            : 'Expected format: pocket [white|black]'
          : 'Command only available in crazyhouse',
      );
    },
    invalid: ctrl => ctrl.data.game.variant.key !== 'crazyhouse',
  },
];

const getCommand = (input: string) => {
  const split = input.split(' ');
  const firstWordLowerCase = split[0].toLowerCase();
  return (
    inputCommands.find(c => c.cmd === input.toLowerCase()) ||
    inputCommands.find(c => split.length !== 1 && c.cmd === firstWordLowerCase)
  ); // 'next line' should not be interpreted as 'next'
};

function sendMove(uciOrDrop: string | DropMove, ctrl: AnalyseCtrl) {
  if (typeof uciOrDrop === 'string')
    ctrl.sendMove(
      uciOrDrop.slice(0, 2) as Key,
      uciOrDrop.slice(2, 4) as Key,
      undefined,
      charToRole(uciOrDrop.slice(4)),
    );
  else if (ctrl.crazyValid(uciOrDrop.role, uciOrDrop.key)) ctrl.sendNewPiece(uciOrDrop.role, uciOrDrop.key);
}

const analysisGlyphs = new Set(['?!', '?', '??']);

function renderAcpl({ ctrl, moveStyle }: AnalyseNvuiContext): LooseVNodes {
  const analysis = ctrl.data.analysis;
  if (!analysis) return undefined;
  const analysisNodes = ctrl.mainline.filter(n => n.glyphs?.find(g => analysisGlyphs.has(g.symbol)));
  const res: Array<VNode> = [];
  COLORS.forEach(color => {
    res.push(
      hl('h3', `${color} player: ${analysis[color].acpl} ${i18n.site.averageCentipawnLoss}`),
      hl(
        'select',
        {
          hook: bind(
            'change',
            e => ctrl.jumpToMain(parseInt((e.target as HTMLSelectElement).value)),
            ctrl.redraw,
          ),
        },
        analysisNodes
          .filter(n => (n.ply % 2 === 1) === (color === 'white'))
          .map(node =>
            hl(
              'option',
              { attrs: { value: node.ply, selected: node.ply === ctrl.node.ply } },
              [
                plyToTurn(node.ply),
                renderSan(node.san, node.uci, moveStyle.get()),
                renderComments(node, moveStyle.get()),
              ].join(' '),
            ),
          ),
      ),
    );
  });
  return res;
}

const renderPlayer = (ctrl: AnalyseCtrl, player: Player): LooseVNodes => userHtml(ctrl, player);

function userHtml(_ctrl: AnalyseCtrl, player: Player) {
  const user = player.user,
    perf = user ? user.perfs[_ctrl.data.game.perf] : null,
    rating = player.rating ?? perf?.rating,
    rd = player.ratingDiff,
    ratingDiff = rd ? (rd > 0 ? '+' + rd : rd < 0 ? '−' + -rd : '') : '';
  return user
    ? hl('span', [
        hl(
          'a',
          { attrs: { href: profileUrl(user.username) } },
          user.title ? `${user.title} ${user.username}` : user.username,
        ),
        rating ? ` ${rating}` : ``,
        ' ' + ratingDiff,
      ])
    : hl('span', i18n.site.anonymous);
}

const playerByColor = (d: AnalyseData, color: Color): Player =>
  color === d.player.color ? d.player : d.opponent;

const jumpNextLine = (ctrl: AnalyseCtrl) => jumpLine(ctrl, 1);
const jumpPrevLine = (ctrl: AnalyseCtrl) => jumpLine(ctrl, -1);

function jumpLine(ctrl: AnalyseCtrl, delta: number) {
  const { i, of } = currentLineIndex(ctrl);
  if (of === 1) return;
  const newI = (i + delta + of) % of;
  const prevPath = treePath.init(ctrl.path);
  const prevNode = ctrl.tree.nodeAtPath(prevPath);
  const newPath = prevPath + prevNode.children[newI].id;
  ctrl.userJumpIfCan(newPath);
}

const doAndRedraw = (ctrl: AnalyseCtrl, fn: (ctrl: AnalyseCtrl) => void): void => {
  fn(ctrl);
  ctrl.redraw();
};

function jumpMoveOrLine(ctrl: AnalyseCtrl) {
  return (e: KeyboardEvent) => {
    if (e.key === 'A') doAndRedraw(ctrl, e.altKey ? jumpPrevLine : ctrl.navigate.prev);
    else if (e.key === 'D') doAndRedraw(ctrl, e.altKey ? jumpNextLine : ctrl.navigate.next);
  };
}
