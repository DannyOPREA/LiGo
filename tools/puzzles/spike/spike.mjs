// Unit 8.2 feasibility spike (ADR 0025 §2): not part of the tool, kept for its numbers.
// Run from libs/board so goban-engine resolves: cd libs/board && node ../../tools/puzzles/spike/solve.mjs
// Licence: MIT (LiGo's own code, ADR 0007).
import { createEngine, play } from "../../../libs/board/src/engine.mjs";
const e = createEngine({ size: 19, ruleset: "japanese", komi: 6.5, stones:{black:[],white:[]}, toMove:"black" });
const pts=[]; for (let x=0;x<6;x++) for(let y=0;y<6;y++) pts.push(String.fromCharCode(97+x)+String.fromCharCode(97+y));
let n=0; const t=Date.now();
while (Date.now()-t<3000) {
  const here=e.cur_move;
  for (const p of pts) { if (!play(e,p)) { n++; const m=e.cur_move; e.jumpTo(here); m.remove(); } }
}
console.log("place+undo per sec", Math.round(n/3));
