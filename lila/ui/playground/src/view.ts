import type { BoardState } from '@ligo/board/board';

import {
  bind,
  bindSubmit,
  button,
  div,
  form,
  h1,
  h2,
  hl,
  input,
  label,
  onInsert,
  option,
  p,
  select,
  type VNode,
} from 'lib/view';

import type PlaygroundCtrl from './ctrl';
import type { GameSettings, Ruleset, Size } from './interfaces';

const SIZES: Size[] = [9, 13, 19];
const HANDICAPS = [0, 2, 3, 4, 5, 6, 7, 8, 9];

const colorName = (color: 'black' | 'white'): string => (color === 'black' ? 'Black' : 'White');

export default function view(ctrl: PlaygroundCtrl): VNode {
  const state = ctrl.board?.state();
  return div('.playground', [
    h1('Playground'),
    p('.playground__intro', 'Play both colours on one board. Nothing here is saved, and there is no clock.'),
    div('.playground__layout', [
      hl('div.playground__board-wrap', [
        !ctrl.board && p('.playground__loading', 'Loading the board…'),
        div('.playground__board', {
          key: `board-${ctrl.generation}`,
          hook: onInsert(el => ctrl.mount(el)),
        }),
      ]),
      div('.playground__side.box.box-pad', [
        captures(state),
        status(ctrl, state),
        controls(ctrl),
        settingsForm(ctrl),
      ]),
    ]),
  ]);
}

function captures(state: BoardState | undefined): VNode {
  return div('.playground__captures', [
    div('.playground__capture', [colorName('black'), ' prisoners: ', String(state?.captures.black ?? 0)]),
    div('.playground__capture', [colorName('white'), ' prisoners: ', String(state?.captures.white ?? 0)]),
  ]);
}

function status(ctrl: PlaygroundCtrl, state: BoardState | undefined): VNode {
  const text = ctrl.bothPassed
    ? 'Both players passed. Scoring is not built yet; play on if you like.'
    : state
      ? `${colorName(state.toMove)} to play.`
      : '';
  return div('.playground__status', text);
}

function controls(ctrl: PlaygroundCtrl): VNode {
  return div('.playground__controls', [
    button('.button', { hook: bind('click', () => ctrl.pass(), ctrl.redraw) }, 'Pass'),
    button(
      '.button',
      { attrs: { disabled: !ctrl.canUndo() }, hook: bind('click', () => ctrl.undo(), ctrl.redraw) },
      'Undo',
    ),
  ]);
}

function settingsForm(ctrl: PlaygroundCtrl): VNode {
  const s = ctrl.pending;
  return form({ hook: bindSubmit(() => ctrl.newGame(), ctrl.redraw) }, [
    h2('New game'),
    field('Board size', sizeSelect(ctrl, s)),
    field('Ruleset', rulesetSelect(ctrl, s)),
    field('Handicap', handicapSelect(ctrl, s)),
    field('Komi', komiInput(ctrl, s)),
    button('.button', { attrs: { type: 'submit' } }, 'New game'),
  ]);
}

function field(labelText: string, control: VNode): VNode {
  return div('.playground__field', [label(labelText), control]);
}

function sizeSelect(ctrl: PlaygroundCtrl, s: GameSettings): VNode {
  return select(
    {
      hook: bind(
        'change',
        e => ctrl.setPendingSize(Number((e.target as HTMLSelectElement).value) as Size),
        ctrl.redraw,
      ),
    },
    SIZES.map(size => option({ attrs: { value: size, selected: size === s.size } }, `${size}×${size}`)),
  );
}

function rulesetSelect(ctrl: PlaygroundCtrl, s: GameSettings): VNode {
  const rulesets: Ruleset[] = ['japanese', 'chinese'];
  return select(
    {
      hook: bind(
        'change',
        e => ctrl.setPendingRuleset((e.target as HTMLSelectElement).value as Ruleset),
        ctrl.redraw,
      ),
    },
    rulesets.map(ruleset =>
      option(
        { attrs: { value: ruleset, selected: ruleset === s.ruleset } },
        ruleset === 'japanese' ? 'Japanese' : 'Chinese',
      ),
    ),
  );
}

function handicapSelect(ctrl: PlaygroundCtrl, s: GameSettings): VNode {
  const on13 = s.size === 13;
  return select(
    {
      attrs: { disabled: on13 },
      hook: bind(
        'change',
        e => ctrl.setPendingHandicap(Number((e.target as HTMLSelectElement).value)),
        ctrl.redraw,
      ),
    },
    (on13 ? [0] : HANDICAPS).map(h =>
      option({ attrs: { value: h, selected: h === s.handicap } }, h === 0 ? 'Even' : `${h} stones`),
    ),
  );
}

function komiInput(ctrl: PlaygroundCtrl, s: GameSettings): VNode {
  return input('number')({
    attrs: { step: '0.5', value: s.komi },
    hook: bind('change', e => ctrl.setPendingKomi(Number((e.target as HTMLInputElement).value)), ctrl.redraw),
  });
}
