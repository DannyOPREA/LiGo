import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { offerFor } from '../src/install';

const base = { standalone: false, ios: false, stored: null, prompt: false };

describe('the Install LiGo entry (unit 9.6)', () => {
  test('shows the browser dialog when the browser offered one', () => {
    assert.equal(offerFor({ ...base, prompt: true }), 'prompt');
  });
  test('shows the Share instructions on iOS, which never offers', () => {
    assert.equal(offerFor({ ...base, ios: true }), 'ios');
  });
  test('shows nothing when there is no offer elsewhere', () => {
    assert.equal(offerFor(base), undefined);
  });
  test('shows nothing inside the installed app', () => {
    assert.equal(offerFor({ ...base, standalone: true, prompt: true }), undefined);
    assert.equal(offerFor({ ...base, standalone: true, ios: true }), undefined);
  });
  test('stays hidden once dismissed', () => {
    assert.equal(offerFor({ ...base, stored: 'dismissed', prompt: true }), undefined);
    assert.equal(offerFor({ ...base, stored: 'dismissed', ios: true }), undefined);
  });
  test('stays hidden once installed, until the browser offers again after an uninstall', () => {
    assert.equal(offerFor({ ...base, stored: 'installed', ios: true }), undefined);
    assert.equal(offerFor({ ...base, stored: 'installed', prompt: true }), 'prompt');
  });
});
