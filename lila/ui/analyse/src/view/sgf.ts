import { licon } from 'lib/licon';
import { type VNode, bind, dataIcon, hl, onInsert } from 'lib/view';

import type AnalyseCtrl from '@/ctrl';

/**
 * The SGF box under the board, where lila's `/analysis` has its PGN box: the whole tree as SGF, to
 * copy or edit. Loading replaces the tree with the record's first game (pasted, or from a file);
 * the download saves the tree with its variations and comments (ADR 0023 §2, §5).
 */
export function renderSgf(ctrl: AnalyseCtrl): VNode {
  const current = () => ctrl.sgfInput ?? ctrl.sgf();
  return hl('div.analyse__sgf', [
    hl('label.analyse__sgf-label', { attrs: { for: 'analyse-sgf' } }, 'SGF'),
    hl('textarea#analyse-sgf.copyable', {
      attrs: { spellcheck: 'false', rows: 6 },
      class: { 'is-error': !!ctrl.sgfError },
      hook: {
        ...onInsert<HTMLTextAreaElement>(el => {
          el.value = current();
          el.addEventListener('input', () => (ctrl.sgfInput = el.value));
        }),
        postpatch: (_, vnode) => {
          const el = vnode.elm as HTMLTextAreaElement;
          if (el.value !== current()) el.value = current();
        },
      },
    }),
    hl('div.analyse__sgf-actions', [
      hl(
        'button.button.button-thin.text',
        {
          attrs: dataIcon(licon.PlayTriangle),
          hook: bind('click', () => ctrl.loadSgf(ctrl.sgfInput ?? ctrl.sgf())),
        },
        i18n.site.goLoadSgf,
      ),
      hl('label.button.button-thin.button-empty.text', { attrs: dataIcon(licon.UploadCloud) }, [
        i18n.site.goOpenSgfFile,
        hl('input.analyse__sgf-file', {
          attrs: { type: 'file', accept: '.sgf,application/x-go-sgf,text/plain' },
          hook: bind('change', e => {
            const input = e.target as HTMLInputElement;
            const file = input.files?.[0];
            if (file) ctrl.loadSgfFile(file);
            input.value = '';
          }),
        }),
      ]),
      hl(
        'button.button.button-thin.button-empty.text',
        { attrs: dataIcon(licon.Download), hook: bind('click', ctrl.downloadSgf) },
        i18n.site.goDownloadSgf,
      ),
    ]),
    ctrl.sgfError &&
      hl(
        'p.analyse__sgf-error',
        { attrs: { role: 'alert', ...dataIcon(licon.CautionTriangle) } },
        ctrl.sgfError,
      ),
  ]);
}
