import { type Prop, propWithEffect } from 'lib';
import type { ColorChoice, ColorProp } from 'lib/setup/color';
import {
  timeModes,
  timeModeId,
  defaultPeriods,
  defaultPeriodTime,
  timeControlFromStoredValues,
  type TimeControl,
  type TimeMode,
} from 'lib/setup/timeControl';
import { storage, storedJsonProp } from 'lib/storage';
import { alert } from 'lib/view';
import * as xhr from 'lib/xhr';

import type LobbyController from './ctrl';
import { customPresets, presetFields, presetMatches, advancedDigest, type Preset } from './customSetup';
import {
  defaultGoRuleset,
  defaultGoSize,
  handicapKomi,
  type GoRuleset,
  type GoSize,
  isGoRuleset,
  isGoSize,
  isHandicap,
  komiFor,
  standardKomi,
  validKomi,
} from './goSetup';
import type { ForceSetupOptions, GameMode, GameType, PoolMember, SetupStore } from './interfaces';
import { fischerPresets, poolForClock } from './poolList';
import { clampSteps, maxRankSteps, rankRange, type RankRange } from './rankRange';

// The handicap ADR 0021 §4 suggests for a rated challenge to a named player, per rated board size, and
// whether the challenger takes Black (`/setup/go-handicap/:username`, unit 5.7).
export interface StoneAdvice {
  suggested: number;
  min: number;
  max: number;
}
export interface HandicapAdvice {
  19: StoneAdvice;
  9: StoneAdvice;
  black: boolean;
}

// the most stones a rated game may have on each board (ADR 0021 §4); 13×13 can't be rated
export const maxRatedHandicap = (size: GoSize): number | undefined =>
  size === 19 ? 9 : size === 9 ? 4 : undefined;

const definedOf = (o?: ForceSetupOptions) => ({
  ...(o?.goSize !== undefined && { goSize: o.goSize }),
  ...(o?.goRuleset !== undefined && { goRuleset: o.goRuleset }),
  ...(o?.goKomi !== undefined && { goKomi: o.goKomi }),
  ...(o?.periods !== undefined && { periods: o.periods }),
  ...(o?.periodTime !== undefined && { periodTime: o.periodTime }),
  ...(o?.handicap !== undefined && { handicap: o.handicap }),
});

// Every Go game is in the one `go` rating (ADR 0021 §1), whatever its board size or speed.
export const goPerf = 'go';

export default class SetupController {
  root: LobbyController;
  // the one remembered store of the custom-game window (unit 6.8): hook and challenge forms share it
  store: Prop<SetupStore>;
  // 'hook' is an open game for anyone, 'friend' a challenge (to a link or to a named player)
  gameType: GameType | null = null;
  // the player a challenge names, and the one the window offers to challenge (`namedUser`) while it is on
  // Anyone or on the link
  friendUser = '';
  namedUser = '';
  handicapAdvice?: HandicapAdvice;
  // set once the player has picked the stones themselves: the suggestion stops following the board size
  handicapTouched = false;
  // the player's own choice of the advanced section being open; undefined follows `advancedWanted`
  advancedChoice?: boolean;
  // the settings as the window opened, for the "Last settings" preset
  private openedWith?: SetupStore;
  // the stones on show are only the named opponent's suggestion, not yet the player's: not remembered
  private suggestedStones = false;
  // nothing was stored before this page: the first window starts from the lobby's Rated/Casual chips
  private remembered: boolean;
  loading = false;
  color: ColorProp;
  forced?: ForceSetupOptions;

  // Store props
  goSize: Prop<GoSize>;
  goRuleset: Prop<GoRuleset>;
  goKomi: Prop<number>;
  handicap: Prop<number>;
  gameMode: Prop<GameMode>;
  ratingMin: Prop<number>;
  ratingMax: Prop<number>;

  timeControl: TimeControl;

  constructor(ctrl: LobbyController) {
    this.root = ctrl;
    this.color = propWithEffect('random', this.onPropChange);
    this.remembered = ['custom', 'hook', 'friend'].some(k => storage.get(this.storeKey(k)) !== null);
    this.store = this.makeSetupStore();
  }

  // Namespace the store by username for user specific modal settings
  private readonly storeKey = (name: string) => `lobby.setup.${this.root.me?.username || 'anon'}.${name}`;

  // Until unit 6.8 the open-game and challenge windows each kept their own settings; the shared store
  // starts from the open game's, else the challenge's, else the defaults.
  makeSetupStore = () =>
    storedJsonProp<SetupStore>(this.storeKey('custom'), () => ({
      goSize: defaultGoSize,
      goRuleset: defaultGoRuleset,
      goKomi: standardKomi(defaultGoRuleset),
      timeMode: 'realTime',
      time: 5,
      increment: 3,
      days: 2,
      periods: defaultPeriods,
      periodTime: defaultPeriodTime,
      handicap: 0,
      gameMode: 'casual',
      color: 'random',
      // ranks below and above the player's own (unit 5.7)
      ratingMin: -maxRankSteps,
      ratingMax: maxRankSteps,
      ...this.legacyStore(),
    }));

  private readonly legacyStore = (): Partial<SetupStore> => {
    for (const name of ['hook', 'friend']) {
      try {
        const old = JSON.parse(storage.get(this.storeKey(name)) ?? 'null');
        if (old && typeof old === 'object') {
          // the old challenge window opened on Unlimited; the shared window should not
          if (old.timeMode === 'unlimited') delete old.timeMode;
          return old;
        }
      } catch (_) {
        // a broken old value: the next one, then the defaults
      }
    }
    return {};
  };

  private readonly loadPropsFromStore = (forceOptions?: ForceSetupOptions) => {
    this.suggestedStones = false;
    const storeProps = this.store();
    // Load props from the store, but override any store values with values found in forceOptions
    // A store saved before unit 3.19 has no Go options, and a link (a reusable challenge) may set
    // them; a bad value gets the default. A hook game is always even, so a link's stones are for a
    // challenge only.
    const forced = definedOf(forceOptions);
    if (this.gameType === 'hook') delete forced.handicap;
    const wanted = { ...storeProps, ...forced };
    const size = isGoSize(wanted.goSize) ? wanted.goSize : defaultGoSize;
    const ruleset = isGoRuleset(wanted.goRuleset) ? wanted.goRuleset : defaultGoRuleset;
    // a hook game is always even, but the stones stay held for when the window goes back to a challenge
    const handicap = isHandicap(wanted.handicap) ? wanted.handicap : 0;
    const effective = this.gameType === 'friend' ? handicap : 0;
    // a komi that was only the ruleset's or the stones' own follows the stones the game now has
    const own = wanted.goKomi === standardKomi(ruleset) || (wanted.goKomi === handicapKomi && handicap > 0);
    const komi =
      typeof wanted.goKomi === 'number' && validKomi(wanted.goKomi, size)
        ? own && forced.goKomi === undefined
          ? komiFor(ruleset, effective)
          : wanted.goKomi
        : komiFor(ruleset, effective);
    this.goSize = this.propWithApply(size);
    this.goRuleset = this.propWithApply(ruleset);
    this.goKomi = this.propWithApply(komi);
    this.handicap = this.propWithApply(handicap);
    const canChangeTimeMode = !!this.root.me || this.gameType !== 'hook';
    // a guest's open game is real time only, whatever the shared store last held
    const timeMode = forceOptions?.timeMode || storeProps.timeMode;
    this.timeControl = timeControlFromStoredValues(
      propWithEffect(
        canChangeTimeMode || timeMode === 'realTime' ? timeMode : 'realTime',
        this.onDropdownChange,
      ),
      canChangeTimeMode ? timeModes : ['realTime'],
      forceOptions?.time ?? storeProps.time,
      forceOptions?.increment ?? storeProps.increment,
      forceOptions?.days ?? storeProps.days,
      forceOptions?.periods ?? storeProps.periods ?? defaultPeriods,
      forceOptions?.periodTime ?? storeProps.periodTime ?? defaultPeriodTime,
      this.onPropChange,
      fischerPresets(this.root.pools),
    );
    this.gameMode = this.propWithApply(forceOptions?.mode ?? storeProps.gameMode);
    this.ratingMin = this.propWithApply(storeProps.ratingMin);
    this.ratingMax = this.propWithApply(storeProps.ratingMax);
    this.color(forceOptions?.color || storeProps.color || 'random');

    this.enforcePropRules();
    // Upon loading the props from the store, overriding with forced options, and enforcing rules,
    // immediately save them to the store. This way, the user can know that whatever they saw last
    // in the modal will be there when they open it at a later time.
    this.savePropsToStore();
  };

  private readonly enforcePropRules = () => {
    // reassign with this.propWithApply in this function to avoid calling this.onPropChange

    if (this.gameMode() === 'rated' && this.ratedModeDisabled()) {
      this.gameMode = this.propWithApply('casual');
    }

    // whole ranks (unit 5.7); a value stored in rating points before that becomes the widest range
    this.ratingMin = this.propWithApply(clampSteps(this.ratingMin(), -1));
    this.ratingMax = this.propWithApply(clampSteps(this.ratingMax(), 1));
    if (this.ratingMin() === 0 && this.ratingMax() === 0) {
      this.ratingMax = this.propWithApply(1);
    }
  };

  private readonly savePropsToStore = (override: Partial<SetupStore> = {}) => {
    if (!this.gameType) return;

    // stones that are only a suggestion stay out of the store, and so does the komi they brought
    const kept = this.suggestedStones ? this.store().handicap : this.handicap();
    const komi =
      this.suggestedStones && this.goKomi() === komiFor(this.goRuleset(), this.handicap())
        ? komiFor(this.goRuleset(), kept)
        : this.goKomi();
    this.store({
      goSize: this.goSize(),
      goRuleset: this.goRuleset(),
      goKomi: komi,
      timeMode: this.timeControl.mode(),
      time: this.timeControl.time(),
      increment: this.timeControl.increment(),
      days: this.timeControl.days(),
      periods: this.timeControl.periods(),
      periodTime: this.timeControl.periodTime(),
      handicap: kept,
      gameMode: this.gameMode(),
      color: this.color(),
      ratingMin: this.ratingMin(),
      ratingMax: this.ratingMax(),
      ...override,
    });
  };

  private readonly savePropsToStoreExceptRating = () =>
    this.gameType &&
    this.savePropsToStore({
      ratingMin: this.store().ratingMin,
      ratingMax: this.store().ratingMax,
    });

  private readonly goRating = (): number | undefined => this.root.data.ratingMap?.[goPerf];
  myRating = () => {
    const rating = this.goRating();
    return rating === undefined ? undefined : Math.abs(rating);
  };
  isProvisional = () => (this.goRating() ?? -1) < 0;

  private readonly onPropChange = () => {
    if (this.isProvisional()) this.savePropsToStoreExceptRating();
    else this.savePropsToStore();
    this.root.redraw();
  };

  private readonly onDropdownChange = () => {
    // Handle rating update here
    this.enforcePropRules();
    if (this.isProvisional()) {
      this.ratingMin(-maxRankSteps);
      this.ratingMax(maxRankSteps);
      this.savePropsToStoreExceptRating();
    } else {
      if (this.gameType) {
        this.ratingMin(this.store().ratingMin);
        this.ratingMax(this.store().ratingMax);
      }
      this.savePropsToStore();
    }
    this.root.redraw();
  };

  private readonly propWithApply = <A>(value: A) => propWithEffect(value, this.onPropChange);

  // `start` is where the window begins when nothing else says: a clock (the open-challenges tab's two
  // buttons) or the Rated/Casual choice of the lobby's chips, which only counts until the player has
  // settings of their own.
  openModal = (
    gameType: Exclude<GameType, 'local'>,
    forceOptions?: ForceSetupOptions,
    friendUser?: string,
    start?: { timeMode?: TimeMode; gameMode?: GameMode },
  ) => {
    this.root.leavePool();
    this.gameType = gameType;
    this.loading = false;
    this.namedUser = friendUser || '';
    this.friendUser = gameType === 'friend' ? this.namedUser : '';
    this.forced = forceOptions;
    this.handicapAdvice = undefined;
    this.handicapTouched = false;
    this.advancedChoice = undefined;
    const begin: Partial<SetupStore> = {
      // a live list keeps a stored byo-yomi clock: both are live
      ...(start?.timeMode &&
        !(start.timeMode === 'realTime' && this.store().timeMode === 'byoyomi') && {
          timeMode: start.timeMode,
        }),
      ...(!this.remembered && start?.gameMode && { gameMode: start.gameMode }),
    };
    if (Object.keys(begin).length) this.store({ ...this.store(), ...begin });
    this.loadPropsFromStore(forceOptions);
    this.remembered = true;
    this.openedWith = this.store();
    if (this.namedUser && this.root.me) this.fetchHandicapAdvice(this.namedUser);
  };

  // ---- the opponent choice (unit 6.8) ----

  opponent = (): 'anyone' | 'link' | 'named' =>
    this.gameType === 'hook' ? 'anyone' : this.friendUser ? 'named' : 'link';

  // Switching keeps every setting; a hook game is even, so the stones are held, not sent.
  setOpponent = (kind: 'anyone' | 'link' | 'named') => {
    if (!this.gameType || kind === this.opponent() || (kind === 'named' && !this.namedUser)) return;
    this.savePropsToStore();
    this.gameType = kind === 'anyone' ? 'hook' : 'friend';
    this.friendUser = kind === 'named' ? this.namedUser : '';
    // a clock the link fixed that an open game can't have would leave the button disabled for no reason
    if (kind === 'anyone' && this.forced?.timeMode && !this.root.me && this.forced.timeMode !== 'realTime')
      this.forced = { ...this.forced, timeMode: undefined };
    this.loadPropsFromStore();
    this.followSuggestion();
    this.root.redraw();
  };

  // the stones this window really plays with: a hook game is always even
  effectiveHandicap = (): number => (this.gameType === 'friend' ? this.handicap() : 0);

  // ---- presets (unit 6.8) ----

  private readonly clock = () => {
    const tc = this.timeControl;
    return {
      goSize: this.goSize(),
      timeMode: tc.mode(),
      time: tc.time(),
      increment: tc.increment(),
      days: tc.days(),
      periods: tc.periods(),
      periodTime: tc.periodTime(),
    };
  };

  // The last settings, then ADR 0005's tiles as the server has them. A guest's open game has no
  // correspondence preset.
  presets = (): Preset[] => customPresets(this.root.pools, this.root.corres, this.timeControl.modes);

  // "Last settings" lights only while the window still holds the settings it opened with
  lastActive = (): boolean => {
    const was = this.openedWith;
    const now = this.clock();
    return (
      !!was &&
      was.goSize === now.goSize &&
      was.timeMode === now.timeMode &&
      presetMatches({ id: '', label: '', detail: '', clock: was }, now) &&
      was.goRuleset === this.goRuleset() &&
      was.gameMode === this.gameMode() &&
      (this.suggestedStones || (was.handicap === this.handicap() && was.goKomi === this.goKomi()))
    );
  };

  // the preset that fits the window now, if any; none means "Last settings" or the player's own tuning
  activePreset = (): Preset | undefined => this.presets().find(p => presetMatches(p, this.clock()));

  applyPreset = (preset: Preset) => {
    if (!this.gameType) return;
    this.savePropsToStore();
    const ruleset = this.goRuleset();
    this.store({
      ...this.store(),
      ...presetFields(preset),
      goKomi: komiFor(ruleset, this.effectiveHandicap()),
    });
    this.loadPropsFromStore();
    this.followSuggestion();
    this.root.redraw();
  };

  // back to the settings the window opened with
  restoreLast = () => {
    if (!this.gameType || !this.openedWith) return;
    this.store({ ...this.openedWith });
    this.loadPropsFromStore();
    this.followSuggestion();
    this.root.redraw();
  };

  // ---- the advanced section (unit 6.8) ----

  // Why the section opens by itself: a link fixed one of its values, the settings can't be rated for a
  // reason in it, or a named opponent's suggestion is stones.
  advancedWanted = (): boolean =>
    this.forced?.goRuleset !== undefined ||
    this.forced?.goKomi !== undefined ||
    this.forced?.handicap !== undefined ||
    !!this.ratedProblem() ||
    (this.opponent() === 'named' && (this.stoneAdvice()?.suggested ?? 0) > 0);

  advancedOpen = (): boolean => this.advancedChoice ?? this.advancedWanted();

  advancedDigest = (): string => {
    const range = this.opponent() === 'anyone' ? this.rankRange() : undefined;
    return advancedDigest({
      ruleset: this.goRuleset(),
      komi: this.goKomi(),
      handicap: this.effectiveHandicap(),
      range: range && { from: range.from, to: range.to },
    });
  };

  private readonly fetchHandicapAdvice = async (username: string) => {
    try {
      const advice: HandicapAdvice = await xhr.json(`/setup/go-handicap/${encodeURIComponent(username)}`);
      if (this.namedUser !== username) return;
      this.handicapAdvice = advice;
      const stones = this.stoneAdvice();
      // a rated challenge with stones starts from the suggestion when they are outside the allowed range;
      // an even game is always allowed, and stones a challenge link fixed stay as they are
      if (
        this.gameMode() === 'rated' &&
        stones &&
        this.forced?.handicap === undefined &&
        this.effectiveHandicap() > 0 &&
        (this.handicap() < stones.min || this.handicap() > stones.max)
      )
        this.setHandicap(stones.suggested);
      this.followSuggestion();
      this.root.redraw();
    } catch (_) {
      // without advice the form still works; the server checks a rated handicap when it is sent
    }
  };

  // A named opponent's suggestion fills the stones, and follows the board size, until the player picks
  // the stones themselves; stones a link fixed are never replaced.
  private readonly followSuggestion = () => {
    if (this.opponent() !== 'named' || this.handicapTouched || this.forced?.handicap !== undefined) return;
    const stones = this.stoneAdvice();
    const wanted = stones ? stones.suggested : 0;
    if (wanted === this.handicap()) return;
    this.suggestedStones = true;
    this.setHandicap(wanted);
  };

  // the player's own pick of the stones
  chooseHandicap = (handicap: number) => {
    this.handicapTouched = true;
    this.suggestedStones = false;
    this.setHandicap(handicap);
  };

  // the suggestion for the chosen board, when the window challenges a named player
  stoneAdvice = (): StoneAdvice | undefined => {
    const size = this.goSize();
    return size === 13 ? undefined : this.handicapAdvice?.[size];
  };

  // A rated handicap game's colours come from the ranks (ADR 0021 §4): the window shows them instead of
  // the colour buttons, and the server sets them.
  lockedColor = (): Color | undefined =>
    this.gameMode() === 'rated' && this.gameType === 'friend' && this.handicap() > 0 && this.handicapAdvice
      ? this.handicapAdvice.black
        ? 'black'
        : 'white'
      : undefined;

  // Why the chosen settings can't make a rated game (ADR 0021 §4–§5, unit 5.7), as the server would refuse.
  ratedProblem = (): string | undefined => {
    if (this.gameMode() !== 'rated') return undefined;
    const max = maxRatedHandicap(this.goSize());
    const handicap = this.effectiveHandicap();
    if (max === undefined || this.goKomi() !== komiFor(this.goRuleset(), handicap))
      return i18n.site.goRatedSetupRule;
    if (handicap === 0) return undefined;
    if (!this.friendUser) return i18n.site.goRatedHandicapNeedsOpponent;
    const advice = this.stoneAdvice();
    if (advice && (handicap < advice.min || handicap > advice.max))
      return i18n.site.goRatedStonesXToY(advice.min, advice.max);
    return handicap > max ? i18n.site.goRatedSetupRule : undefined;
  };

  closeModal?: () => void; // managed by view/setup/modal.ts

  // A new ruleset brings its own standard komi, as on the playground.
  setGoRuleset = (ruleset: GoRuleset) => {
    this.goKomi = this.propWithApply(komiFor(ruleset, this.effectiveHandicap()));
    this.goRuleset(ruleset);
  };

  // Handicap stones bring the server's komi of 0.5, and no stones bring the ruleset's standard komi back.
  setHandicap = (handicap: number) => {
    if (!isHandicap(handicap)) return;
    this.goKomi = this.propWithApply(komiFor(this.goRuleset(), this.gameType === 'friend' ? handicap : 0));
    this.handicap(handicap);
  };

  // A new size keeps the komi when it still fits the board, and otherwise resets it.
  setGoSize = (size: GoSize) => {
    if (!validKomi(this.goKomi(), size))
      this.goKomi = this.propWithApply(komiFor(this.goRuleset(), this.effectiveHandicap()));
    this.goSize(size);
    this.followSuggestion();
  };

  // Ignores what isn't a komi (a blank or half-typed field) rather than reading it as 0.
  setGoKomi = (value: string) => {
    const komi = value.trim() === '' ? NaN : Number(value);
    if (validKomi(komi, this.goSize())) this.goKomi(komi);
  };

  // Guests play casual games only (ADR 0021 §5): they see a sign-up line instead (gameModeButtons).
  ratedModeDisabled = () => !this.root.me;

  // the ranks the sliders cover, as ratings (ADR 0021 §3, unit 5.7)
  rankRange = (): RankRange | undefined => {
    const rating = this.myRating();
    const table = this.root.data.rankTable;
    return rating && table?.length ? rankRange(table, rating, this.ratingMin(), this.ratingMax()) : undefined;
  };

  ratingRange = (): string => {
    const range = this.rankRange();
    return range ? `${range.min}-${range.max}` : '';
  };

  hookToPoolMember = (color: ColorChoice): PoolMember | null => {
    const valid =
      color === 'random' &&
      this.gameType === 'hook' &&
      // pools play even Japanese games with standard komi (ADR 0022 §1), as the server checks
      this.effectiveHandicap() === 0 &&
      this.goRuleset() === defaultGoRuleset &&
      this.goKomi() === standardKomi(defaultGoRuleset) &&
      this.gameMode() === 'rated' &&
      this.timeControl.isLive();
    const tc = this.timeControl;
    const pool =
      valid &&
      poolForClock(
        this.root.pools,
        this.goSize(),
        tc.isByoyomi()
          ? {
              byo: {
                limit: tc.time() * 60,
                periods: tc.periods(),
                period: tc.periodTime(),
              },
            }
          : { lim: tc.time(), inc: tc.increment() },
      );
    return pool ? { id: pool.id, range: this.ratingRange() } : null;
  };

  propsToFormData = (color: ColorChoice) =>
    xhr.form({
      size: this.goSize().toString(),
      ruleset: this.goRuleset(),
      komi: this.goKomi().toString(),
      timeMode: timeModeId(this.timeControl.mode()),
      time: this.timeControl.time().toString(),
      increment: this.timeControl.increment().toString(),
      days: this.timeControl.days().toString(),
      ...(this.timeControl.isByoyomi() && {
        periods: this.timeControl.periods().toString(),
        periodTime: this.timeControl.periodTime().toString(),
      }),
      // the hook form has no handicap field: lobby games stay even
      ...(this.gameType === 'friend' && {
        handicap: this.handicap().toString(),
      }),
      mode: this.gameMode() === 'casual' ? '0' : '1',
      ratingRange: this.ratingRange(),
      color,
    });

  valid = () =>
    validKomi(this.goKomi(), this.goSize()) &&
    this.timeControl.valid(0) &&
    this.validConstraints() &&
    !this.ratedProblem();

  private readonly invalid = <A>(forced: A | undefined, current: A) =>
    forced !== undefined && forced !== current;

  private readonly validConstraints = () => {
    if (this.forced) {
      if (this.invalid(this.forced.timeMode, this.timeControl.mode())) return false;
      if (this.invalid(this.forced.color, this.color())) return false;
      if (
        this.timeControl.mode() === 'correspondence' &&
        this.invalid(this.forced.days, this.timeControl.days())
      )
        return false;
      if (this.timeControl.isLive()) {
        if (this.invalid(this.forced.time, this.timeControl.time())) return false;
      }
      if (this.timeControl.mode() === 'realTime') {
        if (this.invalid(this.forced.increment, this.timeControl.increment())) return false;
      }
      if (this.timeControl.isByoyomi()) {
        if (this.invalid(this.forced.periods, this.timeControl.periods())) return false;
        if (this.invalid(this.forced.periodTime, this.timeControl.periodTime())) return false;
      }
      if (this.gameType === 'friend' && this.invalid(this.forced.handicap, this.handicap())) return false;
    }
    return true;
  };

  submit = async () => {
    // a submitted game is the player's choice, stones included
    this.suggestedStones = false;
    this.savePropsToStore();
    const color = this.color();
    const poolMember = this.hookToPoolMember(color);
    if (poolMember) {
      this.root.enterPool(poolMember);
      this.closeModal?.();
      return;
    }

    if (this.gameType === 'hook') this.root.showOpen(this.timeControl.isLive() ? 'live' : 'correspondence');
    this.loading = true;
    this.root.redraw();

    let urlPath = `/setup/${this.gameType}`;
    if (this.gameType === 'hook') urlPath += `/${site.sri}`;
    const urlParams = { user: this.friendUser || undefined };
    let response;
    try {
      response = await xhr.textRaw(xhr.url(urlPath, urlParams), {
        method: 'post',
        body: this.propsToFormData(color),
      });
    } catch (_) {
      this.loading = false;
      this.root.redraw();
      await alert('Sorry, we encountered an error while creating your game. Please try again.');
      return;
    }

    const { ok, redirected, url } = response;

    if (!ok) {
      const errs: Record<string, string> = await response.json();
      await alert(
        errs
          ? Object.keys(errs)
              .map(k => `${k}: ${errs[k]}`)
              .join('\n')
          : 'Invalid setup',
      );
      if (response.status === 403) {
        // 403 FORBIDDEN closes this modal because challenges to the recipient
        // will not be accepted.  see friend() in controllers/Setup.scala
        this.closeModal?.();
      }
    } else if (redirected) {
      location.href = url;
    } else {
      this.loading = false;
      this.closeModal?.();
    }
  };
}
