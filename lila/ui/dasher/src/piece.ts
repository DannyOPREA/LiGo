import { pubsub } from 'lib/pubsub';
import { bind, hl, type VNode } from 'lib/view';
import { text as xhrText, form as xhrForm } from 'lib/xhr';

import { PaneCtrl } from './interfaces';
import { header } from './util';

/**
 * LiGo: the stones pane lists goban's stone themes (ADR 0026 §3), black and white chosen together,
 * which the server sends as the `pieceSet` preference's list.
 */
export class PieceCtrl extends PaneCtrl {
  render(): VNode {
    return hl('div.sub.piece', [
      header(i18n.site.pieceSet, () => this.close()),
      hl(
        'div.list',
        this.data.list.map(({ name }) =>
          hl(
            'button',
            {
              key: name,
              attrs: { type: 'button', 'aria-pressed': `${this.data.current === name}` },
              hook: bind('click', () => this.set(name)),
              class: { active: this.data.current === name },
            },
            [
              hl('span.swatch', { attrs: { 'data-stone-theme': name } }, [hl('i.black'), hl('i.white')]),
              name,
            ],
          ),
        ),
      ),
    ]);
  }

  private get data() {
    return this.root.data.piece;
  }

  private readonly set = (t: string) => {
    this.data.current = t;
    document.body.dataset.pieceSet = t;
    pubsub.emit('board.change', false);
    xhrText('/pref/pieceSet', { body: xhrForm({ pieceSet: t }), method: 'post' }).catch(() =>
      site.announce({ msg: 'Failed to save stone preference' }),
    );
    this.redraw();
  };
}
