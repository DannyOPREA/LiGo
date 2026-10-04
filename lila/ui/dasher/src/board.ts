import { pubsub } from 'lib/pubsub';
import { bind, hl, onInsert, type VNode } from 'lib/view';
import { text as xhrText, form as xhrForm } from 'lib/xhr';

import { PaneCtrl, type Range } from './interfaces';
import { header } from './util';

/**
 * LiGo: the board pane lists goban's board themes (ADR 0026 §3), which the server sends as the `theme`
 * preference's list. They are drawn from code, so there is no 3D board, no picture and no colour filter;
 * only the board size slider stays.
 */
export class BoardCtrl extends PaneCtrl {
  sliderKey: number = Date.now(); // changing the value attribute doesn't always flush to DOM.

  render = (): VNode =>
    hl('div.sub.board', [
      header(i18n.site.board, this.close),
      !Number.isNaN(this.getVar('zoom')) &&
        this.propSlider('zoom', i18n.site.size, { min: 0, max: 100, step: 1 }),
      hl(
        'div.list',
        this.data.list.map(({ name }) =>
          hl(
            'button',
            {
              key: name,
              hook: bind('click', () => this.setBoard(name)),
              attrs: { type: 'button', 'aria-pressed': `${this.data.current === name}` },
              class: { active: this.data.current === name },
            },
            [hl('span.swatch', { attrs: { 'data-board-theme': name } }), name],
          ),
        ),
      ),
    ]);

  private get data() {
    return this.root.data.board;
  }

  private readonly setBoard = (t: string) => {
    this.data.current = t;
    document.body.dataset.board = t;
    pubsub.emit('board.change', false);
    xhrText('/pref/theme', { body: xhrForm({ theme: t }), method: 'post' }).catch(() =>
      site.announce({ msg: 'Failed to save theme preference' }),
    );
    this.redraw();
  };

  private readonly setVar = (prop: string, v: number) => {
    document.body.style.setProperty(`---${prop}`, v.toString());
    if (prop === 'zoom') window.dispatchEvent(new Event('resize'));
  };

  private readonly propSlider = (prop: string, label: string, range: Range) =>
    hl(`div.${prop}`, { attrs: { title: `${Math.round(this.getVar(prop))}%` } }, [
      hl('label', label),
      hl('input.range', {
        key: this.sliderKey + prop,
        attrs: { ...range, type: 'range', value: this.getVar(prop), 'aria-label': label },
        hook: onInsert<HTMLInputElement>(input => {
          const setAndSave = (v: number) => {
            if (v < range.min || v > range.max) return;
            this.setVar(prop, v);
            this.redraw();
            this.postPref(prop);
          };
          $(input)
            .on('input', () => setAndSave(parseInt(input.value)))
            .on('wheel', e => {
              e.preventDefault();
              setAndSave(this.getVar(prop) + (e.deltaY > 0 ? -range.step : range.step));
            });
        }),
      }),
    ]);
}
