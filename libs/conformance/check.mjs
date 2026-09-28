#!/usr/bin/env node
// Checks that the rules fixtures in libs/conformance/fixtures/ are well formed (README.md, "The
// format"). It needs no engine: it checks shape, coordinates, ids, rule IDs and simple board sanity
// (no chain without liberties), so a typo fails here instead of as a confusing engine failure.
//
// Usage: node check.mjs [--coverage] [--spec file] [dir]   (dir defaults to ./fixtures here)
//   --coverage  also print how many cases check each spec rule ID, and the IDs no case checks
//   --spec      the rules spec to take rule IDs from (default docs/rules/spec.md)
// Exit 0 when every file is valid, 1 otherwise.
//
// Licence: MIT (LiGo's own code, ADR 0006).

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC = join(HERE, "..", "..", "docs", "rules", "spec.md");

const SIZES = [9, 13, 19];
const ENGINES = ["server", "client", "scoring"];
const COLOURS = ["black", "white"];
const REASONS = ["occupied", "suicide", "superko", "in-scoring", "not-in-scoring", "resume-limit", "game-over"];
const SERVER_ONLY_TOKENS = ["resume", "undo"];
// Reasons only LiGo's server can give: goban-engine has no scoring phase, resume or game end.
const SERVER_ONLY_REASONS = ["in-scoring", "not-in-scoring", "resume-limit", "game-over"];
const STONE_REASONS = ["occupied", "suicide", "superko"];
const OPEN_POINTS = 11; // docs/rules/spec.md §12
const FILE_KEYS = ["format", "idPrefix", "source", "cases"];
const SOURCE_KEYS = ["name", "url", "commit", "license"];
const CASE_KEYS = ["id", "title", "rules", "from", "appliesTo", "size", "ruleset", "handicap", "komi",
  "setup", "moves", "expect", "score", "openPoints", "knownGaps", "notes"];
const REQUIRED = ["id", "title", "rules", "from", "appliesTo", "size", "moves"];
const EXPECT_KEYS = ["board", "toMove", "captures", "koPoint", "phase", "legal", "illegal"];
const SCORE_KEYS = ["dead", "black", "white", "result"];
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RULE_ID = /^R-[A-Z]+(-[A-Z0-9]+)+$/;
const RESULT = /^(0|[BW]\+\d+(\.5)?)$/;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v) => typeof v === "string" && v.trim() !== "";
const isInt = (v) => Number.isInteger(v);
const isHalf = (v) => typeof v === "number" && Number.isInteger(v * 2);

/** A point like "dd" on a board of this size, or null if it isn't one. */
function point(tok, size) {
  if (typeof tok !== "string" || !/^[a-s]{2}$/.test(tok)) return null;
  const x = tok.charCodeAt(0) - 97, y = tok.charCodeAt(1) - 97;
  return x < size && y < size ? { x, y } : null;
}
const isToken = (tok, size) => tok === "pass" || SERVER_ONLY_TOKENS.includes(tok) || point(tok, size) !== null;

/** Errors in a diagram (array of rows of . X O), including chains with no liberties. */
function boardErrors(rows, size) {
  if (!Array.isArray(rows) || rows.length !== size) return [`must be ${size} rows`];
  const bad = rows.findIndex((r) => typeof r !== "string" || !new RegExp(`^[.XO]{${size}}$`).test(r));
  if (bad >= 0) return [`row ${bad + 1} must be ${size} characters of . X O`];
  const seen = new Set(), errs = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = rows[y][x];
    if (c === "." || seen.has(`${x},${y}`)) continue;
    const stack = [[x, y]], chain = [];
    let libs = 0;
    seen.add(`${x},${y}`);
    while (stack.length) {
      const [cx, cy] = stack.pop();
      chain.push([cx, cy]);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = rows[ny][nx];
        if (n === ".") libs++;
        else if (n === c && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); stack.push([nx, ny]); }
      }
    }
    if (libs === 0) {
      const at = String.fromCharCode(97 + chain[0][0], 97 + chain[0][1]);
      errs.push(`the ${c === "X" ? "black" : "white"} chain at ${at} has no liberties`);
    }
  }
  return errs;
}

function unknownKeys(obj, allowed, where, err) {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) err(`${where}unknown field "${k}"`);
}

/** Checks one case; calls err(message) for each problem. */
export function checkCase(c, prefix, err) {
  if (!isObj(c)) return err("a case must be an object");
  unknownKeys(c, CASE_KEYS, "", err);
  for (const k of REQUIRED) if (!(k in c)) err(`missing "${k}"`);
  if ("id" in c && !(isStr(c.id) && ID.test(c.id) && c.id.startsWith(prefix)))
    err(`id must be lowercase-with-dashes and start with "${prefix}"`);
  if ("title" in c && !isStr(c.title)) err("title must be a non-empty string");
  if ("rules" in c && !(Array.isArray(c.rules) && c.rules.length && c.rules.every((r) => RULE_ID.test(r))))
    err("rules must be a non-empty list of spec rule IDs like R-KO-2");
  if ("from" in c && !(c.from === "new" || (typeof c.from === "string" && /^\S+:\d+(-\d+)?( .*)?$/.test(c.from))))
    err('from must be "path:line" or "new"');
  const applies = Array.isArray(c.appliesTo) ? c.appliesTo : [];
  if ("appliesTo" in c && !(applies.length && applies.every((e) => ENGINES.includes(e)) && new Set(applies).size === applies.length))
    err(`appliesTo must list some of ${ENGINES.join(", ")}, each once`);
  if (!SIZES.includes(c.size)) return err(`size must be one of ${SIZES.join(", ")}`);
  const size = c.size;

  if ("ruleset" in c && !["japanese", "chinese"].includes(c.ruleset)) err('ruleset must be "japanese" or "chinese"');
  if ("handicap" in c && !(isInt(c.handicap) && c.handicap >= 0 && c.handicap <= 9)) err("handicap must be 0 to 9");
  if ("komi" in c && !isHalf(c.komi)) err("komi must be a multiple of 0.5");
  if ("setup" in c) {
    if (!isObj(c.setup)) err("setup must be an object");
    else {
      unknownKeys(c.setup, ["board", "toMove"], "setup: ", err);
      for (const e of boardErrors(c.setup.board, size)) err(`setup.board: ${e}`);
      if (!COLOURS.includes(c.setup.toMove)) err('setup.toMove must be "black" or "white"');
      if ((c.handicap ?? 0) > 1) err("use either handicap or setup, not both");
    }
  }
  const tokens = [], serverOnly = [];
  if ("moves" in c) {
    if (!Array.isArray(c.moves)) err("moves must be a list");
    else c.moves.forEach((m, i) => { tokens.push(m); if (!isToken(m, size)) err(`moves[${i}] "${m}" is not a point on this board, "pass", "resume" or "undo"`); });
  }

  const e = c.expect;
  if ("expect" in c) {
    if (!isObj(e) || !Object.keys(e).length) err("expect must be an object with at least one field");
    else {
      unknownKeys(e, EXPECT_KEYS, "expect: ", err);
      if ("board" in e) for (const m of boardErrors(e.board, size)) err(`expect.board: ${m}`);
      if ("toMove" in e && !COLOURS.includes(e.toMove)) err('expect.toMove must be "black" or "white"');
      if ("captures" in e && !(isObj(e.captures) && Object.keys(e.captures).length === 2 &&
          COLOURS.every((k) => isInt(e.captures[k]) && e.captures[k] >= 0)))
        err("expect.captures must be { black: n, white: n }");
      if ("koPoint" in e && e.koPoint !== null && !point(e.koPoint, size)) err("expect.koPoint must be a point or null");
      if ("phase" in e && !["play", "scoring"].includes(e.phase)) err('expect.phase must be "play" or "scoring"');
      const tried = [];
      if ("legal" in e) {
        if (!Array.isArray(e.legal) || !e.legal.length) err("expect.legal must be a non-empty list");
        else e.legal.forEach((m) => { tried.push(m); tokens.push(m); if (!isToken(m, size)) err(`expect.legal "${m}" is not a move`); });
      }
      if ("illegal" in e) {
        if (!Array.isArray(e.illegal) || !e.illegal.length) err("expect.illegal must be a non-empty list");
        else e.illegal.forEach((x) => {
          if (!isObj(x)) return err("expect.illegal entries must be { move, reason }");
          unknownKeys(x, ["move", "reason"], "expect.illegal: ", err);
          tried.push(x.move); tokens.push(x.move);
          if (!isToken(x.move, size)) err(`expect.illegal move "${x.move}" is not a move`);
          if (!REASONS.includes(x.reason)) err(`expect.illegal reason for "${x.move}" must be one of ${REASONS.join(", ")}`);
          else if (!point(x.move, size) && STONE_REASONS.includes(x.reason))
            err(`expect.illegal "${x.move}" can't be refused as ${x.reason}: only a stone placement can (R-KO-3)`);
          else if (SERVER_ONLY_REASONS.includes(x.reason)) serverOnly.push(`reason ${x.reason}`);
        });
      }
      if (new Set(tried).size !== tried.length) err("a move appears more than once in expect.legal/illegal");
    }
  }
  if (tokens.some((t) => SERVER_ONLY_TOKENS.includes(t)) && applies.some((a) => a !== "server"))
    err('"resume" and "undo" are server-only: appliesTo must be ["server"]');
  if (serverOnly.length && applies.includes("client"))
    err(`${serverOnly.join(", ")} can only be checked by the server: drop "client" from appliesTo`);

  if ("score" in c) {
    const s = c.score;
    if (!isObj(s)) err("score must be an object");
    else {
      unknownKeys(s, SCORE_KEYS, "score: ", err);
      if (!(Array.isArray(s.dead) && s.dead.every((p) => point(p, size)))) err("score.dead must be a list of points");
      else if (new Set(s.dead).size !== s.dead.length) err("score.dead lists a point twice");
      if (!isHalf(s.black) || !isHalf(s.white)) err("score.black and score.white must be multiples of 0.5");
      if (!(typeof s.result === "string" && RESULT.test(s.result))) err('score.result must be like "B+3.5", "W+1" or "0"');
      else if (isHalf(s.black) && isHalf(s.white)) {
        const d = s.black - s.white;
        const want = d === 0 ? "0" : `${d > 0 ? "B" : "W"}+${Math.abs(d)}`;
        if (s.result !== want) err(`score.result is ${s.result} but the totals give ${want}`);
      }
    }
    if (!("ruleset" in c)) err("a case with a score needs a ruleset");
    if (!("komi" in c)) err("a case with a score needs komi");
    if (!applies.includes("scoring")) err('a case with a score must apply to "scoring"');
  } else if (applies.includes("scoring")) err('a case for "scoring" needs a score');
  if (!("expect" in c) && !("score" in c)) err("a case needs expect, score or both");
  if (applies.some((a) => a !== "scoring") && !("expect" in c)) err("server and client cases need expect");

  if ("openPoints" in c && !(Array.isArray(c.openPoints) && c.openPoints.length &&
      c.openPoints.every((n) => isInt(n) && n >= 1 && n <= OPEN_POINTS)))
    err(`openPoints must be a list of spec §12 numbers 1 to ${OPEN_POINTS}`);
  if ("knownGaps" in c) {
    const g = c.knownGaps;
    if (!isObj(g) || !Object.keys(g).length) err("knownGaps must be an object like { client: \"why\" }");
    else for (const [k, v] of Object.entries(g)) {
      if (k !== "client") err(`only the client can have a known gap (the server is the referee), not "${k}"`);
      else if (!applies.includes(k)) err(`knownGaps names "${k}", which the case does not apply to`);
      if (!isStr(v)) err(`knownGaps.${k} must say why`);
    }
  }
  if ("notes" in c && !isStr(c.notes)) err("notes must be a non-empty string");
}

/** Checks one parsed fixture file. Returns the list of problems. */
export function checkFile(data, name) {
  const errs = [];
  const at = (id) => (m) => errs.push(`${name}${id ? ` ${id}` : ""}: ${m}`);
  if (!isObj(data)) return [`${name}: must be a JSON object`];
  unknownKeys(data, FILE_KEYS, "", at());
  if (data.format !== 1) at()("format must be 1");
  if (!(isStr(data.idPrefix) && /^[a-z0-9]+-$/.test(data.idPrefix))) at()('idPrefix must be like "sg-"');
  if (!isObj(data.source)) at()("source must be an object");
  else {
    unknownKeys(data.source, SOURCE_KEYS, "source: ", at());
    for (const k of SOURCE_KEYS) if (!isStr(data.source[k])) at()(`source.${k} must be a non-empty string`);
  }
  if (!Array.isArray(data.cases) || !data.cases.length) at()("cases must be a non-empty list");
  else data.cases.forEach((c, i) => checkCase(c, data.idPrefix ?? "", at(isObj(c) && isStr(c.id) ? c.id : `case ${i + 1}`)));
  return errs;
}

/** Rule IDs defined in the spec (bold **R-...**), or null if the spec isn't there yet. */
export function specRuleIds(path = SPEC) {
  if (!existsSync(path)) return null;
  return new Set([...readFileSync(path, "utf8").matchAll(/\*\*(R-[A-Z]+(?:-[A-Z0-9]+)+)\*\*/g)].map((m) => m[1]));
}

/** Checks every fixture file in dir. Returns { errors, files, cases }. */
export function checkDir(dir, specIds = specRuleIds()) {
  const errors = [], ids = new Map(), prefixes = new Map(), cases = [];
  const names = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];
  for (const name of names) {
    let data;
    try { data = JSON.parse(readFileSync(join(dir, name), "utf8")); }
    catch (e) { errors.push(`${name}: not valid JSON (${e.message})`); continue; }
    errors.push(...checkFile(data, name));
    if (isStr(data?.idPrefix)) {
      if (prefixes.has(data.idPrefix)) errors.push(`${name}: idPrefix "${data.idPrefix}" is also used by ${prefixes.get(data.idPrefix)}`);
      prefixes.set(data.idPrefix, name);
    }
    for (const c of Array.isArray(data?.cases) ? data.cases : []) {
      if (!isObj(c)) continue;
      cases.push(c);
      if (isStr(c.id)) {
        if (ids.has(c.id)) errors.push(`${name} ${c.id}: id also used in ${ids.get(c.id)}`);
        ids.set(c.id, name);
      }
      if (specIds && Array.isArray(c.rules))
        for (const r of c.rules) if (!specIds.has(r)) errors.push(`${name} ${c.id}: rule ${r} is not in docs/rules/spec.md`);
    }
  }
  return { errors, files: names.length, cases };
}

function main(argv) {
  const coverage = argv.includes("--coverage");
  const specAt = argv.indexOf("--spec");
  const specPath = specAt >= 0 ? argv[specAt + 1] : SPEC;
  const dir = argv.find((a, i) => !a.startsWith("--") && !(specAt >= 0 && i === specAt + 1)) ?? join(HERE, "fixtures");
  const specIds = specRuleIds(specPath);
  const { errors, files, cases } = checkDir(dir, specIds);
  if (coverage) {
    const count = new Map();
    for (const c of cases) for (const r of c.rules ?? []) count.set(r, (count.get(r) ?? 0) + 1);
    console.log("Cases per rule ID:");
    for (const [r, n] of [...count].sort()) console.log(`  ${r.padEnd(14)} ${n}`);
    if (specIds) {
      const none = [...specIds].filter((r) => !count.has(r)).sort();
      console.log(`Spec rule IDs no case checks (${none.length}): ${none.join(" ") || "none"}`);
    }
  }
  if (!specIds) console.log(`note: ${specPath} not found, so rule IDs were not checked against the spec`);
  if (!files) errors.push(`no fixture files (*.json) in ${dir}`);
  for (const e of errors) console.error(e);
  console.log(`${files} fixture file(s), ${cases.length} case(s): ${errors.length ? `${errors.length} problem(s)` : "all well formed"}`);
  return errors.length ? 1 : 0;
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url)))
  process.exit(main(process.argv.slice(2)));
