// LiGo's Go rule settings and board reading for OGS goban (memo 1.2, spec §9 "Engine mapping"),
// shared by the rules engine (engine.mjs, goban-engine) and the board (board.ts, goban's renderer,
// which carries its own copy of the same engine). Nothing here imports goban, so the browser
// bundle gets goban's engine only once.
// Licence: MIT (LiGo's own code, ADR 0006).

/**
 * A game as the server describes it.
 *
 * @typedef {object} Game
 * @property {9|13|19} size
 * @property {"japanese"|"chinese"} ruleset
 * @property {number} komi always explicit: goban's own default differs from LiGo's (R-KOMI)
 * @property {number} [handicap] 0–9; the stones themselves come in `stones`, as the server placed them
 * @property {{black: string[], white: string[]}} [stones] the starting stones, as SGF points
 * @property {"black"|"white"} [toMove] who plays first
 */

/**
 * What the board shows.
 *
 * @typedef {object} BoardState
 * @property {string[]} board rows of `.XO`, top row first
 * @property {"black"|"white"} toMove
 * @property {{black: number, white: number}} captures the stones each player has captured
 * @property {string | null} koPoint the point the ko rule forbids next (R-KO-4), as an SGF point
 */

export const SIZES = [9, 13, 19];
const BLACK = 1;
const WHITE = 2;

// R-HCP-4's fixed placements, for the two sizes the spec defines them on (9×9 and 19×19; 13×13
// has none yet, R-SCOPE-1). goban's own table is checked against this one in engine.test.mjs.
const HANDICAP = {
  9: ["gc", "cg", "gg", "cc", "ee", "ce", "ge", "ec", "eg"],
  19: ["pd", "dp", "pp", "dd", "jj", "dj", "pj", "jd", "jp"],
};

/**
 * The handicap stones for N stones on a board size R-HCP-4 defines them on (9×9, 19×19). Throws
 * for a size with no table (13×13).
 *
 * @param {9 | 13 | 19} size
 * @param {number} n
 * @returns {string[]}
 */
export function handicapStones(size, n) {
  if (n < 2) return []; // R-HCP-2: one stone of handicap is no stone, Black moves first
  const t = HANDICAP[size];
  if (!t) throw new Error(`no handicap table for ${size}x${size}`);
  const [corners, centre, sides] = [t.slice(0, 4), t[4], t.slice(5)];
  if (n <= 4) return corners.slice(0, n);
  if (n % 2 === 1) return [...handicapStones(size, n - 1), centre];
  return [...corners, ...sides.slice(0, n - 4)];
}

/**
 * R-KOMI: 6.5 Japanese, 7.5 Chinese in even games, 0.5 with any handicap (R-KOMI-1, R-KOMI-2).
 * Chinese handicap compensation (R-KOMI-3) is separate (goban reads it from `handicap`, see
 * `gameConfig` below); this is the komi value itself.
 *
 * @param {"japanese" | "chinese"} ruleset
 * @param {number} handicap
 * @returns {number}
 */
export const standardKomi = (ruleset, handicap) => (handicap > 0 ? 0.5 : ruleset === "chinese" ? 7.5 : 6.5);

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
export const LIGO_RULES = /** @type {const} */ ({
  allow_ko: false,
  allow_superko: false,
  superko_algorithm: "ssk",
  allow_self_capture: false,
  free_handicap_placement: false,
  throw_all_errors: true,
});

/**
 * The goban settings of a new LiGo game: LiGo's rules (above), the board, komi and the starting
 * position, for goban-engine's `GobanEngine` and goban's renderers alike.
 *
 * @param {Game} game
 */
export function gameConfig({ size, ruleset, komi, handicap = 0, stones, toMove = "black" }) {
  if (!SIZES.includes(size)) throw new Error(`board size ${size}: LiGo plays 9, 13 or 19`);
  if (ruleset !== "japanese" && ruleset !== "chinese") throw new Error(`ruleset ${ruleset}`);
  if (typeof komi !== "number") throw new Error("komi must be given");
  return {
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
  };
}

/**
 * Why goban refused a move, as the fixtures' reasons, or undefined when the error is not a
 * refusal (goban's `GobanMoveError` carries a `message_id`).
 *
 * @param {unknown} error
 * @returns {"occupied" | "suicide" | "superko" | undefined}
 */
export function refusalOf(error) {
  const id = /** @type {{message_id?: string} | null} */ (error)?.message_id;
  return id !== undefined && Object.hasOwn(REASONS, id) ? REASONS[id] : undefined;
}

/**
 * What the board shows: stones (rows of `.XO`, top row first), the player to move, the stones each
 * player has captured, and the ko point as R-KO-4 defines it (goban has none of its own).
 *
 * @param {any} engine a goban engine (goban-engine's, or the one inside goban's board)
 * @returns {BoardState}
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
 * An SGF point such as `"dd"`, or `"pass"`, as goban's coordinates ({ x: -1, y: -1 } for a pass).
 */
export function toXY(engine, move) {
  if (move === "pass") return { x: -1, y: -1 };
  if (!/^[a-s]{2}$/.test(move)) throw new Error(`bad move ${move}`);
  const x = move.charCodeAt(0) - 97;
  const y = move.charCodeAt(1) - 97;
  if (x >= engine.width || y >= engine.height) throw new Error(`${move} is off the board`);
  return { x, y };
}

export function toSgf({ x, y }) {
  return String.fromCharCode(97 + x, 97 + y);
}
