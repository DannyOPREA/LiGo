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
  hookRow,
  liveSpeeds,
  noChips,
  playerRatingLabel,
  ratedChoices,
  seekRow,
  sortRows,
  toggleRated,
  toggleSize,
  toggleSpeed,
  type OpenRow,
} from '../openChallenges';

// The rows on screen: hooks (as last flushed, so rows don't jump under the cursor) or seeks, filtered by
// the chips and sorted for this viewer.
export const visibleRows = (ctrl: LobbyController): OpenRow[] => {
  const rows = ctrl.mode === 'live' ? ctrl.stepHooks.map(hookRow) : ctrl.data.seeks.map(seekRow);
  return sortRows(applyChips(rows, ctrl.chips), ctrl.viewer(), ctrl.chips);
};

const setupOf = (row: OpenRow): string =>
  row.size && row.rules && row.komi !== undefined
    ? `${sizeName(row.size)} · ${rulesetName(row.rules)} · ${i18n.site.goKomi} ${row.komi}`
    : '';

const timeOf = (row: OpenRow): string =>
  row.kind === 'live' ? (row.clock ?? '') : row.days ? i18n.site.nbDays(row.days) : '∞';

const renderRow = (ctrl: LobbyController, row: OpenRow): VNode => {
  const f = fit(row, ctrl.viewer(), ctrl.chips);
  const setup = setupOf(row);
  return tr(
    `.${row.kind === 'live' ? 'hook' : 'seek'}.${row.own ? 'cancel' : 'join'}`,
    {
      key: row.kind + row.id,
      class: { disabled: row.disabled, unjoinable: !row.disabled && !row.own && !f.joinable },
      role: 'button',
      title: row.disabled
        ? ''
        : row.own
          ? i18n.site.cancel
          : // the reason for an unjoinable row gets its translated word with unit 6.5 (ADR 0022 §5)
            i18n.site.joinTheGame + (setup ? ` | ${setup}` : ''),
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
      // Always even until unit 4.9 lets a game have handicap stones
      td('.handicap', row.handicap > 0 ? `${i18n.site.goHandicap} ${row.handicap}` : i18n.site.goEven),
      td('.mode', i18n.site[row.rated ? 'rated' : 'casual']),
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
            () => ctrl.setChips(toggleSize(chips, size)),
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
              () => ctrl.setChips(toggleSpeed(chips, speed)),
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
          () => ctrl.setChips(toggleRated(chips, choice)),
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
      if (el.dataset['kind'] === 'live') return ctrl.clickHook(id);
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
