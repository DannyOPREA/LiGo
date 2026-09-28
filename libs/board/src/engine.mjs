// LiGo's settings for OGS goban-engine, the browser's Go rules (memo 1.2, spec §9 "Engine
// mapping"). The board (Phase 2) and this unit's tests build every engine through `createEngine`
// or `readSgf`, so goban's own rule presets never decide a LiGo game.
// Licence: MIT (LiGo's own code, ADR 0006). goban-engine: Apache-2.0 (COPYING.md).

import gobanEngine from "goban-engine";

import { LIGO_RULES, SIZES, gameConfig, refusalOf, stateOf, toXY } from "./rules.mjs";

const { GobanEngine, GobanMoveError } = gobanEngine;

export { stateOf };

/**
 * A new game engine, with LiGo's rules (rules.mjs `gameConfig`).
 *
 * @param {object} game
 * @param {9|13|19} game.size
 * @param {"japanese"|"chinese"} game.ruleset
 * @param {number} game.komi always explicit: goban's own default differs from LiGo's (R-KOMI)
 * @param {number} [game.handicap] 0–9; the stones themselves come in `stones`, as the server placed them
 * @param {{black: string[], white: string[]}} [game.stones] the starting stones, as SGF points
 * @param {"black"|"white"} [game.toMove] who plays first
 */
export function createEngine(game) {
  return new GobanEngine(gameConfig(game));
}

/**
 * Plays a move: an SGF point such as `"dd"`, or `"pass"`.
 *
 * @returns {null | "occupied" | "suicide" | "superko"} null when played, else why it was refused
 *   (the position is then unchanged)
 */
export function play(engine, move) {
  const { x, y } = toXY(engine, move);
  try {
    engine.place(x, y, true, true);
    return null;
  } catch (e) {
    const refused = e instanceof GobanMoveError ? refusalOf(e) : undefined;
    if (refused) return refused;
    throw e;
  }
}

/**
 * Whether a move would be accepted, and if not why, without changing the position. An accepted
 * probe is taken back and its node removed from goban's move tree, so the game record only holds
 * moves really played.
 */
export function tryMove(engine, move) {
  const here = engine.cur_move;
  const children = new Set([here.trunk_next, ...here.branches].filter(Boolean));
  const refused = play(engine, move);
  if (!refused) {
    const probe = engine.cur_move;
    engine.jumpTo(here);
    if (!children.has(probe)) probe.remove();
  }
  return refused;
}

/**
 * Reads an SGF record's main line into an engine with LiGo's settings. goban's SGF reader ignores
 * the board size, komi and player to move (memo 1.2, point 7), so they are read here and handed to
 * it. goban never throws on a broken record (it logs and keeps what it read) and turns a move out
 * of turn into an edit, silently; both are refused here.
 */
export function readSgf(sgf) {
  const root = rootProperties(sgf);
  const size = Number(root.SZ ?? 19);
  if (!SIZES.includes(size)) throw new Error(`board size ${size}: LiGo plays 9, 13 or 19`);
  const ruleset = RULESETS[(root.RU ?? "japanese").toLowerCase()];
  if (!ruleset) throw new Error(`ruleset ${root.RU}: LiGo plays Japanese or Chinese rules`);
  const engine = withoutGobanLogs(
    () =>
      new GobanEngine({
        width: size,
        height: size,
        rules: ruleset,
        komi: Number(root.KM ?? 0),
        ...LIGO_RULES,
        handicap: Number(root.HA ?? 0),
        ...(root.PL ? { initial_player: root.PL === "W" ? "white" : "black" } : {}),
        original_sgf: sgf,
      }),
  );
  // goban leaves an SGF game at the end of its main line (the first variation at each branch);
  // make sure of it, and go back from "finished" (goban's phase for records) to play.
  let last = engine.move_tree;
  while (last.trunk_next ?? last.branches?.[0]) last = last.trunk_next ?? last.branches[0];
  engine.jumpTo(last);
  engine.phase = "play";
  for (let n = last; n.parent; n = n.parent)
    if (n.edited) throw new Error(`SGF move ${n.move_number} is not a move by the player to move`);
  return engine;
}

const RULESETS = { japanese: "japanese", jp: "japanese", chinese: "chinese", cn: "chinese", zh: "chinese" };

/** Runs `f`, turning the errors goban's SGF reader only logs ("Failed to parse SGF ...") into a throw. */
function withoutGobanLogs(f) {
  const { log, error } = console;
  const logged = [];
  console.log = console.error = (...args) => logged.push(args.map(String).join(" "));
  try {
    const result = f();
    const failure = logged.find((l) => /Failed to parse SGF|Error loading SGF/.test(l));
    if (failure) throw new Error(`not a readable SGF record: ${failure}`);
    return result;
  } finally {
    console.log = log;
    console.error = error;
  }
}

/** The root node's properties (first value of each), e.g. { SZ: "9", KM: "6.5", PL: "W" }. */
function rootProperties(sgf) {
  const start = sgf.indexOf(";");
  if (start < 0) throw new Error("not an SGF record");
  const props = {};
  const re = /\s*([A-Z]+)((?:\s*\[(?:\\.|[^\]\\])*\])+)/y;
  re.lastIndex = start + 1;
  for (let m; (m = re.exec(sgf)); ) props[m[1]] ??= /\[((?:\\.|[^\]\\])*)\]/.exec(m[2])[1];
  return props;
}

