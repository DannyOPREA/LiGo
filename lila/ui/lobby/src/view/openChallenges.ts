// The "Open challenges" tab (unit 6.7, ADR 0022 §5): lila's real-time hooks and correspondence seeks in
// one table, a Live / Correspondence chip, and filter chips. Relative imports (not `@/`) so that
// tests/openChallenges.test.ts can load this file.
import { h, type VNode } from 'snabbdom';

import {
  bind,
  confirm,
  type MaybeVNodes,
  tr,
  td,
  span,
  div,
  button,
  table,
  thead,
  tbody,
  th,
} from 'lib/view';
import { profileUrl } from 'lib/view/userLink';

import type LobbyController from '../ctrl';
import { goSizes, rulesetName, sizeName } from '../goSetup';
import type { Mode } from '../interfaces';
import {
  anyChip,
  applyChips,
  fit,
  type Unjoinable,
  handicapChoices,
  hookRow,
  liveSpeeds,
  noChips,
  playerRatingLabel,
  rangeLabel,
  ratedChoices,
  seekRow,
  sortRows,
  toggleHandicap,
  toggleRated,
  toggleSize,
  toggleSpeed,
  type OpenRow,
  type Wants,
} from '../openChallenges';
import { effectiveChips } from '../quickPair';

// What suits you is what the Quick tab's chip row says you play (ADR 0022 §5), as a click there would
// send it: a guest plays casual, and casual is even.
const wants = (ctrl: LobbyController): Wants => effectiveChips(ctrl.quickChips, !!ctrl.me);

// The rows on screen: hooks (as last flushed, so rows don't jump under the cursor) or seeks, filtered by
// the chips and sorted for this viewer.
export const visibleRows = (ctrl: LobbyController): OpenRow[] => {
  const rows = ctrl.mode === 'live' ? ctrl.stepHooks.map(hookRow) : ctrl.data.seeks.map(seekRow);
  return sortRows(applyChips(rows, ctrl.chips), ctrl.viewer(), wants(ctrl), ctrl.data.rankTable);
};

const setupOf = (row: OpenRow): string =>
  row.size && row.rules && row.komi !== undefined
    ? `${sizeName(row.size)} · ${rulesetName(row.rules)} · ${i18n.site.goKomi} ${row.komi}`
    : '';

const timeOf = (row: OpenRow): string =>
  row.kind === 'live' ? (row.clock ?? '') : row.days ? i18n.site.nbDays(row.days) : '∞';

const unjoinableTitle = (reason: Unjoinable): string =>
  reason === 'rated'
    ? i18n.site.goUnjoinableRated
    : reason === 'range'
      ? i18n.site.goUnjoinableRange
      : reason === 'members'
        ? i18n.site.goUnjoinableMembers
        : reason === 'guests'
          ? i18n.site.goUnjoinableGuests
          : i18n.site.cancel;

// Why a greyed row can't be joined, with the range it asks for: its title, and a line on a phone's card.
const reasonOf = (row: OpenRow, reason: Unjoinable): string =>
  unjoinableTitle(reason) + (row.range && rangeLabel(row.range) ? ` (${rangeLabel(row.range)})` : '');

const renderRow = (ctrl: LobbyController, row: OpenRow): VNode => {
  const f = fit(row, ctrl.viewer(), wants(ctrl));
  const setup = setupOf(row);
  const unjoinable = !row.disabled && !row.own && !f.joinable;
  const reason = unjoinable && f.reason ? reasonOf(row, f.reason) : undefined;
  return tr(
    `.${row.kind === 'live' ? 'hook' : 'seek'}.${row.own ? 'cancel' : 'join'}`,
    {
      key: row.kind + row.id,
      class: { disabled: row.disabled, unjoinable, suits: !row.own && f.suits },
      role: 'button',
      'aria-disabled': row.disabled || (!row.own && !f.joinable) ? 'true' : undefined,
      title: row.disabled
        ? ''
        : row.own
          ? i18n.site.cancel
          : reason
            ? reason
            : i18n.site.joinTheGame + (setup ? ` | ${setup}` : ''),
      'data-id': row.id,
      'data-kind': row.kind,
    },
    [
      td('.player', [
        // lila names hook players to signed-in viewers only, and seek players to everyone
        (row.kind === 'correspondence' || ctrl.me) && row.user
          ? span('.ulink.ulpt.mobile-powertip', { 'data-href': profileUrl(row.user) }, row.user)
          : i18n.site.anonymous,
        ctrl.opts.showRatings && row.rating
          ? span(
              '.rating',
              { attrs: { title: String(row.rating) } },
              playerRatingLabel(row.rating, row.provisional, row.goRank),
            )
          : null,
      ]),
      td('.board', row.size ? sizeName(row.size) : ''),
      td('.time', timeOf(row)),
      td(
        '.rules',
        { attrs: { title: row.komi !== undefined ? `${i18n.site.goKomi} ${row.komi}` : '' } },
        row.rules ? `${rulesetName(row.rules)}${row.komi !== undefined ? ` · ${row.komi}` : ''}` : '',
      ),
      td('.handicap', row.handicap > 0 ? `${i18n.site.goHandicap} ${row.handicap}` : i18n.site.goEven),
      td('.mode', i18n.site[row.rated ? 'rated' : 'casual']),
      // shown on a phone's card only, where there is no title to hover
      reason ? td('.reason', reason) : null,
    ],
  );
};

const chip = (label: string, pressed: boolean, onClick: () => void, key?: string): VNode =>
  button(
    '.chip',
    {
      key,
      attrs: { 'aria-pressed': String(pressed) },
      class: { active: pressed },
      hook: bind('click', onClick),
    },
    label,
  );

const group = (label: string, chips: VNode[], cls = ''): VNode =>
  div(`.open__group${cls}`, { attrs: { role: 'group', 'aria-label': label } }, chips);

// A chip's click reads the chips as they are then: `bind` keeps the handler of the chip's first render.
const renderChips = (ctrl: LobbyController): VNode => {
  const { chips } = ctrl;
  return div('.open__chips', [
    group(
      i18n.site.goBoardSize,
      goSizes
        .slice()
        .reverse()
        .map(size =>
          chip(
            sizeName(size),
            chips.sizes.includes(size),
            () => ctrl.setChips(toggleSize(ctrl.chips, size)),
            `s${size}`,
          ),
        ),
    ),
    ctrl.mode === 'live'
      ? group(
          i18n.site.time,
          liveSpeeds.map(speed =>
            chip(
              i18n.site[speed],
              chips.speeds.includes(speed),
              () => ctrl.setChips(toggleSpeed(ctrl.chips, speed)),
              speed,
            ),
          ),
        )
      : null,
    group(
      i18n.site.mode,
      ratedChoices.map(choice =>
        chip(
          i18n.site[choice],
          chips.rated.includes(choice),
          () => ctrl.setChips(toggleRated(ctrl.chips, choice)),
          choice,
        ),
      ),
    ),
    group(
      i18n.site.goHandicap,
      handicapChoices.map(choice =>
        chip(
          choice === 'even' ? i18n.site.goEven : i18n.site.goHandicap,
          chips.handicap.includes(choice),
          () => ctrl.setChips(toggleHandicap(ctrl.chips, choice)),
          choice,
        ),
      ),
    ),
    anyChip(chips)
      ? button('.chip.reset', { hook: bind('click', () => ctrl.setChips(noChips())) }, i18n.site.reset)
      : null,
  ]);
};

const modeChip = (ctrl: LobbyController, mode: Mode, label: string): VNode =>
  chip(label, ctrl.mode === mode, () => ctrl.setMode(mode), mode);

const createSeek = (ctrl: LobbyController): VNode | undefined => {
  if (!ctrl.me || ctrl.mode !== 'correspondence' || ctrl.data.seeks.length >= 8) return undefined;
  return div('.create', [
    button(
      '.button',
      {
        hook: bind(
          'click',
          () => ctrl.setupCtrl.openModal('hook', { timeMode: 'correspondence' }),
          ctrl.redraw,
        ),
      },
      i18n.site.createAGame,
    ),
  ]);
};

const onRowClick = (ctrl: LobbyController) =>
  bind(
    'click',
    async e => {
      // any tap inside a row counts, including a phone card's padding and gaps
      const el = (e.target as HTMLElement).closest<HTMLElement>('tbody tr');
      if (!el?.dataset['id']) return;
      const id = el.dataset['id'];
      // a greyed row you can't join does nothing (the server would refuse it too), except offer a
      // guest the sign-up page, as lila does for a guest's click on a correspondence game
      const unjoinable = el.classList.contains('unjoinable');
      if (unjoinable && ctrl.me) return;
      if (el.dataset['kind'] === 'live' && !unjoinable) return ctrl.clickHook(id);
      if (!ctrl.me) {
        if (await confirm(i18n.site.youNeedAnAccountToDoThat, i18n.site.signUp, i18n.site.cancel))
          location.href = '/signup';
        return;
      }
      return ctrl.clickSeek(id);
    },
    ctrl.redraw,
  );

export default function (ctrl: LobbyController): MaybeVNodes {
  const rows = visibleRows(ctrl);
  return [
    div('.open__bar', [
      group(
        i18n.site.openChallenges,
        [modeChip(ctrl, 'live', i18n.site.live), modeChip(ctrl, 'correspondence', i18n.site.correspondence)],
        '.open__mode',
      ),
      renderChips(ctrl),
    ]),
    table('.hooks__list', [
      thead(
        tr([
          th('.player', i18n.site.player),
          th('.board', i18n.site.board),
          th('.time', i18n.site.time),
          th('.rules', i18n.site.goRules),
          th('.handicap', i18n.site.goHandicap),
          th('.mode', i18n.site.mode),
        ]),
      ),
      tbody(
        { class: { stepping: ctrl.stepping && ctrl.mode === 'live' }, hook: onRowClick(ctrl) },
        rows.map(row => renderRow(ctrl, row)),
      ),
    ]),
    rows.length ? null : h('p.open__empty', i18n.site.goNoOpenChallenges),
    createSeek(ctrl),
  ];
}
