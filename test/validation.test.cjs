const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildConfig,
  normalizeHttpUrl,
  sanitizeSlug,
  sanitizeColorHex,
  sanitizeEmbedHtml,
  buildTrackedDestinationUrl,
  suggestIconKeyFromHostname,
  sanitizeInternalReturnPath,
  isValidAccessPassword,
  hasPasswordGate,
  buildAbsoluteAssetUrl,
  isSocialPreviewUserAgent,
  sanitizeSettingValue,
  parseThemeTemplateInput,
  buildThemeTemplatePayload,
  sanitizeTargetingRules,
  normalizeScheduleInputToUtc,
  formatScheduleForInput
} = require('../server.cjs');

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
  assert.equal(sanitizeSlug('/unlock/'), '');
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

test('suggestIconKeyFromHostname maps common social domains', () => {
  assert.equal(suggestIconKeyFromHostname('www.youtube.com'), 'youtube');
  assert.equal(suggestIconKeyFromHostname('x.com'), 'x');
  assert.equal(suggestIconKeyFromHostname('github.com'), 'github');
});

test('buildConfig applies abuse-safety defaults and input bounds', () => {
  const defaults = buildConfig({});
  assert.equal(defaults.likeRateLimitWindowMs, 60000);
  assert.equal(defaults.likeRateLimitMax, 20);
  assert.equal(defaults.redirectRateLimitWindowMs, 60000);
  assert.equal(defaults.redirectRateLimitMax, 120);
  assert.equal(defaults.viewCountThrottleSeconds, 300);
  assert.equal(defaults.viewCountRetentionDays, 30);

  const clamped = buildConfig({
    LIKE_RATE_LIMIT_WINDOW_MS: '500',
    LIKE_RATE_LIMIT_MAX: '-1',
    REDIRECT_RATE_LIMIT_WINDOW_MS: '999999999',
    REDIRECT_RATE_LIMIT_MAX: '60000',
    VIEW_COUNT_THROTTLE_SECONDS: '0',
    VIEW_COUNT_RETENTION_DAYS: '9999'
  });
  assert.equal(clamped.likeRateLimitWindowMs, 60000);
  assert.equal(clamped.likeRateLimitMax, 20);
  assert.equal(clamped.redirectRateLimitWindowMs, 60000);
  assert.equal(clamped.redirectRateLimitMax, 120);
  assert.equal(clamped.viewCountThrottleSeconds, 300);
  assert.equal(clamped.viewCountRetentionDays, 30);
});

test('sanitizeInternalReturnPath allows only local absolute paths', () => {
  assert.equal(sanitizeInternalReturnPath('/out/12?x=1'), '/out/12?x=1');
  assert.equal(sanitizeInternalReturnPath('https://evil.example.com'), '/');
  assert.equal(sanitizeInternalReturnPath('//evil.example.com'), '/');
});

test('isValidAccessPassword enforces minimum and maximum length', () => {
  assert.equal(isValidAccessPassword('12345'), false);
  assert.equal(isValidAccessPassword('123456'), true);
  assert.equal(isValidAccessPassword('a'.repeat(128)), true);
  assert.equal(isValidAccessPassword('a'.repeat(129)), false);
});

test('hasPasswordGate detects configured hash fields', () => {
  assert.equal(hasPasswordGate({ access_password_hash: '' }), false);
  assert.equal(hasPasswordGate({ access_password_hash: '$2b$12$abc' }), true);
  assert.equal(hasPasswordGate({ page_access_password_hash: '$2b$12$abc' }), true);
});

test('buildAbsoluteAssetUrl resolves local uploads against site URL', () => {
  assert.equal(
    buildAbsoluteAssetUrl('/static/uploads/example.png', 'https://linkhub.example'),
    'https://linkhub.example/static/uploads/example.png'
  );
  assert.equal(buildAbsoluteAssetUrl('https://cdn.example/hero.jpg', 'https://linkhub.example'), 'https://cdn.example/hero.jpg');
  assert.equal(buildAbsoluteAssetUrl('/bad/path.png', 'https://linkhub.example'), '');
});

test('isSocialPreviewUserAgent detects common social preview crawlers', () => {
  assert.equal(isSocialPreviewUserAgent('facebookexternalhit/1.1'), true);
  assert.equal(isSocialPreviewUserAgent('Twitterbot/1.0'), true);
  assert.equal(isSocialPreviewUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), false);
});

test('sanitizeSettingValue normalizes theme and media settings', () => {
  assert.equal(sanitizeSettingValue('background_image_url', '/static/uploads/hero.png'), '/static/uploads/hero.png');
  assert.equal(sanitizeSettingValue('background_image_url', 'https://cdn.example/hero.png'), 'https://cdn.example/hero.png');
  assert.equal(sanitizeSettingValue('theme_color', '#ABCDEF'), '#abcdef');
  assert.equal(sanitizeSettingValue('theme_spacing_scale', '9'), '1.5');
  assert.equal(sanitizeSettingValue('theme_radius_scale', '0.1'), '0.6');
});

test('parseThemeTemplateInput validates schema and keeps only supported keys', () => {
  const parsed = parseThemeTemplateInput({
    schema: 'linkhub-theme-v1',
    name: 'My Theme',
    settings: {
      background_mode: 'gradient',
      theme_color: '#AA33BB',
      theme_spacing_scale: '1.2',
      unknown_key: 'ignored'
    }
  });

  assert.equal(parsed.name, 'My Theme');
  assert.equal(parsed.settings.background_mode, 'gradient');
  assert.equal(parsed.settings.theme_color, '#aa33bb');
  assert.equal(parsed.settings.theme_spacing_scale, '1.2');
  assert.equal('unknown_key' in parsed.settings, false);

  assert.throws(
    () =>
      parseThemeTemplateInput({
        schema: 'linkhub-theme-v999',
        settings: { theme_color: '#ff0000' }
      }),
    /Unsupported theme schema/
  );
});

test('buildThemeTemplatePayload emits v1 schema and sanitized settings payload', () => {
  const payload = buildThemeTemplatePayload('Demo Export', {
    theme_color: '#0099FF',
    background_mode: 'gradient',
    link_layout: 'grid',
    bad_key: 'drop-me'
  });

  assert.equal(payload.schema, 'linkhub-theme-v1');
  assert.equal(payload.name, 'Demo Export');
  assert.equal(payload.settings.theme_color, '#0099ff');
  assert.equal(payload.settings.background_mode, 'gradient');
  assert.equal(payload.settings.link_layout, 'grid');
  assert.equal('bad_key' in payload.settings, false);
});

test('sanitizeTargetingRules normalizes rule lists and query constraints', () => {
  const rules = sanitizeTargetingRules({
    devices: 'mobile,desktop,unknown,bad',
    countries: 'us,CA,xx,123',
    referrer_contains: 'google.com, https://x.com',
    query: { key: 'utm_source', value: 'instagram' }
  });

  assert.deepEqual(rules.devices, ['mobile', 'desktop', 'unknown']);
  assert.deepEqual(rules.countries, ['US', 'CA', 'XX']);
  assert.deepEqual(rules.referrer_contains, ['google.com', 'x.com']);
  assert.deepEqual(rules.query, { key: 'utm_source', value: 'instagram' });
});

test('schedule date helpers convert and format datetime values', () => {
  const normalized = normalizeScheduleInputToUtc('2026-03-10T15:45');
  assert.match(normalized, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:00$/);
  assert.equal(normalizeScheduleInputToUtc('not-a-date'), '');

  const display = formatScheduleForInput('2026-03-10 15:45:00');
  assert.match(display, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});
