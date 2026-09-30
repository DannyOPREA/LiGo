// mod.autolink.test.ts (node:test)

import assert from 'node:assert/strict';
import { describe, test, before } from 'node:test';

let autolink!: (s: string) => string;
let hostname!: string;

const ensureLocation = () => {
  if (!('location' in globalThis) || !globalThis.location) {
    Object.defineProperty(globalThis, 'location', {
      value: { hostname: 'localhost' },
      configurable: true,
      writable: true,
    });
  }
};

const linked = (text: string) => `<a href="${text}">${hostname}${text}</a>`;

before(async () => {
  ensureLocation();
  hostname = globalThis.location.hostname;
  ({ autolink } = await import('../src/mod.autolink'));
});

describe('autolinks', () => {
  test('dont match external hosts', () => {
    assert.strictEqual(autolink('https://otherhost/12345678'), 'https://otherhost/12345678');
  });

  test('inside parentheses]', () => {
    assert.strictEqual(autolink(`(https://${hostname}/12345678)`), `(${linked('/12345678')})`);
  });

  test('after colon', () => {
    assert.strictEqual(autolink(`see:https://${hostname}/study`), `see:${linked('/study')}`);
  });

  test('dont match after equals', () => {
    assert.strictEqual(autolink(`url=https://${hostname}/study`), `url=https://${hostname}/study`);
  });

  test('dont match in quotes', () => {
    assert.strictEqual(autolink(`"https://${hostname}/study"`), `"https://${hostname}/study"`);
  });

  test('dont match when preceded by a word char', () => {
    assert.strictEqual(autolink(`foohttps://${hostname}/study`), `foohttps://${hostname}/study`);
  });

  test('bare path inside of string', () => {
    assert.strictEqual(autolink(`boo /study`), `boo ${linked('/study')}`);
  });

  test('hostname without scheme in parens', () => {
    assert.strictEqual(autolink(`foo bar (${hostname}/study)`), `foo bar (${linked('/study')})`);
  });

  test('game id path, 8 chars', () => {
    assert.strictEqual(autolink(`https://${hostname}/12345678`), linked('/12345678'));
  });

  test('game id path, 12 chars', () => {
    assert.strictEqual(autolink(`https://${hostname}/12345678abcd`), linked('/12345678abcd'));
  });

  test('preceded by comma', () => {
    assert.strictEqual(autolink(`,https://${hostname}/study`), `,${linked('/study')}`);
  });

  test('preceded by semicolon', () => {
    assert.strictEqual(autolink(`;https://${hostname}/study`), `;${linked('/study')}`);
  });

  test('multi games already linked', () => {
    assert.strictEqual(
      autolink(`
<a href="localhost/1xeQrVqS/black">localhost/1xeQrVqS/black</a>
<a href="/iCuMS2K7">/iCuMS2K7</a>
/12345678
<a href="localhost/insights/Chess_Athlete_30/acpl/blur/variant:antichess">localhost/insights/Chess_Athlete_30/acpl/blur/variant:antichess</a>
`),
      `
<a href="localhost/1xeQrVqS/black">localhost/1xeQrVqS/black</a>
<a href="/iCuMS2K7">/iCuMS2K7</a>
${linked('/12345678')}
<a href="localhost/insights/Chess_Athlete_30/acpl/blur/variant:antichess">localhost/insights/Chess_Athlete_30/acpl/blur/variant:antichess</a>
`,
    );
  });

  test('grab bag', () => {
    assert.strictEqual(autolink(`foo /12345678#anchor bar`), `foo ${linked('/12345678#anchor')} bar`);
    assert.strictEqual(
      autolink(`http://${hostname}/study/nope /${hostname}/study/nope`),
      `http://${hostname}/study/nope /${hostname}/study/nope`,
    );
    assert.strictEqual(autolink('(//study/ nope)'), '(//study/ nope)');
  });

  test('path params', () => {
    assert.strictEqual(autolink(`${hostname}/study?param=value`), linked('/study?param=value'));
    assert.strictEqual(
      autolink(`https://${hostname}/tournament/blah#anchor`),
      linked('/tournament/blah#anchor'),
    );
    assert.strictEqual(
      autolink(`(/study/extra/path?x=true&y=false)`),
      `(${linked('/study/extra/path?x=true&y=false')})`,
    );
  });
});
