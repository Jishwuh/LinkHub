const path = require('path');
const fs = require('fs');
const dns = require('dns').promises;
const net = require('net');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sanitizeHtml = require('sanitize-html');
const multer = require('multer');
const mysql = require('mysql2/promise');
const QRCode = require('qrcode');
const dotenv = require('dotenv');

dotenv.config({ path: process.env.ENV_FILE || '.env' });

const RESERVED_SLUGS = new Set(['admin', 'static', 'api', 'debug', 'out', 'unlock']);
const ALLOWED_EMBED_HOSTNAMES = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'player.twitch.tv',
  'www.tiktok.com',
  'tiktok.com',
  'open.spotify.com'
];
const ALLOWED_EMBED_IFRAME_ALLOW_TOKENS = [
  'accelerometer',
  'autoplay',
  'clipboard-write',
  'encrypted-media',
  'fullscreen',
  'gyroscope',
  'picture-in-picture',
  'web-share'
];
const IMAGE_UPLOAD_MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};
const MEDIA_UPLOAD_MIME_EXT = {
  ...IMAGE_UPLOAD_MIME_EXT,
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogg'
};
const ALLOWED_BACKGROUND_MODES = ['youtube', 'image', 'video', 'gradient', 'particles'];
const ALLOWED_LINK_LAYOUTS = ['list', 'grid', 'compact', 'table'];
const ALLOWED_FONT_THEMES = ['modern', 'editorial', 'rounded', 'mono'];
const ALLOWED_BUTTON_STYLES = ['rounded', 'pill', 'square', 'glass'];
const ALLOWED_ANIMATION_STYLES = ['none', 'subtle', 'energetic'];
const ALLOWED_GRADIENT_PRESETS = ['sunset', 'ocean', 'forest', 'neon', 'midnight'];
const ALLOWED_PATTERN_PRESETS = ['none', 'grid', 'dots', 'noise'];
const BLOCK_TYPES = ['heading', 'rich_text', 'button_link', 'image', 'embed', 'links_cluster'];
const BLOCK_HEADING_LEVELS = ['h1', 'h2', 'h3'];
const BLOCK_BUTTON_STYLES = ['solid', 'outline'];
const UTM_PARAM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const ACCESS_CONTEXT_TYPES = ['page', 'link', 'block', 'redirect'];
const MIN_ACCESS_PASSWORD_LENGTH = 6;
const MAX_ACCESS_PASSWORD_LENGTH = 128;
const AGE_VERIFY_UNLOCK_MAX_AGE_MS = 2 * 60 * 1000;
let countryNameResolver = null;
try {
  countryNameResolver = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  countryNameResolver = null;
}

function parseBoolean(value, defaultValue = false) {
  if (Array.isArray(value)) {
    if (!value.length) return defaultValue;
    return parseBoolean(value[value.length - 1], defaultValue);
  }
  if (value == null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parseIntegerInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

function parseTrustProxy(value, env) {
  if (value == null || value === '') return env === 'production' ? 1 : false;
  if (/^\d+$/.test(String(value))) return Number(value);
  return parseBoolean(value, false);
}

function buildConfig(envSource = process.env) {
  const env = envSource.NODE_ENV || 'development';
  return {
    env,
    isProd: env === 'production',
    port: parseInt(envSource.PORT || '3000', 10),
    publicDomain: String(envSource.PUBLIC_DOMAIN || 'localhost:3000').trim(),
    sessionSecret: String(envSource.SESSION_SECRET || '').trim(),
    adminUsername: String(envSource.ADMIN_USERNAME || 'admin').trim(),
    adminPassword: String(envSource.ADMIN_PASSWORD || '').trim(),
    bcryptRounds: Number(envSource.BCRYPT_ROUNDS || 12),
    trustProxy: parseTrustProxy(envSource.TRUST_PROXY, env),
    seedDemoData: parseBoolean(envSource.SEED_DEMO_DATA, false),
    likeRateLimitWindowMs: parseIntegerInRange(envSource.LIKE_RATE_LIMIT_WINDOW_MS, 60 * 1000, 1000, 60 * 60 * 1000),
    likeRateLimitMax: parseIntegerInRange(envSource.LIKE_RATE_LIMIT_MAX, 20, 1, 1000),
    redirectRateLimitWindowMs: parseIntegerInRange(envSource.REDIRECT_RATE_LIMIT_WINDOW_MS, 60 * 1000, 1000, 60 * 60 * 1000),
    redirectRateLimitMax: parseIntegerInRange(envSource.REDIRECT_RATE_LIMIT_MAX, 120, 1, 5000),
    viewCountThrottleSeconds: parseIntegerInRange(envSource.VIEW_COUNT_THROTTLE_SECONDS, 300, 1, 24 * 60 * 60),
    viewCountRetentionDays: parseIntegerInRange(envSource.VIEW_COUNT_RETENTION_DAYS, 30, 1, 365),
    db: {
      host: envSource.DB_HOST || '127.0.0.1',
      port: parseInt(envSource.DB_PORT || '3306', 10),
      user: envSource.DB_USER || '',
      password: envSource.DB_PASSWORD || '',
      database: envSource.DB_NAME || ''
    }
  };
}

function ensureRequiredConfig(config) {
  const missing = [];
  if (!config.db.user) missing.push('DB_USER');
  if (!config.db.database) missing.push('DB_NAME');
  if (!config.sessionSecret) missing.push('SESSION_SECRET');

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (config.isProd && config.sessionSecret.length < 24) {
    throw new Error('SESSION_SECRET must be at least 24 chars in production');
  }
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function ensureCsrfToken(req, _res, next) {
  if (!req.session) return next(new Error('Session middleware must run before CSRF middleware'));
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  return next();
}

function requireCsrf(req, res, next) {
  const token = String(req.body?._csrf || req.get('x-csrf-token') || '').trim();
  if (!token || token !== req.session?.csrfToken) {
    return res.status(403).send('Invalid CSRF token');
  }
  return next();
}

function sanitizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function sanitizeSlug(value) {
  const slug = String(value || '').trim().replace(/^\/*|\/*$/g, '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(slug)) return '';
  if (RESERVED_SLUGS.has(slug)) return '';
  return slug;
}

function sanitizeColorHex(value) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  return '';
}

function sanitizeChoice(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function sanitizeNumberRange(value, min, max, fallback, decimals = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(max, Math.max(min, parsed));
  return Number(clamped.toFixed(decimals));
}

function sanitizeEmoji(value, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return Array.from(raw).slice(0, 4).join('');
}

function parseCookieMap(cookieHeader) {
  const out = {};
  const raw = String(cookieHeader || '');
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const piece = String(part || '').trim();
    if (!piece) continue;
    const eqIdx = piece.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = piece.slice(0, eqIdx).trim();
    const valueRaw = piece.slice(eqIdx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(valueRaw);
    } catch {
      out[key] = valueRaw;
    }
  }
  return out;
}

function sanitizeInternalReturnPath(value, fallback = '/') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//')) return fallback;
  if (/[\r\n]/.test(raw)) return fallback;
  return raw.slice(0, 2048);
}

function sanitizeAccessContextType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ACCESS_CONTEXT_TYPES.includes(normalized) ? normalized : '';
}

function sanitizeAccessPassword(value) {
  return String(value || '').trim();
}

function isValidAccessPassword(value) {
  const normalized = sanitizeAccessPassword(value);
  return normalized.length >= MIN_ACCESS_PASSWORD_LENGTH && normalized.length <= MAX_ACCESS_PASSWORD_LENGTH;
}

function hasPasswordGate(row) {
  const hash = String(row?.access_password_hash || row?.page_access_password_hash || '').trim();
  return hash.length > 0;
}

function normalizeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMetaContent(html, key, attrName = 'property') {
  const safeKey = escapeRegExp(key);
  const patterns = [
    new RegExp(`<meta[^>]*${attrName}\\s*=\\s*["']${safeKey}["'][^>]*content\\s*=\\s*["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*${attrName}\\s*=\\s*["']${safeKey}["'][^>]*>`, 'i')
  ];

  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (match?.[1]) return sanitizeText(decodeHtmlEntities(match[1]), 2048);
  }
  return '';
}

function resolveAbsoluteHttpUrl(value, baseUrl) {
  const raw = sanitizeText(decodeHtmlEntities(value), 2048);
  if (!raw) return '';
  try {
    const absolute = new URL(raw, baseUrl).toString();
    return normalizeHttpUrl(absolute);
  } catch {
    return '';
  }
}

function parseLinkMetadataFromHtml(html, baseUrl) {
  const raw = String(html || '');
  const titleMatch = raw.match(/<title[^>]*>([^<]{1,500})<\/title>/i);
  const titleFromTag = titleMatch?.[1] ? sanitizeText(decodeHtmlEntities(titleMatch[1]), 255) : '';

  const title =
    extractMetaContent(raw, 'og:title', 'property') ||
    extractMetaContent(raw, 'twitter:title', 'name') ||
    titleFromTag;
  const description =
    extractMetaContent(raw, 'og:description', 'property') ||
    extractMetaContent(raw, 'twitter:description', 'name') ||
    extractMetaContent(raw, 'description', 'name');
  const siteName = extractMetaContent(raw, 'og:site_name', 'property');
  const imageRaw = extractMetaContent(raw, 'og:image', 'property') || extractMetaContent(raw, 'twitter:image', 'name');
  const previewImageUrl = resolveAbsoluteHttpUrl(imageRaw, baseUrl);

  return {
    title: sanitizeText(title, 255),
    description: sanitizeText(description, 280),
    siteName: sanitizeText(siteName, 120),
    previewImageUrl
  };
}

function isPrivateOrLoopbackIp(ipAddress) {
  const family = net.isIP(String(ipAddress || ''));
  if (!family) return true;

  const ip = String(ipAddress).trim().toLowerCase();
  if (family === 4) {
    const parts = ip.split('.').map(part => Number.parseInt(part, 10));
    if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;

    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
    return false;
  }

  // IPv6 loopback, link-local, unique-local and IPv4-mapped private/loopback.
  if (ip === '::1') return true;
  if (ip.startsWith('fe80:')) return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice(7);
    if (net.isIP(mapped) === 4) return isPrivateOrLoopbackIp(mapped);
  }
  return false;
}

async function isDisallowedOutboundHostname(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  if (normalized.endsWith('.local')) return true;

  if (net.isIP(normalized)) return isPrivateOrLoopbackIp(normalized);

  try {
    const records = await dns.lookup(normalized, { all: true });
    if (!Array.isArray(records) || records.length === 0) return true;
    return records.some(record => isPrivateOrLoopbackIp(record?.address));
  } catch {
    return true;
  }
}

function suggestIconKeyFromHostname(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase().replace(/^www\./, '');
  if (!normalized) return '';

  const hostMap = new Map([
    ['youtube.com', 'youtube'],
    ['youtu.be', 'youtube'],
    ['x.com', 'x'],
    ['twitter.com', 'twitter'],
    ['instagram.com', 'instagram'],
    ['tiktok.com', 'tiktok'],
    ['github.com', 'github'],
    ['linkedin.com', 'linkedin'],
    ['facebook.com', 'facebook'],
    ['discord.com', 'discord'],
    ['discord.gg', 'discord'],
    ['twitch.tv', 'twitch'],
    ['spotify.com', 'spotify'],
    ['reddit.com', 'reddit'],
    ['pinterest.com', 'pinterest'],
    ['snapchat.com', 'snapchat'],
    ['telegram.me', 'telegram'],
    ['t.me', 'telegram'],
    ['medium.com', 'medium'],
    ['threads.net', 'threads'],
    ['substack.com', 'substack'],
    ['patreon.com', 'patreon']
  ]);

  for (const [domain, iconKey] of hostMap.entries()) {
    if (normalized === domain || normalized.endsWith(`.${domain}`)) return iconKey;
  }

  const label = normalized.split('.').filter(Boolean)[0] || '';
  if (!label) return '';
  const candidate = label.replace(/[^a-z0-9_-]/g, '').slice(0, 50);
  return candidate;
}

function sanitizeUtmParamValue(value) {
  return sanitizeText(value, 120).replace(/[\r\n\t]/g, ' ');
}

function readUtmParamsFromQuery(query) {
  const params = {};
  let hasAny = false;
  for (const key of UTM_PARAM_KEYS) {
    const value = sanitizeUtmParamValue(query?.[key]);
    params[key] = value;
    if (value) hasAny = true;
  }
  return { params, hasAny };
}

function buildTrackedDestinationUrl(baseUrl, utmParams) {
  const normalizedBase = normalizeHttpUrl(baseUrl);
  if (!normalizedBase) return '';

  let parsed;
  try {
    parsed = new URL(normalizedBase);
  } catch {
    return '';
  }

  for (const key of UTM_PARAM_KEYS) {
    const value = sanitizeUtmParamValue(utmParams?.[key]);
    if (value) parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

function parseReferrerHost(referrerUrl) {
  const normalized = normalizeHttpUrl(referrerUrl);
  if (!normalized) return '';
  try {
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function detectDeviceType(userAgentValue) {
  const ua = String(userAgentValue || '').toLowerCase();
  if (!ua) return 'unknown';
  if (/bot|crawl|spider|slurp|preview/.test(ua)) return 'bot';
  if (/tablet|ipad/.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod/.test(ua)) return 'mobile';
  return 'desktop';
}

function normalizeCountryCode(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  return '';
}

function resolveCountryName(code) {
  if (!code) return '';
  if (!countryNameResolver) return code;
  return String(countryNameResolver.of(code) || code);
}

function getGeoFromRequestHeaders(req) {
  const countryCode = normalizeCountryCode(
    req.get('cf-ipcountry') || req.get('x-vercel-ip-country') || req.get('cloudfront-viewer-country') || req.get('x-country-code')
  );
  const city = sanitizeText(
    req.get('x-vercel-ip-city') || req.get('cloudfront-viewer-city') || req.get('cf-ipcity') || req.get('x-geo-city'),
    100
  );

  return {
    countryCode,
    countryName: resolveCountryName(countryCode),
    city
  };
}

function parseAnalyticsDays(value, fallback = 30) {
  const allowed = [1, 7, 30, 90, 365];
  const parsed = Number.parseInt(String(value || ''), 10);
  if (allowed.includes(parsed)) return parsed;
  return fallback;
}

function csvEscape(value) {
  const raw = String(value ?? '');
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function normalizePublicDomain(value) {
  const raw = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return raw || 'localhost:3000';
}

function normalizeLocalAssetPath(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith('/static/uploads/')) return '';
  if (raw.includes('..')) return '';
  return raw;
}

function normalizeMediaAsset(value) {
  return normalizeHttpUrl(value) || normalizeLocalAssetPath(value);
}

function mediaLooksLikeVideo(value) {
  const raw = String(value || '').toLowerCase();
  return /\.(mp4|webm|ogg)(\?|#|$)/.test(raw);
}

function sanitizeRichText(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: ['p', 'b', 'i', 'em', 'strong', 'a', 'br', 'ul', 'ol', 'li', 'span', 'small'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' })
    }
  });
}

function sanitizeFooterHtml(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: ['p', 'b', 'i', 'em', 'strong', 'a', 'br', 'small', 'span'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' })
    }
  });
}

function sanitizeIframeAllowAttr(value) {
  if (!value) return '';
  const tokens = String(value)
    .split(';')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  const unique = [];
  for (const token of tokens) {
    if (!ALLOWED_EMBED_IFRAME_ALLOW_TOKENS.includes(token)) continue;
    if (!unique.includes(token)) unique.push(token);
  }
  return unique.join('; ');
}

function sanitizeEmbedHtml(value) {
  const cleaned = sanitizeHtml(String(value || ''), {
    allowedTags: ['iframe'],
    allowedAttributes: {
      iframe: ['src', 'title', 'width', 'height', 'allow', 'allowfullscreen']
    },
    allowedSchemes: ['https'],
    allowedSchemesByTag: { iframe: ['https'] },
    allowedIframeHostnames: ALLOWED_EMBED_HOSTNAMES,
    enforceHtmlBoundary: true,
    transformTags: {
      iframe: (tagName, attribs) => {
        const src = normalizeHttpUrl(attribs.src);
        if (!src) return { tagName: 'iframe', attribs: {} };

        let hostname = '';
        try {
          const parsed = new URL(src);
          if (parsed.protocol !== 'https:') return { tagName: 'iframe', attribs: {} };
          hostname = parsed.hostname.toLowerCase();
        } catch {
          return { tagName: 'iframe', attribs: {} };
        }

        if (!ALLOWED_EMBED_HOSTNAMES.includes(hostname)) {
          return { tagName: 'iframe', attribs: {} };
        }

        const safeAttrs = {
          src,
          title: sanitizeText(attribs.title || 'Embedded content', 140),
          loading: 'lazy',
          referrerpolicy: 'strict-origin-when-cross-origin',
          allowfullscreen: 'allowfullscreen'
        };

        const width = Number.parseInt(attribs.width || '', 10);
        const height = Number.parseInt(attribs.height || '', 10);
        if (Number.isFinite(width)) safeAttrs.width = String(Math.max(200, Math.min(1920, width)));
        if (Number.isFinite(height)) safeAttrs.height = String(Math.max(120, Math.min(1080, height)));

        const allow = sanitizeIframeAllowAttr(attribs.allow);
        if (allow) safeAttrs.allow = allow;

        return { tagName: 'iframe', attribs: safeAttrs };
      }
    }
  });

  const firstIframeWithSrc = cleaned.match(/<iframe\b[^>]*\bsrc=(["'])https:\/\/[^"']+\1[^>]*><\/iframe>/i);
  return firstIframeWithSrc ? firstIframeWithSrc[0] : '';
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}

function normalizeBlockData(type, rawData) {
  const data = parseJsonObject(rawData);

  if (type === 'heading') {
    const text = sanitizeText(data.text, 180);
    const level = sanitizeChoice(data.level, BLOCK_HEADING_LEVELS, 'h2');
    if (!text) return null;
    return { text, level };
  }

  if (type === 'rich_text') {
    const html = sanitizeRichText(data.html || data.content || '');
    if (!html) return null;
    return { html };
  }

  if (type === 'button_link') {
    const label = sanitizeText(data.label, 120);
    const url = normalizeHttpUrl(data.url);
    const style = sanitizeChoice(data.style, BLOCK_BUTTON_STYLES, 'solid');
    const newTab = parseBoolean(data.new_tab, true) ? 1 : 0;
    if (!label || !url) return null;
    return {
      label,
      url,
      style,
      new_tab: newTab
    };
  }

  if (type === 'image') {
    const src = normalizeMediaAsset(data.src || data.url);
    const alt = sanitizeText(data.alt, 180);
    const caption = sanitizeText(data.caption, 255);
    if (!src) return null;
    return {
      src,
      alt,
      caption
    };
  }

  if (type === 'embed') {
    const title = sanitizeText(data.title, 140);
    const embedHtml = sanitizeEmbedHtml(data.embed_html || data.html || '');
    if (!embedHtml) return null;
    return {
      title,
      embed_html: embedHtml
    };
  }

  if (type === 'links_cluster') {
    return {};
  }

  return null;
}

function normalizeBlockDataFromBody(type, body) {
  if (type === 'heading') {
    return normalizeBlockData(type, {
      text: body?.heading_text,
      level: body?.heading_level
    });
  }

  if (type === 'rich_text') {
    return normalizeBlockData(type, {
      html: body?.rich_html
    });
  }

  if (type === 'button_link') {
    return normalizeBlockData(type, {
      label: body?.button_label,
      url: body?.button_url,
      style: body?.button_style,
      new_tab: body?.button_new_tab
    });
  }

  if (type === 'image') {
    return normalizeBlockData(type, {
      src: body?.image_src,
      alt: body?.image_alt,
      caption: body?.image_caption
    });
  }

  if (type === 'embed') {
    return normalizeBlockData(type, {
      title: body?.embed_title,
      embed_html: body?.embed_html
    });
  }

  if (type === 'links_cluster') {
    return normalizeBlockData(type, {});
  }

  return null;
}

function blockSummary(type, dataObj) {
  const data = normalizeBlockData(type, dataObj);
  if (!data) return '(invalid block)';
  if (type === 'heading') return `${data.level.toUpperCase()}: ${data.text}`;
  if (type === 'rich_text') return sanitizeText(String(data.html).replace(/<[^>]+>/g, ' '), 120) || 'Rich text';
  if (type === 'button_link') return `${data.label} -> ${data.url}`;
  if (type === 'image') return data.caption || data.alt || data.src;
  if (type === 'embed') return data.title || 'Embed block';
  if (type === 'links_cluster') return 'Renders all links from Links section';
  return '';
}

function normalizeBlockRow(row) {
  if (!row) return null;
  const type = sanitizeChoice(row.type, BLOCK_TYPES, '');
  if (!type) return null;
  const dataObj = normalizeBlockData(type, row.data);
  if (!dataObj) return null;
  return {
    id: Number(row.id || 0),
    page_id: Number(row.page_id || 1),
    type,
    order_index: Number(row.order_index || 0),
    is_visible: Number(row.is_visible || 0) ? 1 : 0,
    has_password: hasPasswordGate(row) ? 1 : 0,
    is_age_restricted: parseBoolean(row.is_age_restricted, false) ? 1 : 0,
    is_spoiler: parseBoolean(row.is_spoiler, false) ? 1 : 0,
    data_obj: dataObj,
    summary: blockSummary(type, dataObj)
  };
}

function safeJsonForAttr(value) {
  return encodeURIComponent(String(value || ''));
}

function createDbPool(config) {
  return mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

function createApp(passedConfig) {
  const config = passedConfig || buildConfig();
  ensureRequiredConfig(config);
  config.publicDomain = normalizePublicDomain(config.publicDomain);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          frameSrc: [
            'https://www.youtube.com',
            'https://www.youtube-nocookie.com',
            'https://player.twitch.tv',
            'https://www.tiktok.com',
            'https://open.spotify.com'
          ],
          mediaSrc: ["'self'", 'https:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.isProd ? [] : null
        }
      },
      crossOriginEmbedderPolicy: false
    })
  );

  const publicDir = path.join(__dirname, 'public');
  app.use('/static', express.static(publicDir, { maxAge: '7d', etag: true }));

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({ limit: '128kb' }));

  const pool = createDbPool(config);
  const run = async (sql, params = []) => {
    await pool.query(sql, params);
  };
  const runResult = async (sql, params = []) => (await pool.query(sql, params))[0];
  const q = async (sql, params = []) => (await pool.query(sql, params))[0];
  const get = async (sql, params = []) => {
    const rows = await q(sql, params);
    return rows[0] || null;
  };
  const wantsJson = req => {
    const accept = String(req.get('accept') || '').toLowerCase();
    const requestedWith = String(req.get('x-requested-with') || '').toLowerCase();
    return requestedWith === 'fetch' || accept.includes('application/json');
  };

  const MySQLStoreFactory = require('express-mysql-session');
  const MySQLStore = MySQLStoreFactory(session);
  const sessionStore = new MySQLStore({}, pool);
  app.use(
    session({
      name: 'linkhub.sid',
      store: sessionStore,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      proxy: !!config.trustProxy,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProd,
        maxAge: 1000 * 60 * 60 * 24 * 7
      }
    })
  );

  app.use(ensureCsrfToken);

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false
  });
  const likeLimiter = rateLimit({
    windowMs: config.likeRateLimitWindowMs,
    max: config.likeRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false
  });
  const redirectLimiter = rateLimit({
    windowMs: config.redirectRateLimitWindowMs,
    max: config.redirectRateLimitMax,
    message: 'Too many redirect requests. Please retry shortly.',
    standardHeaders: true,
    legacyHeaders: false
  });
  const unlockLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    message: 'Too many unlock attempts. Please retry later.',
    standardHeaders: true,
    legacyHeaders: false
  });

  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = MEDIA_UPLOAD_MIME_EXT[file.mimetype] || 'bin';
      const isOG = file.fieldname === 'og_image_file';
      const isBackground = file.fieldname === 'background_media_file';
      const random = crypto.randomBytes(12).toString('hex');
      const prefix = isBackground ? 'bg' : isOG ? 'og' : 'avatar';
      cb(null, `${prefix}-${Date.now()}-${random}.${ext}`);
    }
  });
  const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.fieldname === 'background_media_file') {
        const ok = Object.prototype.hasOwnProperty.call(MEDIA_UPLOAD_MIME_EXT, file.mimetype);
        cb(ok ? null : new Error('Background upload must be image/video (PNG/JPG/WEBP/GIF/MP4/WEBM/OGG)'), ok);
        return;
      }

      const ok = Object.prototype.hasOwnProperty.call(IMAGE_UPLOAD_MIME_EXT, file.mimetype);
      cb(ok ? null : new Error('Only PNG/JPG/WEBP/GIF uploads are allowed'), ok);
    }
  });
  const uploadFields = upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'og_image_file', maxCount: 1 },
    { name: 'background_media_file', maxCount: 1 }
  ]);

  function requireAuth(req, res, next) {
    if (req.session.userId) return next();
    return res.redirect('/admin/login');
  }

  const clientIp = req => String(req.ip || '').trim();

  async function deleteUploadIfLocal(relUrl) {
    const localPath = normalizeLocalAssetPath(relUrl);
    if (!localPath) return;

    const filePath = path.join(__dirname, 'public', localPath.replace(/^\/static\//, ''));
    const rel = path.relative(uploadsDir, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return;

    try {
      await fs.promises.unlink(filePath);
    } catch {
      // Ignore missing files.
    }
  }

  async function ensureTableColumns(tableName, definitions) {
    const cols = await q(`SHOW COLUMNS FROM \`${tableName}\``).catch(() => []);
    if (!Array.isArray(cols) || cols.length === 0) return;
    const names = new Set(cols.map(c => c.Field));
    for (const [name, ddl] of definitions) {
      if (names.has(name)) continue;
      await run(`ALTER TABLE \`${tableName}\` ADD COLUMN ${ddl}`);
    }
  }

  async function ensureLinksSchema() {
    await ensureTableColumns('links', [
      ['access_password_hash', 'access_password_hash VARCHAR(255) NULL AFTER color_hex'],
      ['is_age_restricted', 'is_age_restricted TINYINT(1) NOT NULL DEFAULT 0 AFTER access_password_hash'],
      ['is_spoiler', 'is_spoiler TINYINT(1) NOT NULL DEFAULT 0 AFTER is_age_restricted']
    ]);
  }

  async function ensureBlocksSchema() {
    await ensureTableColumns('blocks', [
      ['access_password_hash', 'access_password_hash VARCHAR(255) NULL AFTER is_visible'],
      ['is_age_restricted', 'is_age_restricted TINYINT(1) NOT NULL DEFAULT 0 AFTER access_password_hash'],
      ['is_spoiler', 'is_spoiler TINYINT(1) NOT NULL DEFAULT 0 AFTER is_age_restricted']
    ]);
  }

  async function ensureRedirectsSchema() {
    const cols = await q('SHOW COLUMNS FROM redirects').catch(() => []);
    if (!Array.isArray(cols) || cols.length === 0) return;

    const names = cols.map(c => c.Field);
    if (!names.includes('is_active')) {
      await run('ALTER TABLE redirects ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1');
    }
    if (!names.includes('access_password_hash')) {
      await run('ALTER TABLE redirects ADD COLUMN access_password_hash VARCHAR(255) NULL AFTER is_active');
    }
    if (!names.includes('is_age_restricted')) {
      await run('ALTER TABLE redirects ADD COLUMN is_age_restricted TINYINT(1) NOT NULL DEFAULT 0 AFTER access_password_hash');
    }

    const idx = await q('SHOW INDEX FROM redirects WHERE Key_name = "uq_redirects_slug"').catch(() => []);
    if (!idx || idx.length === 0) {
      const anySlugIdx = await q('SHOW INDEX FROM redirects WHERE Column_name = "slug"').catch(() => []);
      const nonUnique = (anySlugIdx || []).find(i => i.Non_unique === 1);
      if (nonUnique) await run(`ALTER TABLE redirects DROP INDEX \`${nonUnique.Key_name}\``);
      await run('ALTER TABLE redirects ADD UNIQUE KEY uq_redirects_slug (slug)');
    }
  }

  async function ensureClickEventsSchema() {
    await run(`
      CREATE TABLE IF NOT EXISTS click_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        event_type ENUM('link', 'redirect') NOT NULL,
        link_id INT NULL,
        redirect_id INT NULL,
        redirect_slug VARCHAR(191) NULL,
        destination_url VARCHAR(2048) NOT NULL,
        referrer_url VARCHAR(2048) NULL,
        referrer_host VARCHAR(255) NULL,
        device_type VARCHAR(32) NOT NULL DEFAULT 'unknown',
        country_code CHAR(2) NULL,
        country_name VARCHAR(120) NULL,
        city VARCHAR(100) NULL,
        ip_hash CHAR(64) NULL,
        utm_source VARCHAR(120) NULL,
        utm_medium VARCHAR(120) NULL,
        utm_campaign VARCHAR(120) NULL,
        utm_term VARCHAR(120) NULL,
        utm_content VARCHAR(120) NULL,
        clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_click_events_clicked_at (clicked_at),
        INDEX idx_click_events_type (event_type),
        INDEX idx_click_events_link_id (link_id),
        INDEX idx_click_events_redirect_id (redirect_id),
        INDEX idx_click_events_country_code (country_code),
        INDEX idx_click_events_referrer_host (referrer_host),
        INDEX idx_click_events_device_type (device_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  async function ensureVisitThrottleSchema() {
    await run(`
      CREATE TABLE IF NOT EXISTS visit_throttle (
        visitor_hash CHAR(64) PRIMARY KEY,
        last_counted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_visit_throttle_last_counted_at (last_counted_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  async function ensureLinksClusterBlock() {
    const blockCountRow = await get('SELECT COUNT(*) AS c FROM blocks WHERE page_id = 1');
    if (!blockCountRow || Number(blockCountRow.c) === 0) return;

    const existing = await get('SELECT id FROM blocks WHERE page_id = 1 AND type = ? LIMIT 1', ['links_cluster']);
    if (existing?.id) return;

    const maxRow = await get('SELECT COALESCE(MAX(order_index), 0) AS max_order FROM blocks WHERE page_id = 1');
    const nextOrder = Number(maxRow?.max_order || 0) + 1;
    await run('INSERT INTO blocks (page_id, type, data, order_index, is_visible) VALUES (?,?,?,?,?)', [1, 'links_cluster', JSON.stringify({}), nextOrder, 1]);
  }

  function hashClientIp(ipValue) {
    const ip = String(ipValue || '').trim();
    if (!ip) return '';
    return crypto.createHash('sha256').update(`${config.sessionSecret}:${ip}`).digest('hex');
  }

  function getSessionUnlockStore(req) {
    if (!req.session) return null;
    if (!req.session.access_unlocks || typeof req.session.access_unlocks !== 'object') {
      req.session.access_unlocks = { page: 0, link: {}, block: {}, redirect: {} };
    }
    const store = req.session.access_unlocks;
    if (!store.link || typeof store.link !== 'object') store.link = {};
    if (!store.block || typeof store.block !== 'object') store.block = {};
    if (!store.redirect || typeof store.redirect !== 'object') store.redirect = {};
    return store;
  }

  function normalizeUnlockKey(contextType, idOrSlug) {
    const kind = sanitizeAccessContextType(contextType);
    if (kind === 'page') return 'page';
    if (kind === 'redirect') return sanitizeSlug(idOrSlug);
    const parsed = Number.parseInt(String(idOrSlug || ''), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return '';
    return String(parsed);
  }

  function isUnlocked(req, contextType, idOrSlug) {
    const store = getSessionUnlockStore(req);
    if (!store) return false;
    const kind = sanitizeAccessContextType(contextType);
    const key = normalizeUnlockKey(kind, idOrSlug);
    if (!kind || !key) return false;
    if (kind === 'page') return Number(store.page || 0) > 0;
    return Number(store[kind]?.[key] || 0) > 0;
  }

  function markUnlocked(req, contextType, idOrSlug) {
    const store = getSessionUnlockStore(req);
    if (!store) return;
    const kind = sanitizeAccessContextType(contextType);
    const key = normalizeUnlockKey(kind, idOrSlug);
    if (!kind || !key) return;
    const now = Date.now();
    if (kind === 'page') {
      store.page = now;
      return;
    }
    store[kind][key] = now;
  }

  function getAgeUnlockStore(req) {
    if (!req.session) return null;
    if (!req.session.age_unlock_paths || typeof req.session.age_unlock_paths !== 'object') {
      req.session.age_unlock_paths = {};
    }
    return req.session.age_unlock_paths;
  }

  function isAgeVerified(req) {
    if (req._ageVerifiedCached != null) {
      return req._ageVerifiedCached === true;
    }

    const store = getAgeUnlockStore(req);
    const now = Date.now();
    if (!store) {
      req._ageVerifiedCached = false;
      return false;
    }

    for (const [pathKey, expiresAt] of Object.entries(store)) {
      if (!pathKey || Number(expiresAt || 0) < now) {
        delete store[pathKey];
      }
    }

    const currentPath = sanitizeInternalReturnPath(req.originalUrl || req.path || '/', '/');
    const expiresAt = Number(store[currentPath] || 0);
    const ok = Number.isFinite(expiresAt) && expiresAt >= now;
    if (ok) {
      delete store[currentPath];
    }
    req._ageVerifiedCached = ok;
    return ok;
  }

  function markAgeVerified(req, _res, returnTo) {
    const store = getAgeUnlockStore(req);
    if (!store) return;
    const path = sanitizeInternalReturnPath(returnTo, '/');
    store[path] = Date.now() + AGE_VERIFY_UNLOCK_MAX_AGE_MS;
  }

  async function verifyPasswordAgainstHash(password, hash) {
    const normalized = sanitizeAccessPassword(password);
    const stored = String(hash || '').trim();
    if (!isValidAccessPassword(normalized) || !stored) return false;
    try {
      return await bcrypt.compare(normalized, stored);
    } catch {
      return false;
    }
  }

  async function createAccessPasswordHash(rawPassword) {
    const normalized = sanitizeAccessPassword(rawPassword);
    if (!isValidAccessPassword(normalized)) return '';
    const rounds = Number.isFinite(config.bcryptRounds) && config.bcryptRounds >= 8 ? config.bcryptRounds : 12;
    return bcrypt.hash(normalized, Number(rounds));
  }

  function shouldGateByAge(rowOrSettings, req) {
    const restricted = parseBoolean(rowOrSettings?.is_age_restricted ?? rowOrSettings?.page_is_age_restricted, false);
    if (!restricted) return false;
    return !isAgeVerified(req);
  }

  function getRowAccessState(req, contextType, row, keyOverride = '') {
    const key = keyOverride || row?.id || row?.slug || '';
    const passwordLocked = hasPasswordGate(row) ? !isUnlocked(req, contextType, key) : false;
    const ageLocked = shouldGateByAge(row, req);
    return {
      has_password: hasPasswordGate(row),
      password_locked: passwordLocked,
      is_age_restricted: parseBoolean(row?.is_age_restricted, false) ? 1 : 0,
      age_locked: ageLocked,
      is_spoiler: parseBoolean(row?.is_spoiler, false) ? 1 : 0
    };
  }

  function sanitizeLinkForAdmin(row) {
    if (!row) return null;
    return {
      id: Number(row.id || 0),
      title: row.title || '',
      url: row.url || '',
      icon_key: row.icon_key || '',
      order_index: Number(row.order_index || 0),
      is_visible: Number(row.is_visible || 0) ? 1 : 0,
      color_hex: row.color_hex || '',
      has_password: hasPasswordGate(row) ? 1 : 0,
      is_age_restricted: parseBoolean(row.is_age_restricted, false) ? 1 : 0,
      is_spoiler: parseBoolean(row.is_spoiler, false) ? 1 : 0
    };
  }

  function sanitizeRedirectForAdmin(row) {
    if (!row) return null;
    return {
      id: Number(row.id || 0),
      slug: row.slug || '',
      target_url: row.target_url || '',
      is_active: Number(row.is_active || 0) ? 1 : 0,
      has_password: hasPasswordGate(row) ? 1 : 0,
      is_age_restricted: parseBoolean(row.is_age_restricted, false) ? 1 : 0
    };
  }

  function sanitizeBlockForAdmin(row) {
    const normalized = normalizeBlockRow(row);
    if (!normalized) return null;
    const { access_password_hash: _ignoredHash, ...rest } = normalized;
    return {
      ...rest,
      has_password: hasPasswordGate(row) ? 1 : 0,
      is_age_restricted: parseBoolean(row?.is_age_restricted, false) ? 1 : 0,
      is_spoiler: parseBoolean(row?.is_spoiler, false) ? 1 : 0
    };
  }

  function renderAccessGate(res, payload = {}) {
    const mode = payload.mode === 'age' ? 'age' : 'password';
    const contextType = sanitizeAccessContextType(payload.contextType);
    const contextIdOrSlug = String(payload.contextIdOrSlug || '').trim();
    const returnTo = sanitizeInternalReturnPath(payload.returnTo, '/');
    const title = sanitizeText(payload.title || 'Protected Content', 140) || 'Protected Content';
    const subtitle = sanitizeText(payload.subtitle || '', 255);
    const csrfToken = String(payload.csrfToken || '');
    const statusCode = Number.isInteger(payload.status) && payload.status >= 200 ? payload.status : 200;

    return res.status(statusCode).render('access_gate', {
      mode,
      title,
      subtitle,
      returnTo,
      contextType,
      contextIdOrSlug,
      csrfToken
    });
  }

  function getVisitorHash(req) {
    const ipHash = hashClientIp(clientIp(req));
    if (ipHash) return ipHash;

    const userAgent = sanitizeText(req.get('user-agent'), 256);
    const language = sanitizeText(req.get('accept-language'), 120);
    if (!userAgent && !language) return '';
    return crypto.createHash('sha256').update(`${config.sessionSecret}:visitor:${userAgent}:${language}`).digest('hex');
  }

  async function shouldCountVisit(req) {
    const visitorHash = getVisitorHash(req);
    if (!visitorHash) return true;

    const insertResult = await runResult('INSERT IGNORE INTO visit_throttle (visitor_hash, last_counted_at) VALUES (?, UTC_TIMESTAMP())', [visitorHash]);
    if (Number(insertResult?.affectedRows || 0) === 1) return true;

    const updateResult = await runResult(
      `
        UPDATE visit_throttle
        SET last_counted_at = UTC_TIMESTAMP()
        WHERE visitor_hash = ?
          AND last_counted_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? SECOND)
      `,
      [visitorHash, config.viewCountThrottleSeconds]
    );
    return Number(updateResult?.affectedRows || 0) > 0;
  }

  async function recordClickEvent(req, payload) {
    const eventType = payload?.eventType === 'redirect' ? 'redirect' : 'link';
    const linkId = Number(payload?.linkId || 0) || null;
    const redirectId = Number(payload?.redirectId || 0) || null;
    const redirectSlug = sanitizeText(payload?.redirectSlug || '', 191);
    const destinationUrl = normalizeHttpUrl(payload?.destinationUrl);
    if (!destinationUrl) return;

    const utm = payload?.utm || readUtmParamsFromQuery(req.query).params;
    const referrerUrl = normalizeHttpUrl(req.get('referer'));
    const referrerHost = parseReferrerHost(referrerUrl);
    const userAgent = sanitizeText(req.get('user-agent'), 512);
    const geo = getGeoFromRequestHeaders(req);
    const deviceType = detectDeviceType(userAgent);
    const ipHash = hashClientIp(clientIp(req));

    await run(
      `INSERT INTO click_events (
        event_type, link_id, redirect_id, redirect_slug, destination_url,
        referrer_url, referrer_host, device_type, country_code, country_name, city, ip_hash,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventType,
        linkId,
        redirectId,
        redirectSlug || null,
        destinationUrl,
        referrerUrl || null,
        referrerHost || null,
        deviceType,
        geo.countryCode || null,
        geo.countryName || null,
        geo.city || null,
        ipHash || null,
        sanitizeUtmParamValue(utm.utm_source) || null,
        sanitizeUtmParamValue(utm.utm_medium) || null,
        sanitizeUtmParamValue(utm.utm_campaign) || null,
        sanitizeUtmParamValue(utm.utm_term) || null,
        sanitizeUtmParamValue(utm.utm_content) || null
      ]
    );
  }

  async function getAnalyticsSnapshot(days) {
    const safeDays = parseAnalyticsDays(days);
    const visits = await get('SELECT `value` AS v FROM metrics WHERE `key` = ?', ['visits']);
    const totalVisits = Number(visits?.v || 0);

    const totalsRow = await get(
      `
        SELECT
          COUNT(*) AS total_clicks,
          SUM(CASE WHEN event_type = 'link' THEN 1 ELSE 0 END) AS link_clicks,
          SUM(CASE WHEN event_type = 'redirect' THEN 1 ELSE 0 END) AS redirect_clicks,
          COUNT(DISTINCT ip_hash) AS unique_clickers
        FROM click_events
        WHERE clicked_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
      `,
      [safeDays]
    );

    const linkRowsRaw = await q(
      `
        SELECT
          l.id,
          l.title,
          l.url,
          COALESCE(COUNT(e.id), 0) AS clicks,
          COALESCE(COUNT(DISTINCT e.ip_hash), 0) AS unique_clicks
        FROM links l
        LEFT JOIN click_events e
          ON e.link_id = l.id
          AND e.event_type = 'link'
          AND e.clicked_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
        GROUP BY l.id, l.title, l.url, l.order_index
        ORDER BY clicks DESC, l.order_index ASC, l.id ASC
      `,
      [safeDays]
    );

    const linkRows = linkRowsRaw.map(row => {
      const clicks = Number(row.clicks || 0);
      const ctr = totalVisits > 0 ? (clicks / totalVisits) * 100 : 0;
      return {
        id: Number(row.id),
        title: row.title,
        url: row.url,
        clicks,
        unique_clicks: Number(row.unique_clicks || 0),
        ctr
      };
    });

    const redirectRowsRaw = await q(
      `
        SELECT
          r.id,
          r.slug,
          r.target_url,
          COALESCE(COUNT(e.id), 0) AS clicks,
          COALESCE(COUNT(DISTINCT e.ip_hash), 0) AS unique_clicks
        FROM redirects r
        LEFT JOIN click_events e
          ON e.redirect_id = r.id
          AND e.event_type = 'redirect'
          AND e.clicked_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
        GROUP BY r.id, r.slug, r.target_url
        ORDER BY clicks DESC, r.slug ASC
      `,
      [safeDays]
    );
    const redirectRows = redirectRowsRaw.map(row => ({
      id: Number(row.id),
      slug: row.slug,
      target_url: row.target_url,
      clicks: Number(row.clicks || 0),
      unique_clicks: Number(row.unique_clicks || 0)
    }));

    const referrers = await q(
      `
        SELECT
          COALESCE(NULLIF(referrer_host, ''), 'direct') AS referrer,
          COUNT(*) AS clicks
        FROM click_events
        WHERE clicked_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
        GROUP BY referrer
        ORDER BY clicks DESC
        LIMIT 12
      `,
      [safeDays]
    );

    const devices = await q(
      `
        SELECT device_type, COUNT(*) AS clicks
        FROM click_events
        WHERE clicked_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
        GROUP BY device_type
        ORDER BY clicks DESC
      `,
      [safeDays]
    );

    const countries = await q(
      `
        SELECT
          COALESCE(NULLIF(country_name, ''), NULLIF(country_code, ''), 'Unknown') AS country,
          COUNT(*) AS clicks
        FROM click_events
        WHERE clicked_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
        GROUP BY country
        ORDER BY clicks DESC
        LIMIT 15
      `,
      [safeDays]
    );

    const cityRows = await q(
      `
        SELECT
          city,
          country_code,
          COUNT(*) AS clicks
        FROM click_events
        WHERE clicked_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
          AND city IS NOT NULL
          AND city <> ''
        GROUP BY city, country_code
        ORDER BY clicks DESC
        LIMIT 15
      `,
      [safeDays]
    );
    const cities = cityRows.map(row => ({
      city: row.country_code ? `${row.city}, ${row.country_code}` : row.city,
      clicks: Number(row.clicks || 0)
    }));

    const hourRows = await q(
      `
        SELECT HOUR(clicked_at) AS hour_of_day, COUNT(*) AS clicks
        FROM click_events
        WHERE clicked_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
        GROUP BY HOUR(clicked_at)
        ORDER BY hour_of_day ASC
      `,
      [safeDays]
    );

    const hourMap = new Map(hourRows.map(row => [Number(row.hour_of_day), Number(row.clicks || 0)]));
    const timeOfDay = Array.from({ length: 24 }, (_value, hour) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      clicks: hourMap.get(hour) || 0
    }));

    const utmRows = await q(
      `
        SELECT
          COALESCE(NULLIF(utm_source, ''), '(none)') AS source,
          COALESCE(NULLIF(utm_medium, ''), '(none)') AS medium,
          COALESCE(NULLIF(utm_campaign, ''), '(none)') AS campaign,
          COUNT(*) AS clicks
        FROM click_events
        WHERE clicked_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
        GROUP BY source, medium, campaign
        ORDER BY clicks DESC
        LIMIT 20
      `,
      [safeDays]
    );

    return {
      days: safeDays,
      total_visits: totalVisits,
      total_clicks: Number(totalsRow?.total_clicks || 0),
      link_clicks: Number(totalsRow?.link_clicks || 0),
      redirect_clicks: Number(totalsRow?.redirect_clicks || 0),
      unique_clickers: Number(totalsRow?.unique_clickers || 0),
      overall_ctr: totalVisits > 0 ? (Number(totalsRow?.total_clicks || 0) / totalVisits) * 100 : 0,
      links: linkRows,
      redirects: redirectRows,
      referrers: referrers.map(row => ({ referrer: row.referrer, clicks: Number(row.clicks || 0) })),
      devices: devices.map(row => ({ device_type: row.device_type || 'unknown', clicks: Number(row.clicks || 0) })),
      countries: countries.map(row => ({ country: row.country, clicks: Number(row.clicks || 0) })),
      cities,
      time_of_day: timeOfDay,
      utm: utmRows.map(row => ({
        source: row.source,
        medium: row.medium,
        campaign: row.campaign,
        clicks: Number(row.clicks || 0)
      }))
    };
  }

  async function getSettingsMap() {
    const rows = await q('SELECT `key`, value FROM settings');
    const map = {};
    for (const row of rows) map[row.key] = row.value;
    return map;
  }

  function resolveUiSettings(rawSettings) {
    const settings = { ...rawSettings };
    const backgroundMode = sanitizeChoice(settings.background_mode, ALLOWED_BACKGROUND_MODES, 'youtube');
    const backgroundMedia = normalizeMediaAsset(settings.background_media_path);
    const backgroundImageUrl = normalizeMediaAsset(settings.background_image_url);
    const backgroundVideoUrl = normalizeMediaAsset(settings.background_video_url);

    let backgroundImageSrc = '';
    let backgroundVideoSrc = '';

    if (backgroundMode === 'image') {
      if (backgroundMedia && !mediaLooksLikeVideo(backgroundMedia)) backgroundImageSrc = backgroundMedia;
      else if (backgroundImageUrl) backgroundImageSrc = backgroundImageUrl;
    } else if (backgroundMode === 'video') {
      if (backgroundMedia && mediaLooksLikeVideo(backgroundMedia)) backgroundVideoSrc = backgroundMedia;
      else if (backgroundVideoUrl) backgroundVideoSrc = backgroundVideoUrl;
    }

    if (backgroundMode === 'image' && !backgroundImageSrc) {
      backgroundImageSrc = normalizeLocalAssetPath(settings.avatar_path);
    }

    return {
      ...settings,
      bg_youtube_id: String(settings.bg_youtube_id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32),
      background_mode: backgroundMode,
      background_media_path: backgroundMedia,
      background_image_url: backgroundImageUrl,
      background_video_url: backgroundVideoUrl,
      background_image_src: backgroundImageSrc,
      background_video_src: backgroundVideoSrc,
      background_gradient: sanitizeChoice(settings.background_gradient, ALLOWED_GRADIENT_PRESETS, 'sunset'),
      background_pattern: sanitizeChoice(settings.background_pattern, ALLOWED_PATTERN_PRESETS, 'none'),
      link_layout: sanitizeChoice(settings.link_layout, ALLOWED_LINK_LAYOUTS, 'list'),
      font_theme: sanitizeChoice(settings.font_theme, ALLOWED_FONT_THEMES, 'modern'),
      button_style: sanitizeChoice(settings.button_style, ALLOWED_BUTTON_STYLES, 'rounded'),
      animation_style: sanitizeChoice(settings.animation_style, ALLOWED_ANIMATION_STYLES, 'subtle'),
      overlay_opacity: sanitizeNumberRange(settings.overlay_opacity, 0, 0.9, 0.55, 2),
      background_blur: sanitizeNumberRange(settings.background_blur, 0, 20, 8, 1),
      particles_density: sanitizeNumberRange(settings.particles_density, 20, 180, 80, 0),
      particles_speed: sanitizeNumberRange(settings.particles_speed, 0.2, 3, 1, 2),
      avatar_emoji: sanitizeEmoji(settings.avatar_emoji, '🙂'),
      like_emoji: sanitizeEmoji(settings.like_emoji, '❤'),
      share_emoji: sanitizeEmoji(settings.share_emoji, '🔗'),
      page_is_age_restricted: parseBoolean(settings.page_is_age_restricted, false) ? '1' : '0',
      page_has_password: hasPasswordGate({ page_access_password_hash: settings.page_access_password_hash }) ? '1' : '0'
    };
  }

  async function seedDemoData() {
    if (!config.seedDemoData) return;

    await run(
      'INSERT INTO settings (`key`, value) VALUES (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?), (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
      [
        'background_mode',
        'gradient',
        'background_gradient',
        'midnight',
        'background_pattern',
        'noise',
        'link_layout',
        'grid',
        'font_theme',
        'rounded',
        'button_style',
        'glass',
        'animation_style',
        'energetic'
      ]
    );

    const linksCount = await get('SELECT COUNT(*) AS c FROM links');
    if (!linksCount || Number(linksCount.c) === 0) {
      await run(
        'INSERT INTO links (title, url, icon_key, order_index, is_visible, color_hex) VALUES (?,?,?,?,?,?), (?,?,?,?,?,?), (?,?,?,?,?,?)',
        [
          'GitHub',
          'https://github.com/',
          'github',
          1,
          1,
          '#222222',
          'YouTube',
          'https://www.youtube.com/',
          'youtube',
          2,
          1,
          '#cc0000',
          'Discord',
          'https://discord.com/',
          'discord',
          3,
          1,
          '#5865f2'
        ]
      );
    }

    const redirectsCount = await get('SELECT COUNT(*) AS c FROM redirects');
    if (!redirectsCount || Number(redirectsCount.c) === 0) {
      await run('INSERT INTO redirects (slug, target_url, is_active) VALUES (?,?,?)', ['portfolio', 'https://example.com', 1]);
    }

    const embedsCount = await get('SELECT COUNT(*) AS c FROM embeds');
    if (!embedsCount || Number(embedsCount.c) === 0) {
      const demoEmbed = '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="Demo Video" loading="lazy" allowfullscreen></iframe>';
      await run('INSERT INTO embeds (title, embed_html, order_index, is_visible) VALUES (?,?,?,?)', ['Demo Embed', demoEmbed, 1, 0]);
    }

    const blocksCount = await get('SELECT COUNT(*) AS c FROM blocks');
    if (!blocksCount || Number(blocksCount.c) === 0) {
      const sampleBlocks = [
        ['heading', { text: 'Welcome to LinkHub', level: 'h2' }, 1, 1],
        ['rich_text', { html: '<p>Build your page with reusable blocks, not just links.</p>' }, 2, 1],
        ['links_cluster', {}, 3, 1],
        ['image', { src: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=900&q=80', alt: 'Landscape', caption: 'Example image block' }, 4, 1],
        ['embed', { title: 'Demo Video', embed_html: '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="Demo Video" loading="lazy" allowfullscreen></iframe>' }, 5, 1]
      ];

      for (const [type, data, order, visible] of sampleBlocks) {
        await run('INSERT INTO blocks (page_id, type, data, order_index, is_visible) VALUES (?,?,?,?,?)', [1, type, JSON.stringify(data), order, visible]);
      }
    }
  }

  async function initDb() {
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(191) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'owner',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        url VARCHAR(2048) NOT NULL,
        icon_key VARCHAR(50) NULL,
        order_index INT DEFAULT 0,
        is_visible TINYINT(1) DEFAULT 1,
        color_hex VARCHAR(20) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(191) PRIMARY KEY,
        value LONGTEXT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS metrics (
        \`key\` VARCHAR(191) PRIMARY KEY,
        \`value\` BIGINT DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS likes (
        ip VARCHAR(64) PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS embeds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        embed_html LONGTEXT NOT NULL,
        order_index INT DEFAULT 0,
        is_visible TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS redirects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(191) UNIQUE NOT NULL,
        target_url VARCHAR(2048) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS blocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        page_id INT NOT NULL DEFAULT 1,
        type VARCHAR(32) NOT NULL,
        data JSON NOT NULL,
        order_index INT DEFAULT 0,
        is_visible TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_blocks_page_order (page_id, order_index, id),
        INDEX idx_blocks_type (type),
        INDEX idx_blocks_visible (is_visible)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await ensureLinksSchema();
    await ensureBlocksSchema();
    await ensureRedirectsSchema();
    await ensureClickEventsSchema();
    await ensureVisitThrottleSchema();

    const defaults = [
      ['site_title', 'LinkHub'],
      ['bg_youtube_id', ''],
      ['background_mode', 'youtube'],
      ['background_image_url', ''],
      ['background_video_url', ''],
      ['background_media_path', ''],
      ['background_gradient', 'sunset'],
      ['background_pattern', 'none'],
      ['overlay_opacity', '0.55'],
      ['background_blur', '8'],
      ['particles_density', '80'],
      ['particles_speed', '1'],
      ['footer_html', '<p>&copy; {{YEAR}} LinkHub</p>'],
      ['display_name', ''],
      ['handle', ''],
      ['bio', ''],
      ['avatar_path', ''],
      ['avatar_emoji', '🙂'],
      ['like_emoji', '❤'],
      ['share_emoji', '🔗'],
      ['page_title', 'My LinkHub'],
      ['site_url', `https://${config.publicDomain}`],
      ['og_image', ''],
      ['og_description', ''],
      ['page_access_password_hash', ''],
      ['page_is_age_restricted', '0'],
      ['theme_color', '#ff4d6d'],
      ['link_layout', 'list'],
      ['font_theme', 'modern'],
      ['button_style', 'rounded'],
      ['animation_style', 'subtle']
    ];

    for (const [key, value] of defaults) {
      const row = await get('SELECT value FROM settings WHERE `key` = ?', [key]);
      if (!row) await run('INSERT INTO settings (`key`, value) VALUES (?, ?)', [key, value]);
    }

    const visits = await get('SELECT `value` FROM metrics WHERE `key` = ?', ['visits']);
    if (!visits) await run('INSERT INTO metrics (`key`, `value`) VALUES (?, ?)', ['visits', 0]);
    await run('DELETE FROM visit_throttle WHERE last_counted_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [config.viewCountRetentionDays]);

    const existingAdmin = await get('SELECT id FROM users WHERE username = ?', [config.adminUsername]);
    if (!existingAdmin) {
      let pass = config.adminPassword;
      if (!pass) {
        pass = crypto.randomBytes(16).toString('base64url');
        console.log('---------------------------------------------');
        console.log('No ADMIN_PASSWORD provided. Generated one:');
        console.log(`  username: ${config.adminUsername}`);
        console.log(`  password: ${pass}`);
        console.log('Please log in and change it immediately.');
        console.log('---------------------------------------------');
      }

      const rounds = Number.isFinite(config.bcryptRounds) && config.bcryptRounds >= 8 ? config.bcryptRounds : 12;
      const hash = await bcrypt.hash(String(pass), Number(rounds));
      await run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [config.adminUsername, hash, 'owner']);
      console.log('Created initial admin user:', config.adminUsername);
    }

    await seedDemoData();
    await ensureLinksClusterBlock();
  }

  app.locals.safeJsonForAttr = safeJsonForAttr;

  app.get(
    '/',
    asyncHandler(async (req, res) => {
      const settings = resolveUiSettings(await getSettingsMap());
      const pagePasswordGate = hasPasswordGate({ page_access_password_hash: settings.page_access_password_hash });
      if (pagePasswordGate && !isUnlocked(req, 'page', 'page')) {
        return renderAccessGate(res, {
          mode: 'password',
          title: 'This page is password protected',
          subtitle: 'Enter the password to continue.',
          returnTo: '/',
          contextType: 'page',
          contextIdOrSlug: 'page',
          csrfToken: req.session?.csrfToken || ''
        });
      }
      if (shouldGateByAge({ page_is_age_restricted: settings.page_is_age_restricted }, req)) {
        return renderAccessGate(res, {
          mode: 'age',
          title: 'Age verification required',
          subtitle: 'Confirm you are 18 or over to continue.',
          returnTo: '/',
          contextType: 'page',
          contextIdOrSlug: 'page',
          csrfToken: req.session?.csrfToken || ''
        });
      }

      if (await shouldCountVisit(req)) {
        await run('UPDATE metrics SET `value` = `value` + 1 WHERE `key` = ?', ['visits']);
      }

      const blocksRaw = await q('SELECT * FROM blocks WHERE page_id = 1 AND is_visible = 1 ORDER BY order_index ASC, id ASC');
      const blocks = blocksRaw
        .map(normalizeBlockRow)
        .filter(Boolean)
        .map(block => ({
          ...block,
          ...getRowAccessState(req, 'block', block, block.id)
        }));

      const linksRaw = await q('SELECT * FROM links WHERE is_visible = 1 ORDER BY order_index ASC, id ASC');
      const links = linksRaw.map(link => {
        const accessState = getRowAccessState(req, 'link', link, link.id);
        return {
          id: Number(link.id || 0),
          title: link.title || '',
          url: link.url || '',
          icon_key: link.icon_key || '',
          order_index: Number(link.order_index || 0),
          is_visible: Number(link.is_visible || 0) ? 1 : 0,
          color_hex: link.color_hex || '',
          ...accessState
        };
      });

      const embedsRaw = await q('SELECT * FROM embeds WHERE is_visible = 1 ORDER BY order_index ASC, id ASC');
      const embeds = embedsRaw
        .map(embed => ({ ...embed, embed_html: sanitizeEmbedHtml(embed.embed_html) }))
        .filter(embed => embed.embed_html);
      const ageVerified = isAgeVerified(req);

      const year = new Date().getFullYear();
      const footerHtml = (settings.footer_html || '').replace(/\{\{YEAR\}\}/g, String(year));
      const siteUrl = normalizeHttpUrl(settings.site_url) || `https://${config.publicDomain}`;
      const plainBio = (settings.bio || '').replace(/<[^>]+>/g, '').trim();
      const metaDescription = (settings.og_description || plainBio || 'All my links in one place!').slice(0, 280);

      let ogImage = normalizeHttpUrl(settings.og_image) || normalizeLocalAssetPath(settings.og_image) || normalizeLocalAssetPath(settings.avatar_path);
      if (!ogImage) ogImage = '/static/og-default.jpg';
      if (!/^https?:\/\//i.test(ogImage)) {
        ogImage = `${siteUrl.replace(/\/+$/, '')}${ogImage.startsWith('/') ? '' : '/'}${ogImage}`;
      }

      res.render('index', {
        blocks,
        links,
        embeds,
        footerHtml,
        csrfToken: req.session?.csrfToken || '',
        viewerAccess: {
          age_verified: ageVerified ? 1 : 0
        },
        settings: {
          ...settings,
          page_access_password_hash: '',
          site_url: siteUrl,
          og_image_abs: ogImage,
          meta_description: metaDescription
        }
      });
    })
  );

  app.get(
    '/api/stats',
    asyncHandler(async (req, res) => {
      const visits = await get('SELECT `value` AS v FROM metrics WHERE `key` = ?', ['visits']);
      const likes = await get('SELECT COUNT(*) AS c FROM likes');
      const liked = !!(await get('SELECT ip FROM likes WHERE ip = ?', [clientIp(req)]));
      res.json({
        visits: visits ? Number(visits.v) : 0,
        likes: likes ? Number(likes.c) : 0,
        liked
      });
    })
  );

  app.post(
    '/api/like',
    likeLimiter,
    asyncHandler(async (req, res) => {
      const ip = clientIp(req) || 'unknown';
      const row = await get('SELECT ip FROM likes WHERE ip = ?', [ip]);
      if (row) {
        const likes = await get('SELECT COUNT(*) AS c FROM likes');
        return res.json({ liked: true, likes: Number(likes?.c || 0) });
      }

      await run('INSERT INTO likes (ip) VALUES (?)', [ip]);
      const likes = await get('SELECT COUNT(*) AS c FROM likes');
      return res.json({ liked: true, likes: Number(likes?.c || 0) });
    })
  );

  app.post(
    '/access/password-unlock',
    unlockLimiter,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const contextType = sanitizeAccessContextType(req.body?.context_type);
      const contextIdOrSlugRaw = String(req.body?.context_id_or_slug || '').trim();
      const returnTo = sanitizeInternalReturnPath(req.body?.return_to, '/');
      const password = sanitizeAccessPassword(req.body?.password);

      if (!contextType) return res.status(400).send('Invalid context');

      let passwordHash = '';
      let contextKey = '';
      if (contextType === 'page') {
        const settings = await getSettingsMap();
        passwordHash = String(settings.page_access_password_hash || '');
        contextKey = 'page';
      } else if (contextType === 'link') {
        const id = Number.parseInt(contextIdOrSlugRaw, 10);
        if (Number.isInteger(id) && id > 0) {
          const row = await get('SELECT id, access_password_hash FROM links WHERE id = ?', [id]);
          passwordHash = String(row?.access_password_hash || '');
          contextKey = String(id);
        }
      } else if (contextType === 'block') {
        const id = Number.parseInt(contextIdOrSlugRaw, 10);
        if (Number.isInteger(id) && id > 0) {
          const row = await get('SELECT id, access_password_hash FROM blocks WHERE id = ?', [id]);
          passwordHash = String(row?.access_password_hash || '');
          contextKey = String(id);
        }
      } else if (contextType === 'redirect') {
        const slug = sanitizeSlug(contextIdOrSlugRaw);
        if (slug) {
          const row = await get('SELECT slug, access_password_hash FROM redirects WHERE slug = ?', [slug]);
          passwordHash = String(row?.access_password_hash || '');
          contextKey = slug;
        }
      }

      const ok = await verifyPasswordAgainstHash(password, passwordHash);
      if (!ok) {
        if (wantsJson(req)) {
          return res.status(401).json({ ok: false, error: 'Invalid password' });
        }
        return renderAccessGate(res, {
          status: 401,
          mode: 'password',
          title: 'This content is password protected',
          subtitle: 'Invalid password. Please try again.',
          returnTo,
          contextType,
          contextIdOrSlug: contextIdOrSlugRaw,
          csrfToken: req.session?.csrfToken || ''
        });
      }

      markUnlocked(req, contextType, contextKey);
      if (wantsJson(req)) {
        return res.json({ ok: true, message: 'Unlocked', redirect_to: returnTo });
      }
      return res.redirect(returnTo);
    })
  );

  app.post(
    '/access/age-verify',
    unlockLimiter,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const returnTo = sanitizeInternalReturnPath(req.body?.return_to, '/');
      markAgeVerified(req, res, returnTo);
      if (wantsJson(req)) {
        return res.json({ ok: true, message: 'Age verification complete' });
      }
      return res.redirect(returnTo);
    })
  );

  app.get(
    '/out/:id',
    redirectLimiter,
    asyncHandler(async (req, res, next) => {
      const id = Number(req.params?.id || 0);
      if (!Number.isInteger(id) || id <= 0) return next();

      const link = await get('SELECT id, title, url, access_password_hash, is_age_restricted FROM links WHERE id = ?', [id]);
      if (!link?.url) return next();

      if (hasPasswordGate(link) && !isUnlocked(req, 'link', link.id)) {
        return renderAccessGate(res, {
          mode: 'password',
          title: 'This link is password protected',
          subtitle: 'Enter password to continue.',
          returnTo: sanitizeInternalReturnPath(req.originalUrl || `/out/${link.id}`, `/out/${link.id}`),
          contextType: 'link',
          contextIdOrSlug: String(link.id),
          csrfToken: req.session?.csrfToken || ''
        });
      }

      if (shouldGateByAge(link, req)) {
        return renderAccessGate(res, {
          mode: 'age',
          title: 'Age verification required',
          subtitle: 'Confirm you are 18 or over to continue.',
          returnTo: sanitizeInternalReturnPath(req.originalUrl || `/out/${link.id}`, `/out/${link.id}`),
          contextType: 'link',
          contextIdOrSlug: String(link.id),
          csrfToken: req.session?.csrfToken || ''
        });
      }

      const utm = readUtmParamsFromQuery(req.query).params;
      const destinationUrl = buildTrackedDestinationUrl(link.url, utm);
      if (!destinationUrl) return next();

      try {
        await recordClickEvent(req, {
          eventType: 'link',
          linkId: link.id,
          destinationUrl,
          utm
        });
      } catch {
        // Do not block redirect on analytics failures.
      }

      return res.redirect(302, destinationUrl);
    })
  );

  app.get(
    '/admin/login',
    (req, res) => {
      if (req.session.userId) return res.redirect('/admin');
      return res.render('admin_login', { error: null, csrfToken: req.session.csrfToken });
    }
  );

  app.post(
    '/admin/login',
    loginLimiter,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const username = sanitizeText(req.body?.username, 191);
      const password = String(req.body?.password || '');
      const user = await get('SELECT * FROM users WHERE username = ?', [username]);

      if (!user) {
        return res.status(401).render('admin_login', {
          error: 'Invalid credentials',
          csrfToken: req.session.csrfToken
        });
      }

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        return res.status(401).render('admin_login', {
          error: 'Invalid credentials',
          csrfToken: req.session.csrfToken
        });
      }

      req.session.regenerate(err => {
        if (err) return res.status(500).send('Session error');
        req.session.userId = user.id;
        req.session.save(err2 => (err2 ? res.status(500).send('Session save error') : res.redirect('/admin')));
      });
    })
  );

  app.post('/admin/logout', requireAuth, requireCsrf, (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
  });

  app.get(
    '/admin',
    requireAuth,
    asyncHandler(async (req, res) => {
      const analyticsDays = parseAnalyticsDays(req.query?.analytics_days, 30);
      const linksRaw = await q('SELECT * FROM links ORDER BY order_index ASC, id ASC');
      const links = linksRaw.map(sanitizeLinkForAdmin).filter(Boolean);
      const settings = resolveUiSettings(await getSettingsMap());
      const blocksRaw = await q('SELECT * FROM blocks WHERE page_id = 1 ORDER BY order_index ASC, id ASC');
      const blocks = blocksRaw.map(sanitizeBlockForAdmin).filter(Boolean);
      const redirectsRaw = await q('SELECT * FROM redirects ORDER BY slug ASC');
      const redirects = redirectsRaw.map(sanitizeRedirectForAdmin).filter(Boolean);
      const analytics = await getAnalyticsSnapshot(analyticsDays);

      const socialsDir = path.join(__dirname, 'public', 'images', 'socials');
      let icons = [];
      try {
        icons = fs
          .readdirSync(socialsDir)
          .filter(f => f.endsWith('.svg'))
          .map(f => f.replace(/\.svg$/, ''));
      } catch {
        icons = [];
      }

      res.render('admin_dashboard', {
        links,
        blocks,
        settings,
        csrfToken: req.session.csrfToken,
        redirects,
        icons,
        analytics,
        analyticsDays
      });
    })
  );

  app.get(
    '/admin/qr/image',
    requireAuth,
    asyncHandler(async (req, res) => {
      const target = normalizeHttpUrl(req.query?.target);
      if (!target || target.length > 2048) return res.status(400).send('Valid target URL is required');

      const requestedSize = Number.parseInt(String(req.query?.size || '384'), 10);
      const size = Number.isFinite(requestedSize) ? Math.max(128, Math.min(1024, requestedSize)) : 384;

      const rawName = sanitizeText(req.query?.name, 80)
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const fileBase = rawName || 'linkhub-qr';

      const pngBuffer = await QRCode.toBuffer(target, {
        type: 'png',
        width: size,
        margin: 2,
        errorCorrectionLevel: 'M'
      });

      if (parseBoolean(req.query?.download, false)) {
        res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.png"`);
      }
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'private, max-age=120');
      return res.send(pngBuffer);
    })
  );

  app.get(
    '/admin/analytics/export',
    requireAuth,
    asyncHandler(async (req, res) => {
      const days = parseAnalyticsDays(req.query?.days, 30);
      const scope = sanitizeChoice(req.query?.scope, ['all', 'link', 'redirect'], 'all');
      const params = [days];
      let whereScope = '';
      if (scope === 'link') {
        whereScope = ' AND event_type = ?';
        params.push('link');
      } else if (scope === 'redirect') {
        whereScope = ' AND event_type = ?';
        params.push('redirect');
      }

      const rows = await q(
        `
          SELECT
            id,
            event_type,
            link_id,
            redirect_id,
            redirect_slug,
            destination_url,
            referrer_url,
            referrer_host,
            device_type,
            country_code,
            country_name,
            city,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_term,
            utm_content,
            clicked_at
          FROM click_events
          WHERE clicked_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
          ${whereScope}
          ORDER BY clicked_at DESC
          LIMIT 100000
        `,
        params
      );

      const headers = [
        'id',
        'event_type',
        'link_id',
        'redirect_id',
        'redirect_slug',
        'destination_url',
        'referrer_url',
        'referrer_host',
        'device_type',
        'country_code',
        'country_name',
        'city',
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'clicked_at'
      ];

      const lines = [headers.join(',')];
      for (const row of rows) {
        const cols = headers.map(key => csvEscape(row[key]));
        lines.push(cols.join(','));
      }

      const fileDate = new Date().toISOString().slice(0, 10);
      const filename = `linkhub-analytics-${scope}-${days}d-${fileDate}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(lines.join('\n'));
    })
  );

  app.post(
    '/admin/link/enrich',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const targetUrl = normalizeHttpUrl(req.body?.url);
      if (!targetUrl) return res.status(400).send('Valid URL is required');

      let parsed;
      try {
        parsed = new URL(targetUrl);
      } catch {
        return res.status(400).send('Valid URL is required');
      }

      const hostnameBlocked = await isDisallowedOutboundHostname(parsed.hostname);
      if (hostnameBlocked) return res.status(400).send('URL host is not allowed for enrichment');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);

      try {
        const response = await fetch(targetUrl, {
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent': `LinkHub Metadata Bot (+https://${normalizePublicDomain(config.publicDomain)})`,
            Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1'
          }
        });

        clearTimeout(timeout);

        if (!response.ok) return res.status(502).send(`Upstream responded with ${response.status}`);

        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
          return res.status(422).send('URL did not return an HTML page');
        }

        const contentLength = Number.parseInt(String(response.headers.get('content-length') || '0'), 10);
        if (Number.isFinite(contentLength) && contentLength > 2_000_000) {
          return res.status(422).send('Page is too large to enrich');
        }

        const finalUrl = normalizeHttpUrl(response.url) || targetUrl;
        const html = String(await response.text()).slice(0, 450_000);
        const metadata = parseLinkMetadataFromHtml(html, finalUrl);

        let finalHost = '';
        try {
          finalHost = new URL(finalUrl).hostname;
        } catch {
          finalHost = parsed.hostname;
        }

        const title =
          metadata.title || sanitizeText(finalHost.replace(/^www\./, ''), 255) || sanitizeText(parsed.hostname.replace(/^www\./, ''), 255);
        let iconKey = suggestIconKeyFromHostname(finalHost) || suggestIconKeyFromHostname(parsed.hostname);

        if (iconKey) {
          const iconPath = path.join(__dirname, 'public', 'images', 'socials', `${iconKey}.svg`);
          if (!fs.existsSync(iconPath)) iconKey = '';
        }

        const enrichment = {
          title: sanitizeText(title, 255),
          icon_key: sanitizeText(iconKey, 50),
          preview_image_url: metadata.previewImageUrl || '',
          site_name: metadata.siteName || '',
          description: metadata.description || '',
          final_url: finalUrl
        };

        return res.json({
          ok: true,
          message: 'Link suggestion generated',
          enrichment
        });
      } catch (error) {
        clearTimeout(timeout);
        if (error?.name === 'AbortError') return res.status(504).send('Metadata fetch timed out');
        return res.status(502).send('Unable to fetch metadata for this URL');
      }
    })
  );

  app.post(
    '/admin/link',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const id = Number(req.body?.id || 0);
      const title = sanitizeText(req.body?.title, 255);
      const targetUrl = normalizeHttpUrl(req.body?.url);
      const iconKey = sanitizeText(req.body?.icon_key, 50).replace(/[^a-zA-Z0-9_-]/g, '');
      const order = Number.parseInt(req.body?.order_index || '0', 10) || 0;
      const visible = parseBoolean(req.body?.is_visible, false) ? 1 : 0;
      const colorHex = sanitizeColorHex(req.body?.color_hex);
      const isAgeRestricted = parseBoolean(req.body?.is_age_restricted, false) ? 1 : 0;
      const isSpoiler = parseBoolean(req.body?.is_spoiler, false) ? 1 : 0;
      const accessPasswordRaw = sanitizeAccessPassword(req.body?.access_password);
      const clearAccessPassword = parseBoolean(req.body?.clear_access_password, false);

      if (!title || !targetUrl) return res.status(400).send('Title and valid URL are required');
      if (accessPasswordRaw && !isValidAccessPassword(accessPasswordRaw)) {
        return res.status(400).send(`Access password must be ${MIN_ACCESS_PASSWORD_LENGTH}-${MAX_ACCESS_PASSWORD_LENGTH} characters`);
      }

      let accessPasswordHash = '';
      if (id > 0) {
        const existing = await get('SELECT access_password_hash FROM links WHERE id = ?', [id]);
        accessPasswordHash = String(existing?.access_password_hash || '');
      }
      if (clearAccessPassword) {
        accessPasswordHash = '';
      } else if (accessPasswordRaw) {
        accessPasswordHash = await createAccessPasswordHash(accessPasswordRaw);
      }

      let linkId = id;
      if (id > 0) {
        await run(
          'UPDATE links SET title = ?, url = ?, icon_key = ?, order_index = ?, is_visible = ?, color_hex = ?, access_password_hash = ?, is_age_restricted = ?, is_spoiler = ? WHERE id = ?',
          [title, targetUrl, iconKey, order, visible, colorHex, accessPasswordHash || null, isAgeRestricted, isSpoiler, id]
        );
      } else {
        const insertResult = await runResult(
          'INSERT INTO links (title, url, icon_key, order_index, is_visible, color_hex, access_password_hash, is_age_restricted, is_spoiler) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [title, targetUrl, iconKey, order, visible, colorHex, accessPasswordHash || null, isAgeRestricted, isSpoiler]
        );
        linkId = Number(insertResult.insertId || 0);
      }

      const linkRaw = linkId > 0 ? await get('SELECT * FROM links WHERE id = ?', [linkId]) : null;
      const link = sanitizeLinkForAdmin(linkRaw);
      if (wantsJson(req)) {
        return res.json({ ok: true, message: 'Link saved', link });
      }
      return res.redirect('/admin');
    })
  );

  app.post(
    '/admin/link/delete',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const id = Number(req.body?.id || 0);
      if (id > 0) await run('DELETE FROM links WHERE id = ?', [id]);
      if (wantsJson(req)) {
        return res.json({ ok: true, message: 'Link deleted', id });
      }
      res.redirect('/admin');
    })
  );

  app.post(
    '/admin/link/toggle',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const id = Number(req.body?.id || 0);
      if (id <= 0) return res.status(400).send('Invalid link id');

      const current = await get('SELECT id, is_visible FROM links WHERE id = ?', [id]);
      if (!current) return res.status(404).send('Link not found');

      const requested = req.body?.is_visible;
      const nextVisible =
        requested == null
          ? current.is_visible ? 0 : 1
          : String(requested).trim() === '1' || String(requested).trim().toLowerCase() === 'true'
            ? 1
            : 0;

      await run('UPDATE links SET is_visible = ? WHERE id = ?', [nextVisible, id]);
      const linkRaw = await get('SELECT * FROM links WHERE id = ?', [id]);
      const link = sanitizeLinkForAdmin(linkRaw);
      if (wantsJson(req)) {
        return res.json({ ok: true, message: nextVisible ? 'Link is visible' : 'Link is hidden', link });
      }
      return res.redirect('/admin');
    })
  );

  app.post(
    '/admin/link/reorder',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      let ids = req.body?.ids;
      if (typeof ids === 'string') ids = [ids];
      if (!Array.isArray(ids)) ids = [];

      const cleanIds = [];
      for (const value of ids) {
        const parsed = Number(value);
        if (Number.isInteger(parsed) && parsed > 0 && !cleanIds.includes(parsed)) {
          cleanIds.push(parsed);
        }
      }

      if (!cleanIds.length) return res.status(400).send('No valid link ids supplied');

      for (let i = 0; i < cleanIds.length; i += 1) {
        await run('UPDATE links SET order_index = ? WHERE id = ?', [i + 1, cleanIds[i]]);
      }

      if (wantsJson(req)) {
        return res.json({ ok: true, message: 'Link order saved', ids: cleanIds });
      }
      return res.redirect('/admin');
    })
  );

  app.post(
    '/admin/block',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const id = Number(req.body?.id || 0);
      const type = sanitizeChoice(req.body?.type, BLOCK_TYPES, '');
      const pageId = Number(req.body?.page_id || 1) || 1;
      let order = Number.parseInt(req.body?.order_index || '0', 10) || 0;
      const visible = parseBoolean(req.body?.is_visible, false) ? 1 : 0;
      const isAgeRestricted = parseBoolean(req.body?.is_age_restricted, false) ? 1 : 0;
      const isSpoiler = parseBoolean(req.body?.is_spoiler, false) ? 1 : 0;
      const accessPasswordRaw = sanitizeAccessPassword(req.body?.access_password);
      const clearAccessPassword = parseBoolean(req.body?.clear_access_password, false);
      const dataObj = normalizeBlockDataFromBody(type, req.body);

      if (!type) return res.status(400).send('Valid block type is required');
      if (!dataObj) return res.status(400).send('Block data is invalid for selected type');
      if (pageId <= 0) return res.status(400).send('Invalid page id');
      if (accessPasswordRaw && !isValidAccessPassword(accessPasswordRaw)) {
        return res.status(400).send(`Access password must be ${MIN_ACCESS_PASSWORD_LENGTH}-${MAX_ACCESS_PASSWORD_LENGTH} characters`);
      }

      let accessPasswordHash = '';
      if (id > 0) {
        const existing = await get('SELECT access_password_hash FROM blocks WHERE id = ?', [id]);
        accessPasswordHash = String(existing?.access_password_hash || '');
      }
      if (clearAccessPassword) {
        accessPasswordHash = '';
      } else if (accessPasswordRaw) {
        accessPasswordHash = await createAccessPasswordHash(accessPasswordRaw);
      }

      let blockId = id;
      if (id > 0) {
        await run('UPDATE blocks SET page_id = ?, type = ?, data = ?, order_index = ?, is_visible = ?, access_password_hash = ?, is_age_restricted = ?, is_spoiler = ? WHERE id = ?', [
          pageId,
          type,
          JSON.stringify(dataObj),
          order,
          visible,
          accessPasswordHash || null,
          isAgeRestricted,
          isSpoiler,
          id
        ]);
      } else {
        if (order <= 0) {
          const maxRow = await get('SELECT COALESCE(MAX(order_index), 0) AS max_order FROM blocks WHERE page_id = ?', [pageId]);
          order = Number(maxRow?.max_order || 0) + 1;
        }
        const insertResult = await runResult(
          'INSERT INTO blocks (page_id, type, data, order_index, is_visible, access_password_hash, is_age_restricted, is_spoiler) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [pageId, type, JSON.stringify(dataObj), order, visible, accessPasswordHash || null, isAgeRestricted, isSpoiler]
        );
        blockId = Number(insertResult.insertId || 0);
      }

      const blockRow = blockId > 0 ? await get('SELECT * FROM blocks WHERE id = ?', [blockId]) : null;
      const block = sanitizeBlockForAdmin(blockRow);

      if (wantsJson(req)) {
        return res.json({ ok: true, message: 'Block saved', block });
      }
      return res.redirect('/admin');
    })
  );

  app.post(
    '/admin/block/delete',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const id = Number(req.body?.id || 0);
      if (id > 0) await run('DELETE FROM blocks WHERE id = ?', [id]);
      if (wantsJson(req)) {
        return res.json({ ok: true, message: 'Block deleted', id });
      }
      return res.redirect('/admin');
    })
  );

  app.post(
    '/admin/block/toggle',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const id = Number(req.body?.id || 0);
      if (id <= 0) return res.status(400).send('Invalid block id');

      const current = await get('SELECT id, is_visible FROM blocks WHERE id = ?', [id]);
      if (!current) return res.status(404).send('Block not found');

      const requested = req.body?.is_visible;
      const nextVisible =
        requested == null
          ? current.is_visible ? 0 : 1
          : String(requested).trim() === '1' || String(requested).trim().toLowerCase() === 'true'
            ? 1
            : 0;

      await run('UPDATE blocks SET is_visible = ? WHERE id = ?', [nextVisible, id]);
      const blockRow = await get('SELECT * FROM blocks WHERE id = ?', [id]);
      const block = sanitizeBlockForAdmin(blockRow);
      if (wantsJson(req)) {
        return res.json({ ok: true, message: nextVisible ? 'Block is visible' : 'Block is hidden', block });
      }
      return res.redirect('/admin');
    })
  );

  app.post(
    '/admin/block/reorder',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      let ids = req.body?.ids;
      if (typeof ids === 'string') ids = [ids];
      if (!Array.isArray(ids)) ids = [];

      const cleanIds = [];
      for (const value of ids) {
        const parsed = Number(value);
        if (Number.isInteger(parsed) && parsed > 0 && !cleanIds.includes(parsed)) {
          cleanIds.push(parsed);
        }
      }

      if (!cleanIds.length) return res.status(400).send('No valid block ids supplied');

      for (let i = 0; i < cleanIds.length; i += 1) {
        await run('UPDATE blocks SET order_index = ? WHERE id = ?', [i + 1, cleanIds[i]]);
      }

      if (wantsJson(req)) {
        return res.json({ ok: true, message: 'Block order saved', ids: cleanIds });
      }
      return res.redirect('/admin');
    })
  );

  app.post(
    '/admin/settings',
    requireAuth,
    uploadFields,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const allowedKeys = [
        'site_title',
        'bg_youtube_id',
        'background_mode',
        'background_image_url',
        'background_video_url',
        'background_gradient',
        'background_pattern',
        'overlay_opacity',
        'background_blur',
        'particles_density',
        'particles_speed',
        'footer_html',
        'display_name',
        'handle',
        'bio',
        'avatar_emoji',
        'like_emoji',
        'share_emoji',
        'page_title',
        'site_url',
        'og_image',
        'og_description',
        'page_is_age_restricted',
        'theme_color',
        'link_layout',
        'font_theme',
        'button_style',
        'animation_style'
      ];

      const existingSettings = await getSettingsMap();
      for (const key of allowedKeys) {
        if (!(key in req.body)) continue;

        let value = String(req.body[key] || '');
        if (key === 'bio' || key === 'og_description') {
          value = sanitizeRichText(value);
        } else if (key === 'footer_html') {
          value = sanitizeFooterHtml(value);
        } else if (key === 'site_url') {
          value = normalizeHttpUrl(value);
        } else if (key === 'og_image') {
          value = normalizeHttpUrl(value) || normalizeLocalAssetPath(value);
        } else if (key === 'page_is_age_restricted') {
          value = parseBoolean(value, false) ? '1' : '0';
        } else if (key === 'background_image_url' || key === 'background_video_url') {
          value = normalizeMediaAsset(value);
        } else if (key === 'theme_color') {
          value = sanitizeColorHex(value) || '#ff4d6d';
        } else if (key === 'bg_youtube_id') {
          value = String(value).trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
        } else if (key === 'background_mode') {
          value = sanitizeChoice(value, ALLOWED_BACKGROUND_MODES, 'youtube');
        } else if (key === 'background_gradient') {
          value = sanitizeChoice(value, ALLOWED_GRADIENT_PRESETS, 'sunset');
        } else if (key === 'background_pattern') {
          value = sanitizeChoice(value, ALLOWED_PATTERN_PRESETS, 'none');
        } else if (key === 'link_layout') {
          value = sanitizeChoice(value, ALLOWED_LINK_LAYOUTS, 'list');
        } else if (key === 'font_theme') {
          value = sanitizeChoice(value, ALLOWED_FONT_THEMES, 'modern');
        } else if (key === 'button_style') {
          value = sanitizeChoice(value, ALLOWED_BUTTON_STYLES, 'rounded');
        } else if (key === 'animation_style') {
          value = sanitizeChoice(value, ALLOWED_ANIMATION_STYLES, 'subtle');
        } else if (key === 'overlay_opacity') {
          value = String(sanitizeNumberRange(value, 0, 0.9, 0.55, 2));
        } else if (key === 'background_blur') {
          value = String(sanitizeNumberRange(value, 0, 20, 8, 1));
        } else if (key === 'particles_density') {
          value = String(sanitizeNumberRange(value, 20, 180, 80, 0));
        } else if (key === 'particles_speed') {
          value = String(sanitizeNumberRange(value, 0.2, 3, 1, 2));
        } else if (key === 'avatar_emoji') {
          value = sanitizeEmoji(value, '🙂');
        } else if (key === 'like_emoji') {
          value = sanitizeEmoji(value, '❤');
        } else if (key === 'share_emoji') {
          value = sanitizeEmoji(value, '🔗');
        } else {
          value = sanitizeText(value, 255);
        }

        await run('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [key, value]);
      }

      const pagePasswordRaw = sanitizeAccessPassword(req.body?.page_access_password || '');
      const clearPagePassword = parseBoolean(req.body?.clear_page_access_password, false);
      if (pagePasswordRaw && !isValidAccessPassword(pagePasswordRaw)) {
        return res.status(400).send(`Page password must be ${MIN_ACCESS_PASSWORD_LENGTH}-${MAX_ACCESS_PASSWORD_LENGTH} characters`);
      }

      if (clearPagePassword) {
        await run(
          'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
          ['page_access_password_hash', '']
        );
      } else if (pagePasswordRaw) {
        const pagePasswordHash = await createAccessPasswordHash(pagePasswordRaw);
        await run(
          'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
          ['page_access_password_hash', pagePasswordHash]
        );
      }

      if (req.files?.avatar?.[0]) {
        const rel = '/static/uploads/' + req.files.avatar[0].filename;
        await run('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', ['avatar_path', rel]);
        if (existingSettings.avatar_path && existingSettings.avatar_path !== rel) {
          await deleteUploadIfLocal(existingSettings.avatar_path);
        }
      }

      if (req.files?.og_image_file?.[0]) {
        const rel = '/static/uploads/' + req.files.og_image_file[0].filename;
        await run('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', ['og_image', rel]);
        if (existingSettings.og_image && existingSettings.og_image !== rel) {
          await deleteUploadIfLocal(existingSettings.og_image);
        }
      }

      if (req.files?.background_media_file?.[0]) {
        const rel = '/static/uploads/' + req.files.background_media_file[0].filename;
        await run('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', ['background_media_path', rel]);
        if (existingSettings.background_media_path && existingSettings.background_media_path !== rel) {
          await deleteUploadIfLocal(existingSettings.background_media_path);
        }
      }

      if (wantsJson(req)) {
        return res.json({ ok: true, message: 'Changes have been saved' });
      }
      res.redirect('/admin');
    })
  );

  app.post(
    '/admin/embed',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const id = Number(req.body?.id || 0);
      const title = sanitizeText(req.body?.title, 255);
      const embedHtml = sanitizeEmbedHtml(req.body?.embed_html || '');
      const order = Number.parseInt(req.body?.order_index || '0', 10) || 0;
      const visible = req.body?.is_visible ? 1 : 0;

      if (!title || !embedHtml) return res.status(400).send('Title and valid embed HTML are required');

      let embedId = id;
      if (id > 0) {
        await run('UPDATE embeds SET title = ?, embed_html = ?, order_index = ?, is_visible = ? WHERE id = ?', [
          title,
          embedHtml,
          order,
          visible,
          id
        ]);
      } else {
        const insertResult = await runResult('INSERT INTO embeds (title, embed_html, order_index, is_visible) VALUES (?, ?, ?, ?)', [
          title,
          embedHtml,
          order,
          visible
        ]);
        embedId = Number(insertResult.insertId || 0);
      }

      const embed = embedId > 0 ? await get('SELECT * FROM embeds WHERE id = ?', [embedId]) : null;
      if (wantsJson(req)) {
        return res.json({ ok: true, message: 'Embed saved', embed });
      }
      return res.redirect('/admin');
    })
  );

  app.post(
    '/admin/embed/delete',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const id = Number(req.body?.id || 0);
      if (id > 0) await run('DELETE FROM embeds WHERE id = ?', [id]);
      if (wantsJson(req)) {
        return res.json({ ok: true, message: 'Embed deleted', id });
      }
      return res.redirect('/admin');
    })
  );

  app.post(
    '/admin/embed/toggle',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const id = Number(req.body?.id || 0);
      if (id <= 0) return res.status(400).send('Invalid embed id');

      const current = await get('SELECT id, is_visible FROM embeds WHERE id = ?', [id]);
      if (!current) return res.status(404).send('Embed not found');

      const requested = req.body?.is_visible;
      const nextVisible =
        requested == null
          ? current.is_visible ? 0 : 1
          : String(requested).trim() === '1' || String(requested).trim().toLowerCase() === 'true'
            ? 1
            : 0;

      await run('UPDATE embeds SET is_visible = ? WHERE id = ?', [nextVisible, id]);
      const embed = await get('SELECT * FROM embeds WHERE id = ?', [id]);
      if (wantsJson(req)) {
        return res.json({ ok: true, message: nextVisible ? 'Embed is visible' : 'Embed is hidden', embed });
      }
      return res.redirect('/admin');
    })
  );

  app.post(
    '/admin/embed/reorder',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      let ids = req.body?.ids;
      if (typeof ids === 'string') ids = [ids];
      if (!Array.isArray(ids)) ids = [];

      const cleanIds = [];
      for (const value of ids) {
        const parsed = Number(value);
        if (Number.isInteger(parsed) && parsed > 0 && !cleanIds.includes(parsed)) {
          cleanIds.push(parsed);
        }
      }

      if (!cleanIds.length) return res.status(400).send('No valid embed ids supplied');

      for (let i = 0; i < cleanIds.length; i += 1) {
        await run('UPDATE embeds SET order_index = ? WHERE id = ?', [i + 1, cleanIds[i]]);
      }

      if (wantsJson(req)) {
        return res.json({ ok: true, message: 'Embed order saved', ids: cleanIds });
      }
      return res.redirect('/admin');
    })
  );

  app.post(
    '/admin/redirect',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const id = Number(req.body?.id || 0);
      const slug = sanitizeSlug(req.body?.slug);
      const targetUrl = normalizeHttpUrl(req.body?.target_url);
      const isActive = parseBoolean(req.body?.is_active, false) ? 1 : 0;
      const isAgeRestricted = parseBoolean(req.body?.is_age_restricted, false) ? 1 : 0;
      const accessPasswordRaw = sanitizeAccessPassword(req.body?.access_password);
      const clearAccessPassword = parseBoolean(req.body?.clear_access_password, false);

      if (!slug || !targetUrl) return res.status(400).send('Valid slug and target URL are required');
      if (accessPasswordRaw && !isValidAccessPassword(accessPasswordRaw)) {
        return res.status(400).send(`Access password must be ${MIN_ACCESS_PASSWORD_LENGTH}-${MAX_ACCESS_PASSWORD_LENGTH} characters`);
      }

      let accessPasswordHash = '';
      if (id > 0) {
        const existing = await get('SELECT access_password_hash FROM redirects WHERE id = ?', [id]);
        accessPasswordHash = String(existing?.access_password_hash || '');
      } else {
        const existingBySlug = await get('SELECT access_password_hash FROM redirects WHERE slug = ?', [slug]);
        accessPasswordHash = String(existingBySlug?.access_password_hash || '');
      }
      if (clearAccessPassword) {
        accessPasswordHash = '';
      } else if (accessPasswordRaw) {
        accessPasswordHash = await createAccessPasswordHash(accessPasswordRaw);
      }

      let redirectId = id;
      if (id > 0) {
        await run('UPDATE redirects SET slug = ?, target_url = ?, is_active = ?, access_password_hash = ?, is_age_restricted = ? WHERE id = ?', [
          slug,
          targetUrl,
          isActive,
          accessPasswordHash || null,
          isAgeRestricted,
          id
        ]);
      } else {
        const insertResult = await runResult(
          'INSERT INTO redirects (slug, target_url, is_active, access_password_hash, is_age_restricted) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE target_url = VALUES(target_url), is_active = VALUES(is_active), access_password_hash = VALUES(access_password_hash), is_age_restricted = VALUES(is_age_restricted)',
          [slug, targetUrl, isActive, accessPasswordHash || null, isAgeRestricted]
        );

        if (insertResult.insertId) {
          redirectId = Number(insertResult.insertId);
        } else {
          const existing = await get('SELECT id FROM redirects WHERE slug = ?', [slug]);
          redirectId = Number(existing?.id || 0);
        }
      }

      const redirectRaw = redirectId > 0 ? await get('SELECT * FROM redirects WHERE id = ?', [redirectId]) : null;
      const redirect = sanitizeRedirectForAdmin(redirectRaw);
      if (wantsJson(req)) {
        return res.json({ ok: true, message: 'Redirect saved', redirect });
      }
      return res.redirect('/admin');
    })
  );

  app.post(
    '/admin/redirect/delete',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const id = Number(req.body?.id || 0);
      if (id > 0) await run('DELETE FROM redirects WHERE id = ?', [id]);
      if (wantsJson(req)) {
        return res.json({ ok: true, message: 'Redirect deleted', id });
      }
      return res.redirect('/admin');
    })
  );

  app.post(
    '/admin/redirect/toggle',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const id = Number(req.body?.id || 0);
      if (id <= 0) return res.status(400).send('Invalid redirect id');

      const current = await get('SELECT id, is_active FROM redirects WHERE id = ?', [id]);
      if (!current) return res.status(404).send('Redirect not found');

      const requested = req.body?.is_active;
      const nextActive =
        requested == null
          ? current.is_active ? 0 : 1
          : String(requested).trim() === '1' || String(requested).trim().toLowerCase() === 'true'
            ? 1
            : 0;

      await run('UPDATE redirects SET is_active = ? WHERE id = ?', [nextActive, id]);
      const redirectRaw = await get('SELECT * FROM redirects WHERE id = ?', [id]);
      const redirect = sanitizeRedirectForAdmin(redirectRaw);
      if (wantsJson(req)) {
        return res.json({ ok: true, message: nextActive ? 'Redirect is active' : 'Redirect is inactive', redirect });
      }
      return res.redirect('/admin');
    })
  );

  app.get(
    '/debug/settings',
    requireAuth,
    asyncHandler(async (_req, res) => {
      if (config.isProd) return res.status(404).send('Not found');
      return res.json(await getSettingsMap());
    })
  );

  app.get(
    '/:slug',
    redirectLimiter,
    asyncHandler(async (req, res, next) => {
      const slug = sanitizeSlug(req.params.slug);
      if (!slug) return next();

      const row = await get('SELECT id, slug, target_url, access_password_hash, is_age_restricted FROM redirects WHERE slug = ? AND is_active = 1', [slug]);
      if (row?.target_url) {
        if (hasPasswordGate(row) && !isUnlocked(req, 'redirect', row.slug)) {
          return renderAccessGate(res, {
            mode: 'password',
            title: 'This redirect is password protected',
            subtitle: 'Enter password to continue.',
            returnTo: sanitizeInternalReturnPath(req.originalUrl || `/${row.slug}`, `/${row.slug}`),
            contextType: 'redirect',
            contextIdOrSlug: row.slug,
            csrfToken: req.session?.csrfToken || ''
          });
        }

        if (shouldGateByAge(row, req)) {
          return renderAccessGate(res, {
            mode: 'age',
            title: 'Age verification required',
            subtitle: 'Confirm you are 18 or over to continue.',
            returnTo: sanitizeInternalReturnPath(req.originalUrl || `/${row.slug}`, `/${row.slug}`),
            contextType: 'redirect',
            contextIdOrSlug: row.slug,
            csrfToken: req.session?.csrfToken || ''
          });
        }

        const utm = readUtmParamsFromQuery(req.query).params;
        const destinationUrl = buildTrackedDestinationUrl(row.target_url, utm);
        if (!destinationUrl) return next();

        try {
          await recordClickEvent(req, {
            eventType: 'redirect',
            redirectId: row.id,
            redirectSlug: row.slug,
            destinationUrl,
            utm
          });
        } catch {
          // Do not block redirect on analytics failures.
        }

        return res.redirect(302, destinationUrl);
      }
      return next();
    })
  );

  app.use(
    asyncHandler(async (req, res) => {
      let settings = {};
      try {
        settings = await getSettingsMap();
      } catch {
        settings = {};
      }
      res.status(404).render('404', { settings });
    })
  );

  app.use((err, req, res, next) => {
    if (err instanceof URIError || err?.code === 'ERR_URI_DECODE') {
      return res.status(400).send('Bad request');
    }

    console.error('Unhandled error:', err);

    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    if (wantsJson(req)) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    if (res.headersSent) return next(err);
    return res.status(500).send('Internal Server Error');
  });

  return {
    app,
    pool,
    config,
    initDb,
    close: async () => {
      try {
        await sessionStore.close();
      } catch {
        // Ignore store close errors.
      }
      await pool.end();
    }
  };
}

async function startServer(passedConfig) {
  const { app, initDb, config } = createApp(passedConfig);
  await initDb();

  return new Promise(resolve => {
    const server = app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
      resolve({ app, server, config });
    });
  });
}

if (require.main === module) {
  startServer().catch(err => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}

module.exports = {
  buildConfig,
  createApp,
  startServer,
  sanitizeSlug,
  sanitizeColorHex,
  normalizeHttpUrl,
  suggestIconKeyFromHostname,
  sanitizeEmbedHtml,
  buildTrackedDestinationUrl,
  sanitizeInternalReturnPath,
  isValidAccessPassword,
  hasPasswordGate
};
