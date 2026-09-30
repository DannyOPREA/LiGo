// The Go options of a new game (unit 3.19): board size, ruleset and komi, as the setup forms send them
// (unit 3.15's `size`, `ruleset` and `komi` fields) and as hooks and seeks show them (their `go` block).
// Handicap comes in unit 4.9.

export type GoSize = 9 | 13 | 19;
export type GoRuleset = 'japanese' | 'chinese';

export interface GoSetupJson {
  size: GoSize;
  rules: GoRuleset;
  komi: number;
  handicap?: number;
}

export const goSizes: GoSize[] = [19, 13, 9];
export const goRulesets: GoRuleset[] = ['japanese', 'chinese'];

export const defaultGoSize: GoSize = 19;
export const defaultGoRuleset: GoRuleset = 'japanese';

// The server's own rule (go-rules' `Komi.standard`, also libs/board's `standardKomi`) for an even game.
export const standardKomi = (ruleset: GoRuleset): number => (ruleset === 'chinese' ? 7.5 : 6.5);

// The server's own check (go-rules' `Komi.isValid`): a multiple of 0.5, no bigger than the board.
export const validKomi = (komi: number, size: GoSize): boolean =>
  Number.isFinite(komi) && (komi * 2) % 1 === 0 && Math.abs(komi) <= size * size;

export const isGoSize = (n: unknown): n is GoSize => goSizes.includes(n as GoSize);
export const isGoRuleset = (r: unknown): r is GoRuleset => goRulesets.includes(r as GoRuleset);

export const sizeName = (size: GoSize): string => `${size}×${size}`;
export const rulesetName = (ruleset: GoRuleset): string =>
  ruleset === 'chinese' ? i18n.site.goRulesChinese : i18n.site.goRulesJapanese;

// "19×19 · Japanese · Komi 6.5", for the lobby's lists.
export const goSetupName = (go: GoSetupJson): string =>
  [sizeName(go.size), rulesetName(go.rules), `${i18n.site.goKomi} ${go.komi}`].join(' · ');
