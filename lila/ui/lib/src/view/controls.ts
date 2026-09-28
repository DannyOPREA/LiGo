// no side effects allowed due to re-export by index.ts

import { h, type Hooks, type VNode, type Attrs, type On } from 'snabbdom';

import { toggle as baseToggle, type Toggle } from '@/index';
import { licon } from '@/licon';
import { onInsert } from '@/view/snabbdom';
import * as xhr from '@/xhr';

export function enter<E extends HTMLElement>(effect: (target: E) => void) {
  return (e: Event): void => {
    if (e instanceof KeyboardEvent && e.key === 'Enter') effect(e.target as E);
  };
}

export function toggleBoxInit(): void {
  $('.toggle-box--toggle:not(.toggle-box--ready)').each(function (this: HTMLFieldSetElement) {
    const toggle = () => this.classList.toggle('toggle-box--toggle-off');
    $(this).addClass('toggle-box--ready').children('legend').on('click', toggle).on('keydown', enter(toggle));
  });
}

export function rangeConfig(read: () => number, write: (value: number) => void): Hooks {
  return {
    ...onInsert<HTMLInputElement>(el => {
      el.value = String(read());
      el.addEventListener('input', () => write(parseInt(el.value)));
      el.addEventListener('mouseout', () => el.blur());
    }),
    update: (_, v: VNode) => {
      (v.elm as HTMLInputElement).value = `${read()}`; // force redraw on external value change
    },
  };
}

export const boolPrefXhrToggle = (prefKey: string, val: boolean, effect: () => void = site.reload): Toggle =>
  baseToggle(val, async v => {
    await xhr.text(`/pref/${prefKey}`, { method: 'post', body: xhr.form({ [prefKey]: v ? '1' : '0' }) });
    effect();
  });

export function copyMeInput(content: string, opts: { inputAttrs?: Attrs; on?: On } = {}): VNode {
  return h('div.copy-me', [
    h('input.copy-me__target', {
      attrs: { spellcheck: 'false', ...opts.inputAttrs },
      props: { value: content },
      on: opts.on,
    }),
    h('button.copy-me__button.button.button-metal', {
      attrs: { 'data-icon': licon.Clipboard, title: i18n.site.copyToClipboard },
    }),
  ]);
}

export const addPasswordVisibilityToggleListener = (): void => {
  $('.password-wrapper').each(function (this: HTMLElement) {
    const $wrapper = $(this);
    const $button = $wrapper.find('.password-reveal');
    $button.on('click', (e: PointerEvent) => {
      e.preventDefault();
      const $input = $wrapper.find('input');
      const type = $input.attr('type') === 'password' ? 'text' : 'password';
      $input.attr('type', type);
      $button.toggleClass('revealed', type === 'text');
      $button.attr('aria-pressed', String(type === 'text'));
    });
  });
};

// LiGo's two-stone logo, drawn stroke by stroke (lichess's spinner traced its non-free logo).
const pathAttrs = [
  { 'stroke-width': 3.5, d: 'M31 4a15 15 0 1 1 0 30a15 15 0 1 1 0-30' },
  { 'stroke-width': 3.5, d: 'M19 14a17 17 0 0 1 0 34' },
  { 'stroke-width': 3.5, d: 'M19 48a17 17 0 0 1 0-34' },
];

export const spinnerHtml: string = $html`
  <div class="spinner" aria-label="loading">
    <svg viewBox="-2 -2 54 54">
      <g fill="none">
        ${pathAttrs.map(
          (a, i) =>
            `<path id="${String.fromCharCode(97 + i)}" stroke-width="${a['stroke-width']}" d="${a.d}"/>`,
        )}
      </g>
    </svg>
  </div>`;

export const spinnerVdom = (box = '-2 -2 54 54'): VNode =>
  h('div.spinner', { 'aria-label': 'loading' }, [
    h('svg', { attrs: { viewBox: box } }, [
      h(
        'g',
        { attrs: { fill: 'none' } },
        pathAttrs.map(attrs => h('path', { attrs })),
      ),
    ]),
  ]);
