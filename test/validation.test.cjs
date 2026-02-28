const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHttpUrl, sanitizeSlug, sanitizeColorHex, sanitizeEmbedHtml, buildTrackedDestinationUrl } = require('../server.cjs');

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
  assert.equal(sanitizeSlug('/out/'), '');
  assert.equal(sanitizeSlug('a'.repeat(81)), '');
  assert.equal(sanitizeSlug('bad slug'), '');
});

test('sanitizeColorHex accepts only 6-digit hex', () => {
  assert.equal(sanitizeColorHex('#AABBCC'), '#aabbcc');
  assert.equal(sanitizeColorHex('#123abc'), '#123abc');
  assert.equal(sanitizeColorHex('red'), '');
  assert.equal(sanitizeColorHex('#1234'), '');
});

test('sanitizeEmbedHtml allows only trusted https iframe embeds', () => {
  const valid = sanitizeEmbedHtml(
    '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" allow="autoplay; fullscreen; camera"></iframe>'
  );
  assert.match(valid, /<iframe/i);
  assert.match(valid, /src="https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ"/i);
  assert.match(valid, /allow="autoplay; fullscreen"/i);
  assert.doesNotMatch(valid, /camera/i);
});

test('sanitizeEmbedHtml drops scripts and non-allowlisted iframe hosts', () => {
  const withScript = sanitizeEmbedHtml('<script>alert(1)</script>');
  assert.equal(withScript, '');

  const badHost = sanitizeEmbedHtml('<iframe src="https://evil.example.com/embed/x"></iframe>');
  assert.equal(badHost, '');
});

test('buildTrackedDestinationUrl appends sanitized UTM params', () => {
  const output = buildTrackedDestinationUrl('https://example.com/path?existing=1', {
    utm_source: 'instagram',
    utm_medium: 'bio',
    utm_campaign: 'launch'
  });
  assert.match(output, /^https:\/\/example\.com\/path\?/);
  assert.match(output, /existing=1/);
  assert.match(output, /utm_source=instagram/);
  assert.match(output, /utm_medium=bio/);
  assert.match(output, /utm_campaign=launch/);
});
