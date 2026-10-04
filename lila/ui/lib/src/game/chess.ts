// no side effects allowed due to re-export by index.ts

// Move-number and colour helpers that outlived chess (unit 3.19 part 2 dropped the chessops ones).

export const fixCrazySan = (san: San): San => (san.startsWith('P') ? san.slice(1) : san);

export const COLORS: Color[] = ['white', 'black'];

export const opposite = (color: Color): Color => (color === 'white' ? 'black' : 'white');

export const plyToTurn = (ply: number): number => Math.floor((ply - 1) / 2) + 1;

export const plyColor = (ply: number): Color => (ply % 2 === 0 ? 'white' : 'black');

export const plyOpponentColor = (ply: number): Color => opposite(plyColor(ply));
