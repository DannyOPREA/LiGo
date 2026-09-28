// Reads the shared conformance fixtures (libs/conformance/README.md, "The format") and turns a
// case into what the client engine is given in a real game.
// Licence: MIT (LiGo's own code, ADR 0006).

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createEngine, play } from "../src/engine.mjs";

export const dir = fileURLToPath(new URL("../../conformance/fixtures/", import.meta.url));

export function all() {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => JSON.parse(readFileSync(dir + f, "utf8")).cases.map((c) => ({ file: f, ...c })));
}

export const forClient = () => all().filter((c) => c.appliesTo.includes("client"));

/** The rulesets a case runs under: its own, or both when it names none. */
export const rulesetsOf = (c) => (c.ruleset ? [c.ruleset] : ["japanese", "chinese"]);

// R-HCP-4's fixed placements. In a game the server sends its stones (strategygames places them);
// here they stand in for the server. goban's own table is checked against this one in engine.test.mjs.
const HANDICAP = {
  9: ["gc", "cg", "gg", "cc", "ee", "ce", "ge", "ec", "eg"],
  19: ["pd", "dp", "pp", "dd", "jj", "dj", "pj", "jd", "jp"],
};

/** The handicap stones for N stones (R-HCP-4). */
export function handicapStones(size, n) {
  if (n < 2) return []; // R-HCP-2: one stone of handicap is no stone, Black moves first
  const t = HANDICAP[size];
  if (!t) throw new Error(`no handicap table for ${size}x${size}`);
  const [corners, centre, sides] = [t.slice(0, 4), t[4], t.slice(5)];
  if (n <= 4) return corners.slice(0, n);
  if (n % 2 === 1) return [...handicapStones(size, n - 1), centre];
  return [...corners, ...sides.slice(0, n - 4)];
}

/** Rows of `.XO` as SGF points per colour. */
export function stonesOf(rows) {
  const stones = { black: [], white: [] };
  rows.forEach((line, y) =>
    [...line].forEach((ch, x) => {
      const p = String.fromCharCode(97 + x, 97 + y);
      if (ch === "X") stones.black.push(p);
      if (ch === "O") stones.white.push(p);
    }),
  );
  return stones;
}

/** R-KOMI: 6.5 Japanese, 7.5 Chinese in even games, 0.5 with any handicap (the server's Komi.standard). */
export const standardKomi = (ruleset, handicap) => (handicap > 0 ? 0.5 : ruleset === "chinese" ? 7.5 : 6.5);

/** The engine for a case at its start, set up as a game would be. */
export function engineFor(c, ruleset) {
  const handicap = c.handicap ?? 0;
  const komi = c.komi ?? standardKomi(ruleset, handicap);
  if (c.setup) {
    return createEngine({ size: c.size, ruleset, komi, handicap, stones: stonesOf(c.setup.board), toMove: c.setup.toMove });
  }
  const black = handicapStones(c.size, handicap);
  return createEngine({
    size: c.size,
    ruleset,
    komi,
    handicap,
    stones: { black, white: [] },
    toMove: black.length ? "white" : "black",
  });
}

/** Plays a case's moves; throws on the first refused one. */
export function playMoves(engine, c) {
  c.moves.forEach((m, i) => {
    const refused = play(engine, m);
    if (refused) throw new Error(`move ${i + 1} (${m}) refused: ${refused}`);
  });
  return engine;
}
