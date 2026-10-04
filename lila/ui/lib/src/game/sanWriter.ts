// no side effects allowed due to re-export by index.ts

// What is left of lila's SAN helpers once chessops and the chess screen reader went (unit 3.19 part 2):
// the move speech behind `site.sound.saySan`, which nothing calls now. Phase 9 removes it with
// sound.ts's chess speech (#102); until then this one role table stands in for chessops.
const ROLES: Record<string, Role> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const charToRole = (c: string): Role | undefined => ROLES[c.toLowerCase()];

export const sanToWords = (san: string): string =>
  san
    .split('')
    .map(c => {
      if (c === 'x') return i18n.nvui.sanTakes;
      if (c === '+') return i18n.nvui.sanCheck;
      if (c === '#') return i18n.nvui.sanCheckmate;
      if (c === '=') return i18n.nvui.sanPromotesTo;
      if (c === '@') return i18n.nvui.sanDroppedOn;
      const code = c.charCodeAt(0);
      if (code > 48 && code < 58) return c; // 1-8
      if (code > 96 && code < 105) return c.toUpperCase(); // a-h
      const role = charToRole(c);
      return role ? transRole(role) : c;
    })
    .join(' ')
    .replace('O - O - O', i18n.nvui.sanLongCastling)
    .replace('O - O', i18n.nvui.sanShortCastling);

export const transRole = (role: Role): string =>
  (i18n.nvui[role as keyof typeof i18n.nvui] as string) || role;

export function speakable(san?: San): string {
  return !san
    ? i18n.nvui.gameStart
    : sanToWords(san)
        .replace(/^A /, '"A"') // "A takes" & "A 3" are mispronounced
        .replace(/(\d) E (\d)/, '$1,E $2') // Strings such as 1E5 are treated as scientific notation
        .replace(/C /, 'c ') // Capital C is pronounced as "degrees celsius" when it comes after a number (e.g. R8c3)
        .replace(/F /, 'f ') // Capital F is pronounced as "degrees fahrenheit" when it comes after a number (e.g. R8f3)
        .replace(/(\d) H (\d)/, '$1H$2') // "H" is pronounced as "hour" when it comes after a number with a space (e.g. Rook 5 H 3)
        .replace(/(\d) H (\d)/, '$1H$2');
}
