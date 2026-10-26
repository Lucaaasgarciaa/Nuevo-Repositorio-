import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../src/phone.js';

test('normaliza números', () => {
  assert.equal(normalizePhone('+34 600 11 22 33', '34'), '34600112233');
  assert.equal(normalizePhone('0034600112233', '34'), '34600112233');
  assert.equal(normalizePhone('600-11-22-33', '34'), '34600112233');
  assert.equal(normalizePhone('+52 1 55 1234 5678', '34'), '5215512345678');
  assert.equal(normalizePhone('juan', '34'), null);
  assert.equal(normalizePhone('123', '34'), null);
});
