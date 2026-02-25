const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const bcrypt = require('bcrypt');
const sanitizeHtml = require('sanitize-html');
const multer = require('multer');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: process.env.ENV_FILE || '.env' });

const RESERVED_SLUGS = new Set(['admin', 'static', 'api', 'debug']);
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
const UPLOAD_MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

function parseBoolean(value, defaultValue = false) {
  if (value == null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
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

function sanitizeEmbedHtml(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: ['iframe', 'div', 'p', 'span', 'b', 'i', 'strong', 'em', 'a', 'br', 'small'],
    allowedAttributes: {
      iframe: ['src', 'title', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'loading', 'referrerpolicy'],
      a: ['href', 'target', 'rel']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedIframeHostnames: ALLOWED_EMBED_HOSTNAMES,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' })
    }
  });
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
  const q = async (sql, params = []) => (await pool.query(sql, params))[0];
  const get = async (sql, params = []) => {
    const rows = await q(sql, params);
    return rows[0] || null;
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
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false
  });

  const uploadsDir = path.join(__dirname, 'public', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = UPLOAD_MIME_EXT[file.mimetype] || 'bin';
      const isOG = file.fieldname === 'og_image_file';
      const random = crypto.randomBytes(12).toString('hex');
      const prefix = isOG ? 'og' : 'avatar';
      cb(null, `${prefix}-${Date.now()}-${random}.${ext}`);
    }
  });
  const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ok = Object.prototype.hasOwnProperty.call(UPLOAD_MIME_EXT, file.mimetype);
      cb(ok ? null : new Error('Only PNG/JPG/WEBP/GIF uploads are allowed'), ok);
    }
  });
  const uploadFields = upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'og_image_file', maxCount: 1 }
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

  async function ensureRedirectsSchema() {
    const cols = await q('SHOW COLUMNS FROM redirects').catch(() => []);
    if (!Array.isArray(cols) || cols.length === 0) return;

    const names = cols.map(c => c.Field);
    if (!names.includes('is_active')) {
      await run('ALTER TABLE redirects ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1');
    }

    const idx = await q('SHOW INDEX FROM redirects WHERE Key_name = "uq_redirects_slug"').catch(() => []);
    if (!idx || idx.length === 0) {
      const anySlugIdx = await q('SHOW INDEX FROM redirects WHERE Column_name = "slug"').catch(() => []);
      const nonUnique = (anySlugIdx || []).find(i => i.Non_unique === 1);
      if (nonUnique) await run(`ALTER TABLE redirects DROP INDEX \`${nonUnique.Key_name}\``);
      await run('ALTER TABLE redirects ADD UNIQUE KEY uq_redirects_slug (slug)');
    }
  }

  async function getSettingsMap() {
    const rows = await q('SELECT `key`, value FROM settings');
    const map = {};
    for (const row of rows) map[row.key] = row.value;
    return map;
  }

  async function seedDemoData() {
    if (!config.seedDemoData) return;

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

    await ensureRedirectsSchema();

    const defaults = [
      ['site_title', 'LinkHub'],
      ['bg_youtube_id', ''],
      ['footer_html', '<p>&copy; {{YEAR}} LinkHub</p>'],
      ['display_name', ''],
      ['handle', ''],
      ['bio', ''],
      ['avatar_path', ''],
      ['page_title', 'My LinkHub'],
      ['site_url', `https://${config.publicDomain}`],
      ['og_image', ''],
      ['og_description', ''],
      ['theme_color', '#ff4d6d']
    ];

    for (const [key, value] of defaults) {
      const row = await get('SELECT value FROM settings WHERE `key` = ?', [key]);
      if (!row) await run('INSERT INTO settings (`key`, value) VALUES (?, ?)', [key, value]);
    }

    const visits = await get('SELECT `value` FROM metrics WHERE `key` = ?', ['visits']);
    if (!visits) await run('INSERT INTO metrics (`key`, `value`) VALUES (?, ?)', ['visits', 0]);

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
  }

  app.locals.safeJsonForAttr = safeJsonForAttr;

  app.get(
    '/',
    asyncHandler(async (req, res) => {
      await run('UPDATE metrics SET `value` = `value` + 1 WHERE `key` = ?', ['visits']);

      const links = await q('SELECT * FROM links WHERE is_visible = 1 ORDER BY order_index ASC, id ASC');
      const embeds = await q('SELECT * FROM embeds WHERE is_visible = 1 ORDER BY order_index ASC, id ASC');
      const settings = await getSettingsMap();

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
        links,
        embeds,
        footerHtml,
        settings: {
          ...settings,
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
      const links = await q('SELECT * FROM links ORDER BY order_index ASC, id ASC');
      const settings = await getSettingsMap();
      const embeds = await q('SELECT * FROM embeds ORDER BY order_index ASC, id ASC');
      const redirects = await q('SELECT * FROM redirects ORDER BY slug ASC');

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
        settings,
        csrfToken: req.session.csrfToken,
        embeds,
        redirects,
        icons
      });
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
      const visible = req.body?.is_visible ? 1 : 0;
      const colorHex = sanitizeColorHex(req.body?.color_hex);

      if (!title || !targetUrl) return res.status(400).send('Title and valid URL are required');

      if (id > 0) {
        await run(
          'UPDATE links SET title = ?, url = ?, icon_key = ?, order_index = ?, is_visible = ?, color_hex = ? WHERE id = ?',
          [title, targetUrl, iconKey, order, visible, colorHex, id]
        );
      } else {
        await run('INSERT INTO links (title, url, icon_key, order_index, is_visible, color_hex) VALUES (?, ?, ?, ?, ?, ?)', [
          title,
          targetUrl,
          iconKey,
          order,
          visible,
          colorHex
        ]);
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
      res.redirect('/admin');
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
        'footer_html',
        'display_name',
        'handle',
        'bio',
        'page_title',
        'site_url',
        'og_image',
        'og_description',
        'theme_color'
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
        } else if (key === 'theme_color') {
          value = sanitizeColorHex(value) || '#ff4d6d';
        } else if (key === 'bg_youtube_id') {
          value = String(value).trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
        } else {
          value = sanitizeText(value, 255);
        }

        await run('INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [key, value]);
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

      if (id > 0) {
        await run('UPDATE embeds SET title = ?, embed_html = ?, order_index = ?, is_visible = ? WHERE id = ?', [
          title,
          embedHtml,
          order,
          visible,
          id
        ]);
      } else {
        await run('INSERT INTO embeds (title, embed_html, order_index, is_visible) VALUES (?, ?, ?, ?)', [title, embedHtml, order, visible]);
      }

      res.redirect('/admin');
    })
  );

  app.post(
    '/admin/embed/delete',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const id = Number(req.body?.id || 0);
      if (id > 0) await run('DELETE FROM embeds WHERE id = ?', [id]);
      res.redirect('/admin');
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
      const isActive = req.body?.is_active ? 1 : 0;

      if (!slug || !targetUrl) return res.status(400).send('Valid slug and target URL are required');

      if (id > 0) {
        await run('UPDATE redirects SET slug = ?, target_url = ?, is_active = ? WHERE id = ?', [slug, targetUrl, isActive, id]);
      } else {
        await run('INSERT INTO redirects (slug, target_url, is_active) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE target_url = VALUES(target_url), is_active = VALUES(is_active)', [slug, targetUrl, isActive]);
      }

      res.redirect('/admin');
    })
  );

  app.post(
    '/admin/redirect/delete',
    requireAuth,
    requireCsrf,
    asyncHandler(async (req, res) => {
      const id = Number(req.body?.id || 0);
      if (id > 0) await run('DELETE FROM redirects WHERE id = ?', [id]);
      res.redirect('/admin');
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
    asyncHandler(async (req, res, next) => {
      const slug = sanitizeSlug(req.params.slug);
      if (!slug) return next();

      const row = await get('SELECT target_url FROM redirects WHERE slug = ? AND is_active = 1', [slug]);
      if (row?.target_url) return res.redirect(302, row.target_url);
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
  normalizeHttpUrl
};
