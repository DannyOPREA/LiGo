import { parseFen } from 'chessops/fen';
import { h } from 'snabbdom';

import { defined } from 'lib';
import { renderEval as normalizeEval } from 'lib/ceval';
import { dispatchChessgroundResize } from 'lib/chessgroundResize';
import { isMobile } from 'lib/device';
import { playable } from 'lib/game';
import { fixCrazySan, plyToTurn } from 'lib/game/chess';
import statusView from 'lib/game/view/status';
import { licon } from 'lib/licon';
import * as Prefs from 'lib/prefs';
import { storage } from 'lib/storage';
import type { ClientEval, Glyph, ServerEval, TreeNode } from 'lib/tree/types';
import {
  type VNode,
  type LooseVNodes,
  bind,
  bindNonPassive,
  onInsert,
  dataIcon,
  hl,
  spinnerVdom as spinner,
} from 'lib/view';
import stepwiseScroll from 'lib/view/stepwiseScroll';

import type AnalyseCtrl from '../ctrl';
import * as chessground from '../ground';
import type { ConcealOf } from '../interfaces';
import * as pgnExport from '../pgnExport';
import { renderPgnError } from '../pgnImport';
import serverSideUnderboard from '../serverSideUnderboard';
import renderClocks from './clocks';
import { renderMaterialDiffs } from './materialDiffs';

export interface ViewContext {
  ctrl: AnalyseCtrl;
  concealOf?: ConcealOf;
  showCevalPvs: boolean;
  playerBars?: VNode[];
  playerStrips?: [VNode, VNode];
  gaugeOn: boolean;
  needsInnerCoords: boolean;
}

export function viewContext(ctrl: AnalyseCtrl): ViewContext {
  const playerBars = undefined;
  return {
    ctrl,
    concealOf: makeConcealOf(ctrl),
    showCevalPvs: !ctrl.retro?.isSolving() && !ctrl.practice,
    playerBars,
    playerStrips: playerBars ? undefined : renderPlayerStrips(ctrl),
    gaugeOn: ctrl.showEvalGauge(),
    needsInnerCoords: ctrl.showEvalGauge() || !!playerBars,
  };
}

export function renderMain(
  { ctrl, playerBars, gaugeOn, needsInnerCoords }: ViewContext,
  ...kids: LooseVNodes[]
): VNode {
  return hl(
    'main.analyse.variant-' + ctrl.data.game.variant.key,
    {
      attrs: {
        'data-active-tool': ctrl.activeControlBarTool(),
        'data-active-mode': ctrl.activeControlMode(),
      },
      hook: {
        insert: () => {
          forceInnerCoords(ctrl, needsInnerCoords);
          if (!!playerBars !== document.body.classList.contains('header-margin'))
            $('body').toggleClass('header-margin', !!playerBars);
        },
        update(_, _2) {
          forceInnerCoords(ctrl, needsInnerCoords);
        },
        postpatch(old, vnode) {
          if (old.data!.gaugeOn !== gaugeOn) dispatchChessgroundResize();
          vnode.data!.gaugeOn = gaugeOn;
        },
      },
      class: {
        'comp-off': !ctrl.settings.showStaticAnalysis,
        'gauge-on': gaugeOn,
        'has-players': !!playerBars,
        'analyse-hunter': ctrl.opts.hunter,
        'analyse--wiki': !!ctrl.wiki,
      },
    },
    kids,
  );
}

export const renderBoard = ({ ctrl, playerBars, playerStrips }: ViewContext): VNode =>
  hl(
    'div.analyse__board.main-board',
    {
      hook:
        'ontouchstart' in window || !storage.boolean('scrollMoves').getOrDefault(true)
          ? undefined
          : bindNonPassive(
              'wheel',
              stepwiseScroll(
                e => {
                  if (e.deltaY > 0) ctrl.navigate.next();
                  else if (e.deltaY < 0) ctrl.navigate.prev();
                  ctrl.redraw();
                },
                e =>
                  !!ctrl.gamebookPlay() ||
                  !['PIECE', 'SQUARE', 'CG-BOARD'].includes((e.target as HTMLElement).tagName),
              ),
            ),
    },
    [
      playerStrips,
      playerBars?.[ctrl.bottomIsWhite() ? 1 : 0],
      chessground.render(ctrl),
      playerBars?.[ctrl.bottomIsWhite() ? 0 : 1],
      ctrl.promotion.view(ctrl.data.game.variant.key === 'antichess'),
    ],
  );

export const renderUnderboard = ({ ctrl }: ViewContext): VNode =>
  hl(
    'div.analyse__underboard',
    {
      hook:
        ctrl.synthetic || playable(ctrl.data) ? undefined : onInsert(elm => serverSideUnderboard(elm, ctrl)),
    },
    [renderInputs(ctrl)],
  );

export function renderInputs(ctrl: AnalyseCtrl): VNode | undefined {
  if (ctrl.ongoing || !ctrl.data.userAnalysis) return undefined;
  if (ctrl.redirecting) return spinner();
  return hl('div.copyables', [
    hl('div.pair', [
      hl('label.name', 'FEN'),
      hl('input.copyable', {
        attrs: { spellcheck: 'false', enterkeyhint: 'done' },
        hook: {
          ...onInsert<HTMLInputElement>(el => {
            el.value = defined(ctrl.fenInput) ? ctrl.fenInput : ctrl.node.fen;
            el.addEventListener('change', () => {
              if (el.value !== ctrl.node.fen && el.reportValidity()) ctrl.changeFen(el.value.trim());
            });
            el.addEventListener('input', () => {
              ctrl.fenInput = el.value;
              el.setCustomValidity(parseFen(el.value.trim()).isOk ? '' : 'Invalid FEN');
            });
          }),
          postpatch: (_, vnode) => {
            const el = vnode.elm as HTMLInputElement;
            if (!defined(ctrl.fenInput)) {
              el.value = ctrl.node.fen;
              el.setCustomValidity('');
            } else if (el.value !== ctrl.fenInput) el.value = ctrl.fenInput;
          },
        },
      }),
    ]),
    hl('div.pgn', [
      hl('div.pair', [
        hl('label.name', 'PGN'),
        hl('textarea.copyable', {
          attrs: { spellcheck: 'false' },
          class: { 'is-error': !!ctrl.pgnError },
          hook: {
            ...onInsert<HTMLTextAreaElement>(el => {
              el.value = defined(ctrl.pgnInput) ? ctrl.pgnInput : pgnExport.renderFullTxt(ctrl);
              const changePgnIfDifferent = () =>
                el.value !== pgnExport.renderFullTxt(ctrl) && ctrl.changePgn(el.value, true);

              el.addEventListener('input', () => (ctrl.pgnInput = el.value));

              el.addEventListener('keypress', (e: KeyboardEvent) => {
                if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || isMobile())
                  return undefined;
                else if (changePgnIfDifferent()) e.preventDefault();
                return undefined;
              });
              if (isMobile()) el.addEventListener('focusout', changePgnIfDifferent);
            }),
            postpatch: (_, vnode) => {
              (vnode.elm as HTMLTextAreaElement).value = defined(ctrl.pgnInput)
                ? ctrl.pgnInput
                : pgnExport.renderFullTxt(ctrl);
            },
          },
        }),
        !isMobile() &&
          hl(
            'button.button.button-thin.bottom-item.bottom-action.text',
            {
              attrs: dataIcon(licon.PlayTriangle),
              hook: bind('click', _ => {
                const pgn = $('.copyables .pgn textarea').val() as string;
                if (pgn !== pgnExport.renderFullTxt(ctrl)) ctrl.changePgn(pgn, true);
              }),
            },
            i18n.site.importPgn,
          ),
        hl(
          'div.bottom-item.bottom-error',
          { attrs: dataIcon(licon.CautionTriangle), class: { 'is-error': !!ctrl.pgnError } },
          renderPgnError(ctrl.pgnError),
        ),
      ]),
    ]),
  ]);
}

export function renderResult(ctrl: AnalyseCtrl): VNode[] {
  const render = (result: string, status: string) => [hl('div.result', result), hl('div.status', status)];
  if (ctrl.data.game.status.id >= 30) {
    const winner = ctrl.data.game.winner;
    const result = winner === 'white' ? '1-0' : winner === 'black' ? '0-1' : '½-½';
    return render(result, statusView(ctrl.data));
  }
  return [];
}

export const renderIndexAndMove = (node: TreeNode, withEval: boolean, withGlyphs: boolean): VNode[] =>
  node.san ? [renderIndex(node.ply, true), ...renderMoveNodes(node, withEval, withGlyphs)] : [];

export const renderIndex = (ply: Ply, withDots: boolean): VNode =>
  h('index', plyToTurn(ply) + (withDots ? (ply % 2 === 1 ? '.' : '...') : ''));

export function renderMoveNodes(
  node: TreeNode,
  withEval: boolean,
  withGlyphs: boolean,
  ev?: ClientEval | ServerEval | false,
  glyphs?: Glyph[],
): VNode[] {
  ev ??= node.ceval ?? node.eval; // ev = false will override withEval
  const evalText = !ev
    ? ''
    : ev?.cp !== undefined
      ? normalizeEval(ev.cp)
      : ev?.mate !== undefined
        ? `#${ev.mate}`
        : '';
  const attrs = !withEval && ev ? { title: `${evalText} · ${evalInfo(ev)}` } : undefined;
  const nodes = [h('san', { attrs }, fixCrazySan(node.san!))];
  const relevantGlyphs = glyphs ?? node.glyphs;
  if (withGlyphs && relevantGlyphs)
    relevantGlyphs.forEach(g => nodes.push(h('glyph', { attrs: { title: g.name } }, g.symbol)));
  if (withEval && node.shapes?.length) nodes.push(h('shapes'));
  if (withEval && evalText && ev)
    nodes.push(h('eval', { attrs: { title: evalInfo(ev) } }, evalText.replace('-', '−')));
  return nodes;
}

function evalInfo(ev: ClientEval | ServerEval): string {
  if ('knodes' in ev) return `Server eval · About ${(ev.knodes * 1000).toLocaleString()} nodes searched`;
  if (!('nodes' in ev)) return 'Unknown strength';
  const prelude = ev.cloud ? 'Cloud eval' : 'Local eval';
  return `${prelude} · ${ev.nodes.toLocaleString()} nodes searched`;
}

function makeConcealOf(_ctrl: AnalyseCtrl): ConcealOf | undefined {
  return undefined;
}

let prevForceInnerCoords: boolean;
function forceInnerCoords({ data }: AnalyseCtrl, v: boolean) {
  if (data.pref.coords === Prefs.Coords.Outside) {
    if (prevForceInnerCoords !== v) {
      prevForceInnerCoords = v;
      $('body').toggleClass('coords-in', v).toggleClass('coords-out', !v);
    }
  }
}

function renderPlayerStrips(ctrl: AnalyseCtrl): [VNode, VNode] | undefined {
  const renderPlayerStrip = (cls: string, materialDiff: VNode, clock?: VNode): VNode =>
    hl('div.analyse__player_strip.' + cls, [materialDiff, clock]);

  const clocks = renderClocks(ctrl, ctrl.path),
    whitePov = ctrl.bottomIsWhite(),
    materialDiffs = renderMaterialDiffs(ctrl);

  return [
    renderPlayerStrip('top', materialDiffs[0], clocks?.[whitePov ? 1 : 0]),
    renderPlayerStrip('bottom', materialDiffs[1], clocks?.[whitePov ? 0 : 1]),
  ];
}
