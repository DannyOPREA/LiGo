import { hl, type VNode } from 'lib/view';

import {
  goRulesets,
  goSizes,
  handicapName,
  handicaps,
  rulesetName,
  sizeName,
  type GoRuleset,
  type GoSize,
} from '../../../goSetup';
import type SetupController from '../../../setupCtrl';

// Board size, ruleset and komi (unit 3.19), and in a friend game the handicap (unit 4.9).
export const goOptions = (setupCtrl: SetupController): VNode =>
  hl('div.go-options', [
    sizePicker(setupCtrl),
    rulesetPicker(setupCtrl),
    komiInput(setupCtrl),
    setupCtrl.gameType === 'friend' ? handicapPicker(setupCtrl) : null,
  ]);

// With a named opponent, the stones ADR 0021 §4 suggests for the two ranks (unit 5.7).
const handicapPicker = (setupCtrl: SetupController): VNode =>
  hl('div.config-group', [
    hl('label.label', { attrs: { for: 'sf_handicap' } }, i18n.site.goHandicap),
    hl(
      'select#sf_handicap',
      { on: { change: (e: Event) => setupCtrl.setHandicap(Number((e.target as HTMLSelectElement).value)) } },
      handicaps.map(handicap =>
        hl(
          'option',
          { attrs: { value: handicap }, props: { selected: handicap === setupCtrl.handicap() } },
          handicapName(handicap),
        ),
      ),
    ),
    setupCtrl.stoneAdvice() &&
      hl(
        'p.setup-suggested-stones',
        i18n.site.goSuggestedHandicapX(handicapName(setupCtrl.stoneAdvice()!.suggested)),
      ),
  ]);

const sizePicker = (setupCtrl: SetupController): VNode =>
  site.blindMode
    ? hl('div.config-group', [
        hl('label', { attrs: { for: 'sf_size' } }, i18n.site.goBoardSize),
        hl(
          'select#sf_size',
          {
            on: {
              change: (e: Event) =>
                setupCtrl.setGoSize(Number((e.target as HTMLSelectElement).value) as GoSize),
            },
          },
          goSizes.map(size =>
            hl(
              'option',
              { attrs: { value: size }, props: { selected: size === setupCtrl.goSize() } },
              sizeName(size),
            ),
          ),
        ),
      ])
    : hl('div.config-group', [
        hl('div.label', i18n.site.goBoardSize),
        hl(
          'group.radio',
          goSizes.map(size =>
            hl('div', [
              hl(`input#sf_size_${size}`, {
                attrs: { name: 'size', type: 'radio', value: size },
                props: { checked: size === setupCtrl.goSize() },
                on: { change: () => setupCtrl.setGoSize(size) },
              }),
              hl('label', { attrs: { for: `sf_size_${size}` } }, sizeName(size)),
            ]),
          ),
        ),
      ]);

const rulesetPicker = (setupCtrl: SetupController): VNode =>
  hl('div.config-group', [
    hl('label.label', { attrs: { for: 'sf_ruleset' } }, i18n.site.goRules),
    hl(
      'select#sf_ruleset',
      {
        on: {
          change: (e: Event) => setupCtrl.setGoRuleset((e.target as HTMLSelectElement).value as GoRuleset),
        },
      },
      goRulesets.map(ruleset =>
        hl(
          'option',
          { attrs: { value: ruleset }, props: { selected: ruleset === setupCtrl.goRuleset() } },
          rulesetName(ruleset),
        ),
      ),
    ),
  ]);

const komiInput = (setupCtrl: SetupController): VNode => {
  const limit = setupCtrl.goSize() * setupCtrl.goSize();
  return hl('div.config-group', [
    hl('label.label', { attrs: { for: 'sf_komi' } }, i18n.site.goKomi),
    hl('input#sf_komi', {
      attrs: { type: 'number', step: '0.5', min: -limit, max: limit, required: true },
      // `props`, not `attrs`: once the player has typed, the browser shows the property, and a komi
      // reset by a new ruleset must show too.
      props: { value: String(setupCtrl.goKomi()) },
      on: {
        change: (e: Event) => {
          const el = e.target as HTMLInputElement;
          setupCtrl.setGoKomi(el.value);
          // A komi that was ignored would otherwise stay in the field, unlike the one the form sends.
          el.value = String(setupCtrl.goKomi());
        },
      },
    }),
  ]);
};
