import { blurIfPrimaryClick, repeater } from 'lib';
import { throttle } from 'lib/async';
import { displayColumns } from 'lib/device';
import { finished, aborted, userAnalysable, playable } from 'lib/game';
import { game as gameRoute } from 'lib/game/router';
import { licon, type LiconKey } from 'lib/licon';
import { addPointerListeners } from 'lib/pointer';
import {
  toggleButton as boardMenuToggleButton,
  type VNode,
  type LooseVNodes,
  type LooseVNode,
  hl,
  onInsert,
  dataIcon,
} from 'lib/view';

import type RoundController from '../ctrl';
import { resultText } from '../go';
import type { Step } from '../interfaces';
import * as util from '../util';
import boardMenu from './boardMenu';

const scrollMax = 99999,
  moveTag = 'Z7yx',
  indexTag = 'qZM',
  movesTag = 'aPp',
  rmovesTag = 'i5d',
  rbuttonsTag = 'bo3';

const autoScroll = throttle(100, (movesEl: HTMLElement, ctrl: RoundController) =>
  window.requestAnimationFrame(() => {
    if (ctrl.data.steps.length < 7 && !finished(ctrl.data)) return;
    let st: number | undefined;
    if (ctrl.ply < 3) st = 0;
    else if (ctrl.ply === util.lastPly(ctrl.data)) st = scrollMax;
    else {
      const plyEl = movesEl.querySelector<HTMLElement>('.a1t');
      if (plyEl)
        st =
          displayColumns() === 1
            ? plyEl.offsetLeft - movesEl.offsetWidth / 2 + plyEl.offsetWidth / 2
            : plyEl.offsetTop - movesEl.offsetHeight / 2 + plyEl.offsetHeight / 2;
    }
    if (typeof st === 'number') {
      if (st === scrollMax) movesEl.scrollLeft = movesEl.scrollTop = st;
      else if (displayColumns() === 1) movesEl.scrollLeft = st;
      else movesEl.scrollTop = st;
    }
  }),
);

const moverOf = (step: Step): Color => (step.ply % 2 === 0 ? 'black' : 'white');

const renderMove = (step: Step | undefined, curPly: number) =>
  step
    ? hl(moveTag, { class: { a1t: step.ply === curPly }, attrs: { 'data-ply': step.ply } }, step.san)
    : hl(moveTag, '…');

export function renderResult(ctrl: RoundController): VNode | undefined {
  const result = finished(ctrl.data) ? resultText(ctrl.data.game.status, ctrl.data.game.winner) : undefined;
  if (result || aborted(ctrl.data)) {
    return hl('div.result-wrap', [
      hl('p.result', result || ''),
      hl(
        'p.status',
        {
          hook: onInsert(() => {
            if (ctrl.autoScroll) ctrl.autoScroll();
            else setTimeout(() => ctrl.autoScroll(), 200);
          }),
        },
        ctrl.statusText(),
      ),
    ]);
  }
  return undefined;
}

/**
 * The moves in rows of two, Black's then White's, each row led by the number of its first move (Go
 * numbers every move). A game where White moves first (handicap) starts with an empty Black cell.
 */
function renderMoves(ctrl: RoundController): LooseVNodes {
  const steps = ctrl.data.steps.slice(1),
    firstPly = util.firstPly(ctrl.data);
  const rows: Array<[Step | undefined, Step | undefined]> = [];
  let i = 0;
  if (steps.length && moverOf(steps[0]) === 'white') {
    rows.push([undefined, steps[0]]);
    i = 1;
  }
  for (; i < steps.length; i += 2) rows.push([steps[i], steps[i + 1]]);

  const els: LooseVNodes = [];
  for (const [b, w] of rows) {
    const first = (b ?? w)!;
    els.push(hl(indexTag, first.ply - firstPly), renderMove(b, ctrl.ply), w ? renderMove(w, ctrl.ply) : null);
  }
  els.push(renderResult(ctrl));

  return els;
}

export function analysisButton(ctrl: RoundController): LooseVNode {
  const forecastCount = ctrl.data.forecastCount;
  return (
    userAnalysable(ctrl.data) &&
    hl(
      'a.fbt.analysis',
      {
        class: { text: !!forecastCount },
        attrs: {
          title: i18n.site.analysis,
          href: gameRoute(ctrl.data, ctrl.data.player.color) + '/analysis#' + ctrl.ply,
          'data-icon': licon.Microscope,
        },
      },
      !!forecastCount && String(forecastCount),
    )
  );
}

const goThroughMoves = (ctrl: RoundController, e: Event) => {
  const targetPly = () => parseInt((e.target as HTMLElement).getAttribute('data-ply') || '');
  repeater(
    () => {
      const ply = targetPly();
      if (!isNaN(ply)) ctrl.userJump(ply);
      ctrl.redraw();
    },
    () => isNaN(targetPly()),
  );
};

function renderButtons(ctrl: RoundController) {
  const firstPly = util.firstPly(ctrl.data),
    lastPly = util.lastPly(ctrl.data);
  return hl(rbuttonsTag, [
    analysisButton(ctrl) || hl('div.noop'),
    [
      ['JumpFirst', firstPly],
      ['JumpPrev', ctrl.ply - 1],
      ['JumpNext', ctrl.ply + 1],
      ['JumpLast', lastPly],
    ].map((b: [LiconKey, number], i) => {
      const enabled = ctrl.ply !== b[1] && b[1] >= firstPly && b[1] <= lastPly;
      return hl('button.fbt.repeatable', {
        class: { glowing: i === 3 && ctrl.isLate() },
        attrs: { disabled: !enabled, 'data-icon': licon[b[0]], 'data-ply': enabled ? b[1] : '-' },
        hook: onInsert(el =>
          addPointerListeners(el, {
            click: e => {
              goThroughMoves(ctrl, e);
              blurIfPrimaryClick(e);
            },
            hold: 'click',
          }),
        ),
      });
    }),
    boardMenuToggleButton(ctrl.menu, i18n.site.menu),
  ]);
}

function initMessage(ctrl: RoundController) {
  const d = ctrl.data;
  const go = d.game.go;
  return (
    (ctrl.replayEnabledByPref() || displayColumns() > 1) &&
    playable(d) &&
    ctrl.data.steps.length === 1 &&
    !d.player.spectator &&
    hl('div.message', { attrs: dataIcon(licon.InfoCircle) }, [
      hl('div', [
        `You play ${d.player.color === 'black' ? 'Black' : 'White'}.`,
        hl('br'),
        `${go.size}×${go.size}, ${go.rules === 'japanese' ? 'Japanese' : 'Chinese'} rules, komi ${go.komi}.`,
        d.game.player === d.player.color && [hl('br'), hl('strong', i18n.site.itsYourTurn)],
      ]),
    ])
  );
}

const col1Button = (ctrl: RoundController, dir: number, icon: string, disabled: boolean) =>
  hl('button.fbt', {
    attrs: { disabled, 'data-icon': icon, 'data-ply': ctrl.ply + dir },
    hook: onInsert(el => addPointerListeners(el, { click: e => goThroughMoves(ctrl, e), hold: 'click' })),
  });

export function render(ctrl: RoundController): LooseVNode {
  const d = ctrl.data,
    moves =
      ctrl.replayEnabledByPref() &&
      hl(
        movesTag,
        {
          hook: onInsert(el => {
            el.addEventListener('mousedown', e => {
              const ply = (e.target as HTMLElement).getAttribute('data-ply');
              if (ply === null) return;
              ctrl.userJump(parseInt(ply));
              ctrl.redraw();
            });
            ctrl.autoScroll = () => autoScroll(el, ctrl);
            if (ctrl.ply > 2) {
              ctrl.autoScroll();
              if (displayColumns() === 1) ctrl.autoScroll();
              /* On a phone, the first `autoScroll()` sometimes doesn't fully show the current move. It's possible this
               is due to some needed data not loading in time. The second `autoScroll()` fixes the issue, since the throttle
               ensures a min wait of 100ms. */
            }
          }),
        },
        renderMoves(ctrl),
      );
  const renderMovesOrResult = moves ? moves : renderResult(ctrl);
  return hl(rmovesTag, [
    renderButtons(ctrl),
    boardMenu(ctrl),
    initMessage(ctrl) ||
      (displayColumns() === 1
        ? hl('div.col1-moves', [
            col1Button(ctrl, -1, licon.JumpPrev, ctrl.ply === util.firstPly(d)),
            renderMovesOrResult,
            col1Button(ctrl, 1, licon.JumpNext, ctrl.ply === util.lastPly(d)),
          ])
        : renderMovesOrResult),
  ]);
}
