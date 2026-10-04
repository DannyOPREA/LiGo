import { standardKomi } from '@ligo/board/rules';

import { type VNode, bind, hl } from 'lib/view';

import type AnalyseCtrl from '@/ctrl';
import type { Setup } from '@/ctrl';
import { SIZES, type Ruleset } from '@/go';

/**
 * The setup mode's panel, beside the position editor (ADR 0023 §1): the board size, rules and
 * komi, which colour a tap places (a tap on a stone of that colour takes it away), who plays
 * first, and Start or Cancel. A position with a stone that has no liberties is refused on Start.
 */
export function renderSetup(ctrl: AnalyseCtrl, setup: Setup): VNode {
  const choice = <A extends string | number>(value: A, current: A, label: string, set: (v: A) => void) =>
    hl(
      'button.button.button-thin',
      {
        class: { 'button-empty': value !== current },
        attrs: { type: 'button', 'aria-pressed': String(value === current) },
        hook: bind('click', () => set(value)),
      },
      label,
    );
  const stones = setup.black.length + setup.white.length;
  return hl('div.analyse__tools.analyse__setup', [
    hl('div.analyse__setup-inner', [
      hl('h2', i18n.site.goNewPosition),
      hl('div.analyse__setup-row', [
        hl('span.analyse__setup-name', i18n.site.board),
        SIZES.map(size => choice(size, setup.size, `${size}×${size}`, s => ctrl.setSetupSize(s))),
      ]),
      hl('div.analyse__setup-row', [
        hl('label.analyse__setup-name', { attrs: { for: 'analyse-setup-rules' } }, i18n.site.goRules),
        hl(
          'select#analyse-setup-rules',
          {
            hook: bind('change', e => {
              const ruleset = (e.target as HTMLSelectElement).value as Ruleset;
              ctrl.setSetupRuleset(ruleset, standardKomi(ruleset, 0));
            }),
          },
          (['japanese', 'chinese'] as const).map(r =>
            hl(
              'option',
              { attrs: { value: r, selected: r === setup.ruleset } },
              r === 'chinese' ? i18n.site.goRulesChinese : i18n.site.goRulesJapanese,
            ),
          ),
        ),
      ]),
      hl('div.analyse__setup-row', [
        hl('label.analyse__setup-name', { attrs: { for: 'analyse-setup-komi' } }, i18n.site.goKomi),
        hl('input#analyse-setup-komi', {
          attrs: { type: 'number', step: '0.5', min: '-150', max: '150', inputmode: 'decimal' },
          props: { value: String(setup.komi) },
          hook: bind('change', e => {
            const input = e.target as HTMLInputElement;
            const komi = input.value.trim() === '' ? NaN : Number(input.value);
            // A multiple of 0.5 within the box's limits; anything else goes back to the komi in use.
            if (Number.isInteger(komi * 2) && Math.abs(komi) <= 150) ctrl.setSetupKomi(komi);
            else input.value = String(setup.komi);
          }),
        }),
      ]),
      hl('div.analyse__setup-row', [
        hl('span.analyse__setup-name', i18n.site.goPlace),
        choice('black', setup.color, i18n.site.goBlackStones, c => ctrl.setSetupColor(c)),
        choice('white', setup.color, i18n.site.goWhiteStones, c => ctrl.setSetupColor(c)),
      ]),
      hl('p.analyse__setup-hint', i18n.site.goSetupHint),
      hl('div.analyse__setup-row', [
        hl('span.analyse__setup-name', i18n.site.goToPlay),
        choice('black', setup.toMove, i18n.site.black, c => ctrl.setSetupToMove(c)),
        choice('white', setup.toMove, i18n.site.white, c => ctrl.setSetupToMove(c)),
      ]),
      setup.error && hl('p.analyse__setup-error', { attrs: { role: 'alert' } }, setup.error),
      hl('div.analyse__setup-actions', [
        hl(
          'button.button',
          { attrs: { type: 'button' }, hook: bind('click', ctrl.finishSetup) },
          i18n.site.goStartAnalysis,
        ),
        hl(
          'button.button.button-empty',
          { attrs: { type: 'button', disabled: !stones }, hook: bind('click', ctrl.clearSetup) },
          i18n.site.clearBoard,
        ),
        hl(
          'button.button.button-empty.button-red',
          { attrs: { type: 'button' }, hook: bind('click', ctrl.cancelSetup) },
          i18n.site.cancel,
        ),
      ]),
    ]),
  ]);
}
