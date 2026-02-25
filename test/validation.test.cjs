const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHttpUrl, sanitizeSlug, sanitizeColorHex } = require('../server.cjs');

test('normalizeHttpUrl allows http and https URLs', () => {
  assert.equal(normalizeHttpUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(normalizeHttpUrl('http://example.com'), 'http://example.com/');
});

test('normalizeHttpUrl rejects dangerous schemes and invalid URLs', () => {
  assert.equal(normalizeHttpUrl('javascript:alert(1)'), '');
  assert.equal(normalizeHttpUrl('not-a-url'), '');
  assert.equal(normalizeHttpUrl(''), '');
});

test('sanitizeSlug enforces a safe slug format', () => {
  assert.equal(sanitizeSlug('My-Slug_12'), 'my-slug_12');
  assert.equal(sanitizeSlug('/admin/'), '');
  assert.equal(sanitizeSlug('a'.repeat(81)), '');
  assert.equal(sanitizeSlug('bad slug'), '');
});

test('sanitizeColorHex accepts only 6-digit hex', () => {
  assert.equal(sanitizeColorHex('#AABBCC'), '#aabbcc');
  assert.equal(sanitizeColorHex('#123abc'), '#123abc');
  assert.equal(sanitizeColorHex('red'), '');
  assert.equal(sanitizeColorHex('#1234'), '');
});
