// One puzzle of tools/puzzles/data as lila's puzzle document (ADR 0025 §5, unit 8.6), for
// load.js. A plain script, not a module: `dev/ligo puzzles load` runs it inside mongosh, and
// test/mongo.test.ts evaluates it in Node.
//
// `set` is what the file decides: the board, the tree and the source, rewritten on every load.
// `setOnInsert` is what play decides: the rating, plays, votes, and the themes (players' theme
// votes change them, as in lila), so loading again never resets a played puzzle.
//
// Licence: MIT (LiGo's own code, ADR 0007).

/* global Double */
/* exported puzzleDoc */
// oxlint-disable-next-line no-unused-vars -- called by load.js and the test
function puzzleDoc(p) {
  // lila reads the rating and the vote as doubles; mongosh would write a whole number as an int.
  const dbl = typeof Double === 'function' ? Double : x => x;
  const set = {
    size: p.width,
    setup: p.initial_state,
    player: p.initial_player,
    tree: p.move_tree,
    goal: p.goal,
    prov: p.provenance,
  };
  if (p.bounds) set.bounds = p.bounds;
  return {
    set,
    setOnInsert: {
      // The generator's band rating is a guess (ADR 0025 §4), so the deviation starts at lila's
      // default for a new rating (500) and the first plays move it quickly.
      glicko: { r: dbl(p.rating), d: dbl(500), v: dbl(0.09) },
      plays: 0,
      vote: dbl(0),
      vu: 0,
      vd: 0,
      themes: p.themes,
    },
  };
}
