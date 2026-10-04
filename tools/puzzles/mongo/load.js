// `dev/ligo puzzles load` (ADR 0025 §5, unit 8.6): upserts every puzzle into lila's puzzle
// collection by id. mongosh runs it with `puzzles` (the data files' puzzles) and doc.js's
// `puzzleDoc` defined in front of it. lila's puzzle path job (lila/modules/puzzle) notices the
// new puzzles and rebuilds `puzzle2_path` on its next tick.
//
// Licence: MIT (LiGo's own code, ADR 0007).

/* global db, puzzles, puzzleDoc, print */
const ops = puzzles.map(p => {
  const d = puzzleDoc(p);
  return {
    updateOne: { filter: { _id: p.id }, update: { $set: d.set, $setOnInsert: d.setOnInsert }, upsert: true },
  };
});
const res = db.puzzle2_puzzle.bulkWrite(ops, { ordered: false });
print(
  `puzzles: ${ops.length} in the files, ${res.upsertedCount} new, ${res.modifiedCount} changed; ` +
    `${db.puzzle2_puzzle.countDocuments({})} in lila's puzzle collection`,
);
