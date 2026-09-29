// SGF for the analysis board (ADR 0023 §1, §2, §5; unit 7.2): an SGF record read into a tree of
// lila-shaped nodes and written back. `@sabaki/sgf` does the text (parse and stringify); every move
// is replayed through goban-engine with LiGo's settings (`createEngine`, `play`), so a position is
// never taken from the file, and the root's settings follow the table shared with the server's
// reader, libs/conformance/sgf/root.json.
// Licence: MIT (LiGo's own code, ADR 0006). @sabaki/sgf: MIT (COPYING.md).

import sabaki from "@sabaki/sgf";

import { createEngine, play, stateOf } from "./engine.mjs";

/** The most text the analysis board and the server's import read (ADR 0023 §2). */
export const MAX_SGF_LENGTH = 200 * 1024;

/** The most nodes (moves and notes) a record may have: a reviewed pro game with variations is a few thousand. */
export const MAX_SGF_NODES = 10000;

/** Why a record can't be read. `move` is the move number (1 for the first move) when a move is the cause. */
export class SgfError extends Error {
  /**
   * @param {string} message
   * @param {number} [move]
   */
  constructor(message, move) {
    super(move ? `move ${move}: ${message}` : message);
    this.name = "SgfError";
    this.move = move;
  }
}

/**
 * The game settings an SGF root gives, as libs/conformance/sgf/root.json says. Throws an `SgfError`
 * naming the property that can't be used.
 *
 * @param {Record<string, string[]>} props the root node's properties (all values of each)
 * @param {"black"|"white"} [firstMove] the colour of the main line's first move
 */
export function rootSettings(props, firstMove) {
  const one = (id) => props[id]?.[0];
  if (one("GM") !== undefined && one("GM") !== "1") throw new SgfError(`GM[${one("GM")}] is not a game of Go`);
  const size = sizeOf(one("SZ"));
  const ruleName = (one("RU") ?? "").trim().toLowerCase();
  const ruleset = ruleName === "" ? "japanese" : RULESETS[ruleName];
  const komi = komiOf(one("KM"), ruleset ?? "japanese");
  const handicapText = (one("HA") ?? "0").trim() || "0";
  if (!/^\d+$/.test(handicapText) || Number(handicapText) > 9)
    throw new SgfError(`handicap HA[${handicapText}]: LiGo plays 0 to 9 stones`);
  const black = pointsOf(props.AB ?? [], size);
  const white = pointsOf(props.AW ?? [], size);
  if (black.some((p) => white.includes(p))) throw new SgfError("a setup point holds both colours");
  const pl = one("PL")?.trim().toUpperCase();
  const toMove =
    pl === "B" ? "black" : pl === "W" ? "white" : firstMove ?? (Number(handicapText) >= 2 ? "white" : "black");
  return {
    size,
    ruleset: ruleset ?? "japanese",
    komi,
    handicap: Number(handicapText),
    black,
    white,
    toMove,
    ...(ruleset ? {} : { rulesetUnknown: true }),
  };
}

const RULESETS = {
  japanese: "japanese",
  jp: "japanese",
  korean: "japanese",
  kr: "japanese",
  chinese: "chinese",
  cn: "chinese",
  zh: "chinese",
  aga: "chinese",
  nz: "chinese",
  "new zealand": "chinese",
  goe: "chinese",
  ing: "chinese",
};

function sizeOf(text) {
  const value = (text ?? "19").trim();
  const m = /^(\d+)(?::(\d+))?$/.exec(value);
  const size = m && (m[2] === undefined || m[2] === m[1]) ? Number(m[1]) : NaN;
  if (![9, 13, 19].includes(size)) throw new SgfError(`board size SZ[${value}]: the analysis board has 9×9, 13×13 and 19×19`);
  return size;
}

function komiOf(text, ruleset) {
  const value = (text ?? "").trim();
  if (value === "") return 0;
  if (!/^[+-]?\d{1,4}(\.\d+)?$/.test(value) || Math.abs(Number(value)) > 1000)
    throw new SgfError(`komi KM[${value}] is not a number of points LiGo can use`);
  let komi = Number(value);
  // Files from Chinese servers give komi in stones: 3.75 means 7.5 (ADR 0023 §2).
  const fraction = Math.abs(komi) % 1;
  if (ruleset === "chinese" && komi < 5 && (fraction === 0.25 || fraction === 0.75)) komi *= 2;
  if ((komi * 2) % 1 !== 0) throw new SgfError(`komi KM[${value}]: LiGo's komi is a multiple of 0.5`);
  return komi;
}

/** SGF points, with `aa:cc` rectangles expanded, checked to be on a board of `size`. */
function pointsOf(values, size) {
  const points = new Set();
  for (const value of values) {
    const parts = value.trim().split(":");
    const [from, to = from] = parts;
    if (parts.length > 2 || !isPoint(from, size) || !isPoint(to, size))
      throw new SgfError(`setup point [${value}] is off the board`);
    const [x1, x2] = [from.charCodeAt(0), to.charCodeAt(0)].sort((a, b) => a - b);
    const [y1, y2] = [from.charCodeAt(1), to.charCodeAt(1)].sort((a, b) => a - b);
    for (let x = x1; x <= x2; x++)
      for (let y = y1; y <= y2; y++) points.add(String.fromCharCode(x, y));
  }
  return [...points];
}

const isPoint = (p, size) =>
  /^[a-s]{2}$/.test(p ?? "") && p.charCodeAt(0) - 97 < size && p.charCodeAt(1) - 97 < size;

// Glyphs: SGF's move annotations and lila's glyph ids and names (lila's `Glyph` list).
const GLYPHS = {
  "TE:1": { id: 1, symbol: "!", name: "Good move" },
  "TE:2": { id: 3, symbol: "!!", name: "Brilliant move" },
  "BM:1": { id: 2, symbol: "?", name: "Mistake" },
  "BM:2": { id: 4, symbol: "??", name: "Blunder" },
  "IT:": { id: 5, symbol: "!?", name: "Interesting move" },
  "DO:": { id: 6, symbol: "?!", name: "Dubious move" },
};
const SETUP = ["AB", "AW", "AE"];
// Read into the node's own fields; every other property is kept in `sgf` and written back.
const READ = ["B", "W", "C", "TE", "BM", "IT", "DO", ...SETUP];
const READ_AT_ROOT = [...READ, "SZ", "KM", "RU", "HA", "PL", "GM", "FF", "CA"];
// Properties that hold a list of values (marks); any other kept property holds one.
const LISTS = ["TR", "SQ", "CR", "MA", "LB", "AR", "LN", "DD", "VW", "SL"];

/**
 * Reads an SGF record (the first game of a collection) into the analysis tree. Variations,
 * comments, glyphs and the properties LiGo doesn't use (marks, game info) are kept; each move is
 * replayed through goban-engine and must be legal and by the colour to move. Throws an `SgfError`.
 *
 * @param {string} text
 * @param {{ maxLength?: number }} [options] `maxLength` counts UTF-8 bytes
 */
export function readTree(text, { maxLength = MAX_SGF_LENGTH } = {}) {
  if (text.length > maxLength || new TextEncoder().encode(text).length > maxLength)
    throw new SgfError(`the record is longer than ${Math.round(maxLength / 1024)} KB`);
  if (!/\(\s*;/.test(text)) throw new SgfError("not an SGF record");
  let trees;
  try {
    const tokens = sabaki.tokenize(text);
    // @sabaki/sgf drops a name with no capital (`sz`, from pre-FF[3] files) without a word; the
    // server's reader refuses it too, so both read a file the same way (libs/go-rules, unit 7.3).
    trees = sabaki.parseTokens(tokens);
    const lower = tokens.find((t) => t.type === "prop_ident" && !/[A-Z]/.test(t.value));
    if (lower) throw new SgfError(`property ${lower.value} has no capital letters: not an SGF property name`);
  } catch (e) {
    if (e instanceof SgfError) throw e;
    if (e instanceof RangeError) throw new SgfError("the record's variations are nested too deeply");
    throw new SgfError(`not a readable SGF record (${e.message})`);
  }
  if (!trees.length) throw new SgfError("not an SGF record");
  const top = trees[0];
  let count = 0;
  for (const pending = [top]; pending.length; ) {
    const n = pending.pop();
    if (++count > MAX_SGF_NODES) throw new SgfError(`the record has more than ${MAX_SGF_NODES} nodes`);
    pending.push(...n.children);
  }
  if (top.data.B || top.data.W) throw new SgfError("the first node plays a move: LiGo reads moves from the second node on");
  if (top.data.AE) throw new SgfError("AE (erase) in the first node: nothing is on the board to erase");
  const settings = rootSettings(top.data, firstMoveOf(top));
  const engine = createEngine({
    size: settings.size,
    ruleset: settings.ruleset,
    komi: settings.komi,
    stones: { black: settings.black, white: settings.white },
    toMove: settings.toMove,
  });
  const root = {
    ...nodeOf(engine, 0, null, null),
    ...annotationsOf(top.data, READ_AT_ROOT),
    settings,
  };
  // Depth first, without recursion: a long main line is thousands of nodes deep.
  const stack = [{ source: top, node: root, position: engine.cur_move }];
  while (stack.length) {
    const { source, node, position } = stack.pop();
    const next = []; // pushed last to first, so earlier variations are read first
    for (const child of source.children) {
      engine.jumpTo(position);
      const { move, color, from } = moveOf(child, node.ply + 1, settings.size);
      if (move === null) {
        // A node without a move (a comment, marks): its notes join the move before it.
        mergeNotes(node, annotationsOf(child.data, READ));
        next.push({ source: child, node, position });
        continue;
      }
      const toMove = stateOf(engine).toMove;
      if (color !== toMove) throw new SgfError(`${from} is not a move by ${toMove}, the player to move`, node.ply + 1);
      const refused = play(engine, move);
      if (refused) throw new SgfError(`${from} is not a legal move (${refused})`, node.ply + 1);
      const made = { ...nodeOf(engine, node.ply + 1, move, color), ...annotationsOf(child.data, READ) };
      const twin = node.children.find((c) => c.id === made.id);
      if (twin) mergeNotes(twin, made); // the same move twice from one position: one node
      else node.children.push(made);
      next.push({ source: child, node: twin ?? made, position: engine.cur_move });
    }
    stack.push(...next.reverse());
  }
  return root;
}

function firstMoveOf(top) {
  for (let n = top.children[0]; n; n = n.children[0]) {
    if (n.data.B) return "black";
    if (n.data.W) return "white";
  }
  return undefined;
}

/** The move a node plays: an SGF point, `"pass"`, or null for a node without one. */
function moveOf(source, number, size) {
  const { data } = source;
  if (SETUP.some((id) => data[id]))
    throw new SgfError("setup stones after the first move aren't supported (only at the start)", number);
  if (data.B && data.W) throw new SgfError("a node plays both colours", number);
  const color = data.B ? "black" : data.W ? "white" : null;
  if (!color) return { move: null, color: null, from: "" };
  const value = (data.B ?? data.W)[0].trim();
  const from = `${data.B ? "B" : "W"}[${value}]`;
  // `tt` is the old pass on 19×19 (the `sgf` skill): accept it, never write it.
  if (value === "" || (value === "tt" && size === 19)) return { move: "pass", color, from };
  if (!isPoint(value, size)) throw new SgfError(`${from} is off the board`, number);
  return { move: value, color, from };
}

/** A tree node for the position the engine is in (ADR 0023 §1's Go node). */
function nodeOf(engine, ply, move, color) {
  const state = stateOf(engine);
  const black = [];
  const white = [];
  state.board.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === "X") black.push(String.fromCharCode(97 + x, 97 + y));
      else if (c === "O") white.push(String.fromCharCode(97 + x, 97 + y));
    }),
  );
  return {
    // The id is the move itself, two characters as lila's tree paths need; a pass is goban's "..".
    id: move === null ? "" : move === "pass" ? ".." : move,
    ply,
    move: move === "pass" ? ".." : move,
    color,
    stones: { black, white },
    captures: state.captures,
    ko: state.koPoint,
    toMove: state.toMove,
    children: [],
    comments: [],
    glyphs: [],
    sgf: {},
  };
}

/** Comments, glyphs and the properties kept as they are. */
function annotationsOf(data, read) {
  // One comment per node, as SGF has one C per node.
  const text = (data.C ?? []).filter((t) => t.trim() !== "").join("\n\n");
  const comments = text ? [{ id: "sgf", by: "sgf", text }] : [];
  const glyphs = Object.entries(GLYPHS)
    .filter(([key]) => {
      const [id, strength] = key.split(":");
      if (!data[id]) return false;
      const value = data[id][0].trim() === "2" ? "2" : "1";
      return strength === "" || strength === value;
    })
    .map(([, glyph]) => glyph);
  const sgf = Object.fromEntries(Object.entries(data).filter(([id]) => !read.includes(id)));
  return { comments, glyphs, sgf };
}

/** Adds a node's notes to another's in place: comments joined, marks without repeats, one value kept for the rest. */
function mergeNotes(into, from) {
  if (from.comments.length) {
    if (into.comments.length) into.comments[0].text += "\n\n" + from.comments[0].text;
    else into.comments.push({ ...from.comments[0] });
  }
  for (const g of from.glyphs) if (!into.glyphs.some((h) => h.id === g.id)) into.glyphs.push(g);
  for (const [id, values] of Object.entries(from.sgf)) {
    const kept = (into.sgf[id] ??= []);
    if (!LISTS.includes(id)) {
      if (!kept.length) kept.push(values[0]);
      continue;
    }
    const seen = new Set(kept);
    for (const v of values) if (!seen.has(v)) (seen.add(v), kept.push(v));
  }
}

/**
 * The node a move makes from the end of `line` (the root, then each node down to the one played
 * from), or the reason goban-engine refuses it. For adding a move on the analysis board; the new
 * node isn't attached: lila's tree operations do that.
 *
 * @param {object[]} line
 * @param {string} move an SGF point or `"pass"`
 * @returns {{ node: object } | { refused: string }}
 */
export function playFrom(line, move) {
  const [root, ...moves] = line;
  const { settings } = root;
  const engine = createEngine({
    size: settings.size,
    ruleset: settings.ruleset,
    komi: settings.komi,
    stones: { black: settings.black, white: settings.white },
    toMove: settings.toMove,
  });
  for (const n of moves) {
    const refused = play(engine, n.move === ".." ? "pass" : n.move);
    if (refused) throw new Error(`the line is not a game: ${n.move} (${refused})`);
  }
  const color = stateOf(engine).toMove;
  const refused = play(engine, move);
  if (refused) return { refused };
  return { node: nodeOf(engine, moves.length + 1, move, color) };
}

/**
 * The whole tree as an SGF record: the root's settings and kept properties, then every variation,
 * with comments and glyphs.
 */
export function writeTree(root) {
  const { settings } = root;
  const rootData = {
    GM: ["1"],
    FF: ["4"],
    CA: ["UTF-8"],
    SZ: [String(settings.size)],
    RU: [settings.ruleset === "chinese" ? "Chinese" : "Japanese"],
    KM: [String(settings.komi)],
    ...(settings.handicap > 0 ? { HA: [String(settings.handicap)] } : {}),
    ...root.sgf,
    ...(settings.black.length ? { AB: settings.black } : {}),
    ...(settings.white.length ? { AW: settings.white } : {}),
    PL: [settings.toMove === "white" ? "W" : "B"],
    ...dataOfNotes(root),
  };
  let id = 0;
  const convert = (node, data) => ({ id: id++, data, children: node.children.map((c) => convert(c, dataOf(c))) });
  return sabaki.stringify([convert(root, rootData)], { linebreak: "\n", indent: "" });
}

function dataOf(node) {
  const letter = node.color === "white" ? "W" : "B";
  return { [letter]: [node.move === ".." ? "" : node.move], ...node.sgf, ...dataOfNotes(node) };
}

function dataOfNotes(node) {
  const data = {};
  if (node.comments.length) data.C = [node.comments.map((c) => c.text).join("\n\n")];
  for (const g of node.glyphs) {
    const [key] = Object.entries(GLYPHS).find(([, h]) => h.id === g.id) ?? [];
    if (!key) continue;
    const [prop, strength] = key.split(":");
    data[prop] = [strength]; // "1" or "2" for TE and BM; IT and DO take no value
  }
  return data;
}

/**
 * The text of an SGF file's bytes: UTF-8 unless its `CA` names another charset the browser knows
 * (Latin-1 for old files). An unknown charset falls back to UTF-8 rather than failing.
 *
 * @param {Uint8Array} bytes
 */
export function decodeSgf(bytes) {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const charset = /CA\s*\[([^\]]*)\]/.exec(head)?.[1]?.trim();
  let decoder;
  try {
    decoder = new TextDecoder(charset || "utf-8");
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  return decoder.decode(bytes).replace(/^﻿/, "");
}
