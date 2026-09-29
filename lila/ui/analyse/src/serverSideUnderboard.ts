import type { ChartGame, AcplChart } from 'chart';

import { escapeHtml } from 'lib';
import { licon } from 'lib/licon';
import { pubsub } from 'lib/pubsub';
import { storage } from 'lib/storage';
import { domDialog } from 'lib/view';
import { url as xhrUrl } from 'lib/xhr';

import type AnalyseCtrl from './ctrl';
import { baseUrl } from './view/util';

export default function (element: HTMLElement, ctrl: AnalyseCtrl) {
  $(element).replaceWith(ctrl.opts.$underboard);
  const data = ctrl.data,
    $panels = $('.analyse__underboard__panels > div'),
    $menu = $('.analyse__underboard__menu'),
    inputFen = document.querySelector<HTMLInputElement>('.analyse__underboard__fen input'),
    positionGifLink = document.querySelector<HTMLAnchorElement>('.position-gif a');
  let lastInputHash: string;
  let advChart: AcplChart;
  let timeChartLoaded = false;

  const updateGifLinks = (fen: FEN) => {
    const ds = document.body.dataset;
    if (positionGifLink)
      positionGifLink.href = xhrUrl(ds.assetUrl + '/export/fen.gif', {
        fen,
        color: ctrl.bottomColor(),
        lastMove: ctrl.node.uci,
        variant: ctrl.data.game.variant.key,
        theme: ds.board,
        piece: ds.pieceSet,
      });
  };

  const onFenChange = (fen: FEN) => {
    const nextInputHash = `${fen}${ctrl.bottomColor()}`;
    if (fen && nextInputHash !== lastInputHash) {
      if (inputFen) inputFen.value = fen;
      if (!site.blindMode) updateGifLinks(fen);
      lastInputHash = nextInputHash;
    }
  };
  onFenChange(ctrl.node.fen);
  pubsub.on('analysis.change', onFenChange);

  if (!site.blindMode) {
    pubsub.on('board.change', () => inputFen && updateGifLinks(inputFen.value));
    pubsub.on('analysis.comp.toggle', (v: boolean) => {
      if (v) {
        setTimeout(() => $menu.find('.computer-analysis').first().trigger('click'), 50);
      } else {
        $menu.find('button:not(.computer-analysis)').first().trigger('click');
      }
    });
  }

  function startAdvantageChart() {
    if (advChart || site.blindMode) return;
    const $panel = $panels.filter('.computer-analysis');
    if (!$('#acpl-chart-container').length)
      $panel.html('<div id="acpl-chart-container"><canvas id="acpl-chart"></canvas></div>');
    site.asset.loadEsm<ChartGame>('chart.game').then(m => {
      m.acpl($('#acpl-chart')[0] as HTMLCanvasElement, data, ctrl.serverMainline()).then(chart => {
        advChart = chart;
      });
    });
  }

  const store = storage.make('analysis.panel');
  const setPanel = function (panel: string) {
    $menu.children('.active').removeClass('active');
    $menu.find(`[data-panel="${panel}"]`).addClass('active');
    $panels
      .removeClass('active')
      .filter('.' + panel)
      .addClass('active');
    if ((panel === 'move-times' || ctrl.opts.hunter) && !timeChartLoaded)
      site.asset.loadEsm<ChartGame>('chart.game').then(m => {
        $('#movetimes-chart').each(function (this: HTMLCanvasElement) {
          timeChartLoaded = true;
          m.movetime(this, data, ctrl.opts.hunter);
        });
      });
    if ((panel === 'computer-analysis' || ctrl.opts.hunter) && $('#acpl-chart-container').length)
      setTimeout(startAdvantageChart, 200);
  };
  $menu.on('click', 'button', function (this: HTMLElement) {
    const panel = this.dataset.panel!;
    store.set(panel);
    setPanel(panel);
  });
  const stored = store.get();
  const foundStored =
    stored &&
    $menu.children(`[data-panel="${stored}"]`).filter(function (this: HTMLElement) {
      const display = window.getComputedStyle(this).display;
      return !!display && display !== 'none';
    }).length;
  if (foundStored) setPanel(stored);
  else {
    const $menuCt = $menu.children('[data-panel="ctable"]');
    ($menuCt.length ? $menuCt : $menu.children(':first-child')).trigger('click');
  }
  // (unit 3.5) the "request computer analysis" form is gone; only a stored analysis is charted

  $panels.on('click', '.pgn', function (this: HTMLElement) {
    const selection = window.getSelection(),
      range = document.createRange();
    range.selectNodeContents(this);
    const currentlyUnselected = selection!.isCollapsed;
    selection!.removeAllRanges();
    if (currentlyUnselected) selection!.addRange(range);
  });

  $panels.on('click', '.embed-howto', function (this: HTMLElement) {
    // location.hash is percent encoded, so no need to escape and make &bg=...
    // uglier in the process.
    const url = `${baseUrl()}/embed/game/${data.game.id}?theme=auto&bg=auto${location.hash}`;
    const iframe = `<iframe src="${url}"\nwidth=600 height=397 frameborder=0></iframe>`;
    domDialog({
      modal: true,
      show: true,
      easyClose: 'clickOutside',
      htmlText:
        '<div><strong style="font-size:1.5em">' +
        $(this).html() +
        '</strong><br /><br />' +
        '<pre>' +
        escapeHtml(iframe) +
        '</pre><br />' +
        iframe +
        '<br /><br />' +
        `<a class="text" data-icon="${licon.InfoCircle}" href="/developers#embed-game">Read more about embedding games</a></div>`,
    });
  });

  document.querySelector<HTMLAnchorElement>('a.game-gif')?.addEventListener('click', e => {
    e.preventDefault();
    site.asset.loadEsm('analyse.gifDialog', { init: ctrl });
  });
}
