// Unit 8.2 feasibility spike (ADR 0025 §2): not part of the tool, kept for its numbers.
// Run from libs/board so goban-engine resolves: cd libs/board && node ../../tools/puzzles/spike/solve.mjs
// Licence: MIT (LiGo's own code, ADR 0007).
import { createEngine, play, stateOf } from "../../../libs/board/src/engine.mjs";
const P=(x,y)=>String.fromCharCode(97+x)+String.fromCharCode(97+y);
// solve(position, defender colour, region points) -> does side to move win? attacker wins iff defender stones in region all captured
export function solve({black,white,toMove,defender,region,target}){
  const e=createEngine({size:19,ruleset:"japanese",komi:6.5,stones:{black,white},toMove});
  let nodes=0; const tt=new Map();
  const tx=target.map(([x,y])=>[x,y]);
  const captured=()=>{ const b=e.board; return tx.some(([x,y])=>b[y][x]===0); };
  function key(){ const s=stateOf(e); return s.board.slice(0,8).map(r=>r.slice(0,8)).join('/')+s.toMove+(s.koPoint||'')+passes; }
  let passes=0;
  // returns true if defender survives with best play
  function rec(depth){
    nodes++;
    if (captured()) return false;
    if (passes>=2) return true;
    if (depth>30) return true; // treat long cycles as survive (spike)
    const k=key(); if (tt.has(k)) return tt.get(k);
    const mover=stateOf(e).toMove; const defMoves = mover===defender;
    let best = !defMoves; // attacker to move: default defender survives? compute by search
    const here=e.cur_move; const moves=[...region,'pass'];
    let result = defMoves ? false : true;
    for (const m of moves){
      const savedP=passes;
      if (m==='pass'){ if(play(e,'pass')) continue; passes++; } else { if (play(e,m)) continue; passes=0; }
      const r=rec(depth+1);
      const mv=e.cur_move; e.jumpTo(here); mv.remove(); passes=savedP;
      if (defMoves && r){ result=true; break; }
      if (!defMoves && !r){ result=false; break; }
    }
    tt.set(k,result); return result;
  }
  const t=Date.now(); const firsts={};
  const here=e.cur_move;
  for (const m of region){ if(play(e,m)) continue; passes=0; firsts[m]=rec(1); const mv=e.cur_move; e.jumpTo(here); mv.remove(); }
  return {firsts, nodes, ms:Date.now()-t};
}
// straight three in the corner: eye points a1..c1
const black=[P(3,0),P(0,1),P(1,1),P(2,1),P(3,1)];
const white=[P(4,0),P(4,1),P(0,2),P(1,2),P(2,2),P(3,2),P(4,2)];
const region=[P(0,0),P(1,0),P(2,0)];
console.log("B to play (defender survives?)", JSON.stringify(solve({black,white,toMove:"black",defender:"black",region,target:[[3,0]]})));
console.log("W to play (defender survives?)", JSON.stringify(solve({black,white,toMove:"white",defender:"black",region,target:[[3,0]]})));
// bigger: bulky-ish 6-point eye space along the edge, test node counts
const b2=[P(0,2),P(1,2),P(2,2),P(3,2),P(4,2),P(5,2),P(6,2),P(6,1),P(6,0)];
const w2=[P(0,3),P(1,3),P(2,3),P(3,3),P(4,3),P(5,3),P(6,3),P(7,3),P(7,2),P(7,1),P(7,0)];
const r2=[]; for(let x=0;x<6;x++) for(let y=0;y<2;y++) r2.push(P(x,y));
console.log("12-pt corner space, W to play", JSON.stringify(solve({black:b2,white:w2,toMove:"white",defender:"black",region:r2,target:[[6,0]]})));
