// The board types every package still uses, declared here since chessground left (unit 3.19 part 2).
// They keep chessground's shapes so code that still names them compiles unchanged.
declare global {
  type Color = 'white' | 'black';
  type Role = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
  type Files = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
  type Ranks = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
  type Key = 'a0' | `${Files}${Ranks}`;
  type FEN = string;
}

export {};
