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
// 1 stone: no stone placed, Black moves first, komi 0.5 (R-HCP-2).
const HANDICAPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const colorName = (color: 'black' | 'white'): string => (color === 'black' ? 'Black' : 'White');

export default function view(ctrl: PlaygroundCtrl): VNode {
  const state = ctrl.board?.state();
  return div('.playground', [
    h1('Playground'),
    p('.playground__intro', 'Play both colours on one board. Nothing here is saved, and there is no clock.'),
    div('.playground__layout', [
      hl('div.playground__board-wrap', [
        !ctrl.board &&
          p(
            '.playground__loading',
            ctrl.loadFailed
              ? 'The board could not be loaded. Reload the page to try again.'
              : 'Loading the board…',
          ),
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
  const turn = state ? `${colorName(state.toMove)} to play.` : '';
  const text = ctrl.bothPassed
    ? `Both players passed. Scoring is not built yet; play on if you like. ${turn}`
    : turn;
  return div('.playground__status', [div(text), div('.playground__game', gameSummary(ctrl.settings))]);
}

/** The settings of the game on the board (the form below is for the next one). */
function gameSummary(s: GameSettings): string {
  const handicap = s.handicap ? `${s.handicap} stone${s.handicap > 1 ? 's' : ''} handicap` : 'even';
  const ruleset = s.ruleset === 'japanese' ? 'Japanese' : 'Chinese';
  return `${s.size}×${s.size}, ${ruleset} rules, ${handicap}, komi ${s.komi}`;
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
    field('Board size', 'playground-size', sizeSelect(ctrl, s)),
    field('Ruleset', 'playground-ruleset', rulesetSelect(ctrl, s)),
    field('Handicap', 'playground-handicap', handicapSelect(ctrl, s)),
    field('Komi', 'playground-komi', komiInput(ctrl, s)),
    button('.button', { attrs: { type: 'submit' } }, 'New game'),
  ]);
}

/** A labelled control: the label names it for screen readers (and for tests, by its label). */
function field(labelText: string, id: string, control: VNode): VNode {
  control.data = { ...control.data, attrs: { ...control.data?.attrs, id } };
  return div('.playground__field', [label({ attrs: { for: id } }, labelText), control]);
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
      option(
        { attrs: { value: h, selected: h === s.handicap } },
        h === 0 ? 'Even' : h === 1 ? '1 stone' : `${h} stones`,
      ),
    ),
  );
}

function komiInput(ctrl: PlaygroundCtrl, s: GameSettings): VNode {
  const limit = ctrl.komiLimit();
  return input('number')({
    // `props`, not `attrs`: once the player has typed, the browser shows the property, and a komi
    // reset by a new ruleset or handicap must show too.
    attrs: { step: '0.5', min: -limit, max: limit, required: true },
    props: { value: String(s.komi) },
    hook: bind('change', e => ctrl.setPendingKomi(Number((e.target as HTMLInputElement).value)), ctrl.redraw),
  });
}
