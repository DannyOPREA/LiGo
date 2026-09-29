import { createEngine, play } from "/home/user/LiGo/libs/board/src/engine.mjs";
const e = createEngine({ size: 19, ruleset: "japanese", komi: 6.5, stones:{black:[],white:[]}, toMove:"black" });
const pts=[]; for (let x=0;x<6;x++) for(let y=0;y<6;y++) pts.push(String.fromCharCode(97+x)+String.fromCharCode(97+y));
let n=0; const t=Date.now();
while (Date.now()-t<3000) {
  const here=e.cur_move;
  for (const p of pts) { if (!play(e,p)) { n++; const m=e.cur_move; e.jumpTo(here); m.remove(); } }
}
console.log("place+undo per sec", Math.round(n/3));
