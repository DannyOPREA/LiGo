// LiGo's settings for OGS goban-engine, the browser's Go rules (memo 1.2, spec §9 "Engine
// mapping"). The board (Phase 2) and this unit's tests build every engine through `createEngine`
// or `readSgf`, so goban's own rule presets never decide a LiGo game.
// Licence: MIT (LiGo's own code, ADR 0006). goban-engine: Apache-2.0 (COPYING.md).

import gobanEngine from "goban-engine";

const { GobanEngine, GobanMoveError } = gobanEngine;

const SIZES = [9, 13, 19];
const BLACK = 1;
const WHITE = 2;

/** goban's move errors, as the conformance fixtures' refusal reasons (libs/conformance/README.md). */
const REASONS = {
  stone_already_placed_here: "occupied",
  illegal_self_capture: "suicide",
  // Simple ko is a case of superko in LiGo (R-KO-4); goban reports it first when both apply.
  illegal_ko_move: "superko",
  illegal_board_repetition: "superko",
};

/**
 * The rule settings every LiGo engine gets, whatever goban's preset for the ruleset says:
 * situational superko in both rulesets (R-KO-1, ADR 0003), suicide never allowed (R-MOVE-5), and
 * the handicap stones always given as a position, never placed by goban (spec §9, "Handicap").
 */
const LIGO_RULES = {
  allow_ko: false,
  allow_superko: false,
  superko_algorithm: "ssk",
  allow_self_capture: false,
  free_handicap_placement: false,
  throw_all_errors: true,
};

/**
 * A new game engine.
 *
 * @param {object} game
 * @param {9|13|19} game.size
 * @param {"japanese"|"chinese"} game.ruleset
 * @param {number} game.komi always explicit: goban's own default differs from LiGo's (R-KOMI)
 * @param {number} [game.handicap] 0–9; the stones themselves come in `stones`, as the server placed them
 * @param {{black: string[], white: string[]}} [game.stones] the starting stones, as SGF points
 * @param {"black"|"white"} [game.toMove] who plays first
 */
export function createEngine({ size, ruleset, komi, handicap = 0, stones, toMove = "black" }) {
  if (!SIZES.includes(size)) throw new Error(`board size ${size}: LiGo plays 9, 13 or 19`);
  if (ruleset !== "japanese" && ruleset !== "chinese") throw new Error(`ruleset ${ruleset}`);
  if (typeof komi !== "number") throw new Error("komi must be given");
  return new GobanEngine({
    width: size,
    height: size,
    rules: ruleset,
    komi,
    ...LIGO_RULES,
    // goban reads `handicap` for Chinese compensation in its score count (spec §9); the stones
    // are placed from `initial_state`, so goban's own placement never runs.
    handicap,
    initial_state: { black: (stones?.black ?? []).join(""), white: (stones?.white ?? []).join("") },
    initial_player: toMove,
  });
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
    if (e instanceof GobanMoveError && REASONS[e.message_id]) return REASONS[e.message_id];
    throw e;
  }
}

/** Whether a move would be accepted, and if not why, without changing the position. */
export function tryMove(engine, move) {
  const here = engine.cur_move;
  const refused = play(engine, move);
  if (!refused) engine.jumpTo(here);
  return refused;
}

/**
 * What the board shows: stones (rows of `.XO`, top row first), the player to move, the stones each
 * player has captured, and the ko point as R-KO-4 defines it (goban has none of its own).
 */
export function stateOf(engine) {
  return {
    board: engine.board.map((row) => row.map((c) => (c === BLACK ? "X" : c === WHITE ? "O" : ".")).join("")),
    toMove: engine.colorToMove(),
    captures: { black: engine.black_prisoners, white: engine.white_prisoners },
    koPoint: koPointOf(engine),
  };
}

/** R-KO-4: after a move that captured exactly one stone with a lone stone left with one liberty. */
function koPointOf(engine) {
  const node = engine.cur_move;
  if (!node.parent || node.edited || node.x < 0) return null;
  const before = node.parent.state.board;
  const captured = [];
  for (let y = 0; y < engine.height; y++)
    for (let x = 0; x < engine.width; x++)
      if (before[y][x] !== 0 && engine.board[y][x] === 0) captured.push({ x, y });
  if (captured.length !== 1) return null;
  const color = engine.board[node.y][node.x];
  const around = neighbours(engine, node.x, node.y);
  if (around.some((p) => engine.board[p.y][p.x] === color)) return null; // not a lone stone
  if (around.filter((p) => engine.board[p.y][p.x] === 0).length !== 1) return null;
  return toSgf(captured[0]);
}

function neighbours(engine, x, y) {
  return [
    { x: x - 1, y },
    { x: x + 1, y },
    { x, y: y - 1 },
    { x, y: y + 1 },
  ].filter((p) => p.x >= 0 && p.y >= 0 && p.x < engine.width && p.y < engine.height);
}

/**
 * Reads an SGF record's main line into an engine with LiGo's settings. goban's SGF reader ignores
 * the board size, komi and player to move (memo 1.2, point 7), so they are read here and handed to
 * it. Every move must be a real move by the colour to move: goban would otherwise turn it into an
 * edit, silently.
 */
export function readSgf(sgf) {
  const root = rootProperties(sgf);
  const size = Number(root.SZ ?? 19);
  if (!SIZES.includes(size)) throw new Error(`board size ${size}: LiGo plays 9, 13 or 19`);
  const ruleset = /^(chinese|cn|zh)$/i.test(root.RU ?? "") ? "chinese" : "japanese";
  const engine = new GobanEngine({
    width: size,
    height: size,
    rules: ruleset,
    komi: Number(root.KM ?? 0),
    ...LIGO_RULES,
    handicap: Number(root.HA ?? 0),
    ...(root.PL ? { initial_player: root.PL === "W" ? "white" : "black" } : {}),
    original_sgf: sgf,
  });
  // goban leaves an SGF game at the root with the phase "finished"; go to the end of the main line.
  let last = engine.move_tree;
  while (last.trunk_next ?? last.branches?.[0]) last = last.trunk_next ?? last.branches[0];
  engine.jumpTo(last);
  engine.phase = "play";
  for (let n = last; n.parent; n = n.parent)
    if (n.edited) throw new Error(`SGF move ${n.move_number} is not a move by the player to move`);
  return engine;
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

function toXY(engine, move) {
  if (move === "pass") return { x: -1, y: -1 };
  if (!/^[a-s]{2}$/.test(move)) throw new Error(`bad move ${move}`);
  const x = move.charCodeAt(0) - 97;
  const y = move.charCodeAt(1) - 97;
  if (x >= engine.width || y >= engine.height) throw new Error(`${move} is off the board`);
  return { x, y };
}

function toSgf({ x, y }) {
  return String.fromCharCode(97 + x, 97 + y);
}
