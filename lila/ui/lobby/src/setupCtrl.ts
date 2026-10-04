import { type Prop, propWithEffect } from 'lib';
import type { ColorChoice, ColorProp } from 'lib/setup/color';
import {
  timeModes,
  timeModeId,
  defaultPeriods,
  defaultPeriodTime,
  timeControlFromStoredValues,
  type TimeControl,
} from 'lib/setup/timeControl';
import { storedJsonProp } from 'lib/storage';
import { alert } from 'lib/view';
import * as xhr from 'lib/xhr';

import type LobbyController from './ctrl';
import {
  defaultGoRuleset,
  defaultGoSize,
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
  store: Record<GameType, Prop<SetupStore>>;
  gameType: GameType | null = null;
  friendUser = '';
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
    // Initialize stores with default props as necessary
    this.store = {
      hook: this.makeSetupStore('hook'),
      friend: this.makeSetupStore('friend'),
    };
  }

  // Namespace the store by username for user specific modal settings
  private readonly storeKey = (gameType: GameType) =>
    `lobby.setup.${this.root.me?.username || 'anon'}.${gameType}`;

  makeSetupStore = (gameType: GameType) =>
    storedJsonProp<SetupStore>(this.storeKey(gameType), () => ({
      goSize: defaultGoSize,
      goRuleset: defaultGoRuleset,
      goKomi: standardKomi(defaultGoRuleset),
      timeMode: gameType === 'hook' ? 'realTime' : 'unlimited',
      time: 5,
      increment: 3,
      days: 2,
      periods: defaultPeriods,
      periodTime: defaultPeriodTime,
      handicap: 0,
      gameMode: 'casual',
      color: 'random',
      ratingMin: -500,
      ratingMax: 500,
    }));

  private readonly loadPropsFromStore = (forceOptions?: ForceSetupOptions) => {
    const storeProps = this.store[this.gameType!]();
    // Load props from the store, but override any store values with values found in forceOptions
    // A store saved before unit 3.19 has no Go options, and a link (a reusable challenge) may set
    // them; a bad value gets the default.
    const wanted = { ...storeProps, ...definedOf(forceOptions) };
    const size = isGoSize(wanted.goSize) ? wanted.goSize : defaultGoSize;
    const ruleset = isGoRuleset(wanted.goRuleset) ? wanted.goRuleset : defaultGoRuleset;
    // only a friend game has handicap; a hook game is always even
    const handicap = this.gameType === 'friend' && isHandicap(wanted.handicap) ? wanted.handicap : 0;
    const komi =
      typeof wanted.goKomi === 'number' && validKomi(wanted.goKomi, size)
        ? wanted.goKomi
        : komiFor(ruleset, handicap);
    this.goSize = this.propWithApply(size);
    this.goRuleset = this.propWithApply(ruleset);
    this.goKomi = this.propWithApply(komi);
    this.handicap = this.propWithApply(handicap);
    const canChangeTimeMode = !!this.root.me || this.gameType !== 'hook';
    this.timeControl = timeControlFromStoredValues(
      propWithEffect(forceOptions?.timeMode || storeProps.timeMode, this.onDropdownChange),
      canChangeTimeMode ? timeModes : ['realTime'],
      forceOptions?.time ?? storeProps.time,
      forceOptions?.increment ?? storeProps.increment,
      forceOptions?.days ?? storeProps.days,
      forceOptions?.periods ?? storeProps.periods ?? defaultPeriods,
      forceOptions?.periodTime ?? storeProps.periodTime ?? defaultPeriodTime,
      this.onPropChange,
      this.root.pools,
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

    this.ratingMin = this.propWithApply(Math.min(0, this.ratingMin()));
    this.ratingMax = this.propWithApply(Math.max(0, this.ratingMax()));
    if (this.ratingMin() === 0 && this.ratingMax() === 0) {
      this.ratingMax = this.propWithApply(50);
    }
  };

  private readonly savePropsToStore = (override: Partial<SetupStore> = {}) => {
    if (!this.gameType) return;

    this.store[this.gameType]({
      goSize: this.goSize(),
      goRuleset: this.goRuleset(),
      goKomi: this.goKomi(),
      timeMode: this.timeControl.mode(),
      time: this.timeControl.time(),
      increment: this.timeControl.increment(),
      days: this.timeControl.days(),
      periods: this.timeControl.periods(),
      periodTime: this.timeControl.periodTime(),
      handicap: this.handicap(),
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
      ratingMin: this.store[this.gameType]().ratingMin,
      ratingMax: this.store[this.gameType]().ratingMax,
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
      this.ratingMin(-500);
      this.ratingMax(500);
      this.savePropsToStoreExceptRating();
    } else {
      if (this.gameType) {
        this.ratingMin(this.store[this.gameType]().ratingMin);
        this.ratingMax(this.store[this.gameType]().ratingMax);
      }
      this.savePropsToStore();
    }
    this.root.redraw();
  };

  private readonly propWithApply = <A>(value: A) => propWithEffect(value, this.onPropChange);

  openModal = (
    gameType: Exclude<GameType, 'local'>,
    forceOptions?: ForceSetupOptions,
    friendUser?: string,
  ) => {
    this.root.leavePool();
    this.gameType = gameType;
    this.loading = false;
    this.friendUser = friendUser || '';
    this.forced = forceOptions;
    this.loadPropsFromStore(forceOptions);
  };

  closeModal?: () => void; // managed by view/setup/modal.ts

  // A new ruleset brings its own standard komi, as on the playground.
  setGoRuleset = (ruleset: GoRuleset) => {
    this.goKomi = this.propWithApply(komiFor(ruleset, this.handicap()));
    this.goRuleset(ruleset);
  };

  // Handicap stones bring the server's komi of 0.5, and no stones bring the ruleset's standard komi back.
  setHandicap = (handicap: number) => {
    if (!isHandicap(handicap)) return;
    this.goKomi = this.propWithApply(komiFor(this.goRuleset(), handicap));
    this.handicap(handicap);
  };

  // A new size keeps the komi when it still fits the board, and otherwise resets it.
  setGoSize = (size: GoSize) => {
    if (!validKomi(this.goKomi(), size))
      this.goKomi = this.propWithApply(komiFor(this.goRuleset(), this.handicap()));
    this.goSize(size);
  };

  // Ignores what isn't a komi (a blank or half-typed field) rather than reading it as 0.
  setGoKomi = (value: string) => {
    const komi = value.trim() === '' ? NaN : Number(value);
    if (validKomi(komi, this.goSize())) this.goKomi(komi);
  };

  // Go games are casual until ratings arrive (unit 5.7); the server refuses a rated one (unit 3.15).
  ratedModeDisabled = () => true;

  ratingRange = (): string => {
    const rating = this.myRating();
    return rating ? `${Math.max(100, rating + this.ratingMin())}-${rating + this.ratingMax()}` : '';
  };

  hookToPoolMember = (color: ColorChoice): PoolMember | null => {
    const valid =
      color === 'random' &&
      this.gameType === 'hook' &&
      // pools play 19×19 Japanese games with standard komi (ADR 0022 §1), as the server checks
      this.goSize() === defaultGoSize &&
      this.goRuleset() === defaultGoRuleset &&
      this.goKomi() === standardKomi(defaultGoRuleset) &&
      this.gameMode() === 'rated' &&
      this.timeControl.isRealTime();
    const id = this.timeControl.clockStr();
    return valid && this.root.pools.some(p => p.id === id)
      ? {
          id,
          range: this.ratingRange(),
        }
      : null;
  };

  propsToFormData = (color: ColorChoice) =>
    xhr.form({
      variant: 1, // standard: the only value the server takes until unit 3.17 drops the field
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
      ...(this.gameType === 'friend' && { handicap: this.handicap().toString() }),
      mode: this.gameMode() === 'casual' ? '0' : '1',
      ratingRange: this.ratingRange(),
      color,
    });

  valid = () =>
    validKomi(this.goKomi(), this.goSize()) && this.timeControl.valid(0) && this.validConstraints();

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
