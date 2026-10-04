import { clockToSpeed } from '@/game';

// strategygames' length estimate for a byo-yomi clock, as the server uses it: main time + 25 × every period
const byoyomiSpeed = (main: Seconds, periods: number, periodTime: Seconds) =>
  clockToSpeed(main + 25 * periods * periodTime, 0);
import { propWithEffect, type Prop } from '@/index';

import type { ClockConfig, InputValue, RealValue } from './interfaces';

export type TimeMode = 'realTime' | 'byoyomi' | 'correspondence' | 'unlimited';

// The server's timeMode ids (modules/setup TimeMode): 0 unlimited, 1 real time, 2 correspondence, 3 byo-yomi.
export const timeModeId = (mode: TimeMode): number =>
  ({ unlimited: 0, realTime: 1, correspondence: 2, byoyomi: 3 })[mode];

// Byo-yomi (unit 4.9): after the main time, a number of periods, each of a fixed number of seconds.
export const byoyomiPeriodTimes: number[] = [5, 10, 15, 20, 30, 40, 45, 60, 90, 120, 180, 300];
export const byoyomiPeriodChoices: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const defaultPeriods = 5;
export const defaultPeriodTime = 30;

export class TimeControl {
  constructor(
    readonly mode: Prop<TimeMode>,
    readonly modes: TimeMode[],
    // The following three quantities are suffixed with 'V' to draw attention to the
    // fact that they are not the true quantities. They represent the value of the
    // input element. Use time(), increment(), and days() below for the true quantities.
    readonly timeV: Prop<InputValue>,
    readonly incrementV: Prop<InputValue>,
    readonly daysV: Prop<InputValue>,
    // Byo-yomi: periodsV is the number of periods itself (1..10), periodTimeV an index into byoyomiPeriodTimes.
    readonly periodsV: Prop<InputValue>,
    readonly periodTimeV: Prop<InputValue>,
    readonly presets: ClockConfig[],
  ) {}

  time: () => RealValue = () => timeVToTime(this.timeV());
  increment: () => RealValue = () => incrementVToIncrement(this.incrementV());
  days: () => RealValue = () => daysVToDays(this.daysV());

  periods: () => RealValue = () => this.periodsV();
  periodTime: () => RealValue = () => periodTimeVToSeconds(this.periodTimeV());

  isRealTime = (): boolean => this.mode() === 'realTime';
  isByoyomi = (): boolean => this.mode() === 'byoyomi';
  // Real time and byo-yomi games both run on a clock the players watch live.
  isLive = (): boolean => this.isRealTime() || this.isByoyomi();

  realTimeValid = (minimumTime = 0): boolean =>
    this.time() >= minimumTime && (this.time() > 0 || this.increment() > 0);

  // Byo-yomi always has time to play: every period is at least 5 seconds, and there is at least one.
  byoyomiValid = (minimumTime = 0): boolean =>
    this.time() >= minimumTime &&
    byoyomiPeriodChoices.includes(this.periods()) &&
    byoyomiPeriodTimes.includes(this.periodTime());

  valid = (minimumTimeIfReal = 0): boolean =>
    this.isRealTime()
      ? this.realTimeValid(minimumTimeIfReal)
      : this.isByoyomi()
        ? this.byoyomiValid(minimumTimeIfReal)
        : true;

  initialSeconds = (): Seconds => this.time() * 60;

  notForRatedVariant = (): boolean =>
    !this.isRealTime() ||
    (this.time() < 0.5 && this.increment() === 0) ||
    (this.time() === 0 && this.increment() < 2);

  clockStr = (): string =>
    this.isByoyomi()
      ? `${this.time()}+${this.periods()}×${this.periodTime()}s`
      : `${this.time()}+${this.increment()}`;

  speed = (): Speed =>
    this.isRealTime()
      ? clockToSpeed(this.initialSeconds(), this.increment())
      : this.isByoyomi()
        ? byoyomiSpeed(this.initialSeconds(), this.periods(), this.periodTime())
        : 'correspondence';

  canSelectMode = (): boolean => this.modes.length > 1;
}

export const timeControlFromStoredValues = (
  mode: Prop<TimeMode>,
  modes: TimeMode[],
  time: RealValue,
  inc: RealValue,
  days: RealValue,
  periods: RealValue,
  periodTime: RealValue,
  onChange: () => void,
  presets: ClockConfig[],
): TimeControl =>
  new TimeControl(
    mode,
    modes,
    propWithEffect(sliderInitVal(time, timeVToTime, 100, 14), onChange),
    propWithEffect(sliderInitVal(inc, incrementVToIncrement, 100, 5), onChange),
    propWithEffect(sliderInitVal(days, daysVToDays, 20, 7), onChange),
    propWithEffect(byoyomiPeriodChoices.includes(periods) ? periods : defaultPeriods, onChange),
    propWithEffect(
      byoyomiPeriodTimes.indexOf(byoyomiPeriodTimes.includes(periodTime) ? periodTime : defaultPeriodTime),
      onChange,
    ),
    presets,
  );

// In the order the setup window lists them (the server's ids are `timeModeId`).
export const timeModes: TimeMode[] = ['unlimited', 'realTime', 'byoyomi', 'correspondence'];

export const periodTimeVToSeconds = (v: InputValue): RealValue => byoyomiPeriodTimes[v] ?? defaultPeriodTime;

// When we store timeV, incrementV, and daysV in local storage, we save the actual time, increment,
// and days, and not the value of the input element. We use this function to recompute the value of the
// input element.
export const sliderInitVal = (
  v: RealValue,
  f: (x: InputValue) => RealValue,
  max: InputValue,
  defaultVal: InputValue,
): InputValue => {
  for (let i = 0; i < max; i++) {
    if (f(i) === v) return i;
  }
  return defaultVal;
};

export const sliderTimes: number[] = [
  0,
  1 / 4,
  1 / 2,
  3 / 4,
  1,
  3 / 2,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  25,
  30,
  35,
  40,
  45,
  60,
  75,
  90,
  105,
  120,
  135,
  150,
  165,
  180,
];

export const timeVToTime = (v: InputValue): RealValue => (v < sliderTimes.length ? sliderTimes[v] : 180);

export const incrementVToIncrement = (v: InputValue): RealValue => {
  if (v <= 20) return v;
  switch (v) {
    case 21:
      return 25;
    case 22:
      return 30;
    case 23:
      return 35;
    case 24:
      return 40;
    case 25:
      return 45;
    case 26:
      return 60;
    case 27:
      return 90;
    case 28:
      return 120;
    case 29:
      return 150;
    default:
      return 180;
  }
};

export const daysVToDays = (v: InputValue): RealValue => {
  if (v <= 3) return v;
  switch (v) {
    case 4:
      return 5;
    case 5:
      return 7;
    case 6:
      return 10;
    default:
      return 14;
  }
};
