import type AnalyseCtrl from './ctrl';

/**
 * lila's analysis keys, on the page (the board, once focused, takes the arrow keys for its own
 * cursor: libs/board, ADR 0026 §4). Left/right: back and forward; up/home and down/end: start and
 * end of the main line; shift+left/right: the previous and next branching point; shift+up/down:
 * the neighbouring variation; shift+c: comments on and off; h: the menu. The engine keys went with
 * the engine (unit 3.5), and the chess settings keys with the chess analysis (unit 7.4).
 */
export const bind = (ctrl: AnalyseCtrl): void => {
  const kbd = window.site.mousetrap;
  const run = (f: () => void) => () => {
    if (ctrl.setup) return;
    f();
    ctrl.redraw();
  };
  kbd
    .bind(['left', 'k'], run(ctrl.navigate.prev))
    .bind(['right', 'j'], run(ctrl.navigate.next))
    .bind(['up', '0', 'home'], run(ctrl.navigate.first))
    .bind(['down', '$', 'end'], run(ctrl.navigate.last))
    .bind(['shift+left', 'shift+k'], run(ctrl.navigate.previousBranch))
    .bind(['shift+right', 'shift+j'], run(ctrl.navigate.nextBranch))
    .bind('shift+up', run(() => ctrl.navigate.stepLine('prev')))
    .bind('shift+down', run(() => ctrl.navigate.stepLine('next')))
    .bind(
      'shift+c',
      run(() => {
        ctrl.showComments = !ctrl.showComments;
        ctrl.treeView.requestAutoScroll('smooth');
      }),
    )
    .bind('h', run(ctrl.toggleActionMenu));
};
