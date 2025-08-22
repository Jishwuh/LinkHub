const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const csrf = require('csurf');
const bcrypt = require('bcrypt');
const sanitizeHtml = require('sanitize-html');
const multer = require('multer');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'production',
  port: parseInt(process.env.PORT || '3000', 10),
  publicDomain: process.env.PUBLIC_DOMAIN || 'example.com',
  sessionSecret: process.env.SESSION_SECRET || 'please-change-this',
  adminUsername: (process.env.ADMIN_USERNAME || 'admin').trim(),
  adminPassword: (process.env.ADMIN_PASSWORD || '').trim(),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || ''
  }
};
if (!config.pool) config.pool = config.db;

const app = express();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '7d', etag: true }));

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": [
        "'self'",
        "'unsafe-inline'",
        "https://www.youtube.com",
        "https://www.youtube-nocookie.com",
        "https://www.gstatic.com",
        "https://cdn.skypack.dev"
      ],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "https:"],
      "media-src": ["'self'"],
      "frame-src": [
        "https://www.youtube.com",
        "https://www.youtube-nocookie.com",
        "https://player.twitch.tv",
        "https://www.tiktok.com"
      ],
      "connect-src": ["'self'", "https://cdn.skypack.dev"],
      "object-src": ["'none'"],
      "upgrade-insecure-requests": []
    }
  }
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const pool = mysql.createPool({
  host: config.pool.host,
  port: config.pool.port,
  user: config.pool.user,
  password: config.pool.password,
  database: config.pool.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
const run = async (sql, params = []) => { await pool.query(sql, params); };
const q = async (sql, params = []) => (await pool.query(sql, params))[0];
const get = async (sql, params = []) => { const rows = await q(sql, params); return rows[0] || null; };

const MySQLStoreFactory = require('express-mysql-session');
const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({}, pool);
app.use(session({
  name: 'linkhub.sid',
  store: sessionStore,
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.env === 'production', maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

const csrfProtection = csrf();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

const uploadsDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = (file.originalname.split('.').pop() || 'png').toLowerCase();
    const isOG = file.fieldname === 'og_image_file';
    const name = isOG ? `og-${Date.now()}.${ext}` : `avatar.${ext}`;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.mimetype);
    cb(ok ? null : new Error('Only image uploads allowed'), ok);
  }
});
const uploadFields = upload.fields([{ name: 'avatar', maxCount: 1 }, { name: 'og_image_file', maxCount: 1 }]);

function requireAuth(req, res, next) { if (req.session.userId) return next(); return res.redirect('/admin/login'); }
const clientIp = req => (req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

async function ensureRedirectsSchema() {
  const cols = await q('SHOW COLUMNS FROM redirects').catch(() => []);
  if (!Array.isArray(cols) || cols.length === 0) {
    return;
  }
  const names = cols.map(c => c.Field);
  if (!names.includes('is_active')) {
    await run('ALTER TABLE redirects ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1');
  }
  const idx = await q('SHOW INDEX FROM redirects WHERE Key_name="uq_redirects_slug"').catch(() => []);
  if (!idx || idx.length === 0) {
    const anySlugIdx = await q('SHOW INDEX FROM redirects WHERE Column_name="slug"').catch(() => []);
    const nonUnique = (anySlugIdx || []).find(i => i.Non_unique === 1);
    if (nonUnique) await run('ALTER TABLE redirects DROP INDEX `' + nonUnique.Key_name + '`');
    await run('ALTER TABLE redirects ADD UNIQUE KEY uq_redirects_slug (slug)');
  }
}


async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(191) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL
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
      color_hex VARCHAR(20) NULL
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
      ip VARCHAR(45) PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS embeds (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      embed_html LONGTEXT NOT NULL,
      order_index INT DEFAULT 0,
      is_visible TINYINT(1) DEFAULT 1
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
    ['footer_html', '<p>� {{YEAR}} LinkHub</p>'],
    ['twitch_channel', ''],
    ['tiktok_embed_html', ''],
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
  for (const [k, v] of defaults) {
    const row = await get('SELECT value FROM settings WHERE `key`=?', [k]);
    if (!row) await run('INSERT INTO settings (`key`, value) VALUES (?,?)', [k, v]);
  }
  const visits = await get('SELECT `value` FROM metrics WHERE `key`=?', ['visits']);
  if (!visits) await run('INSERT INTO metrics (`key`,`value`) VALUES (?,?)', ['visits', 0]);

  const existingAdmin = await get('SELECT id FROM users WHERE username=?', [config.adminUsername]);
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
    let rounds = config.bcryptRounds;
    if (!Number.isFinite(rounds) || rounds < 4) rounds = 12;
    const hash = await bcrypt.hash(String(pass), Number(rounds));
    await run('INSERT INTO users (username, password_hash) VALUES (?,?)', [config.adminUsername, hash]);
    console.log('Created initial admin user:', config.adminUsername);
  }
}

async function getSettingsMap() {
  const rows = await q('SELECT `key`, value FROM settings');
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

app.get('/', async (req, res, next) => {
  try {
    await run('UPDATE metrics SET `value`=`value`+1 WHERE `key`=?', ['visits']);
    const links = await q('SELECT * FROM links WHERE is_visible=1 ORDER BY order_index ASC, id ASC');
    const settingsRows = await q('SELECT `key`, value FROM settings');
    const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
    const embeds = await q('SELECT * FROM embeds WHERE is_visible=1 ORDER BY order_index ASC, id ASC');
    const year = new Date().getFullYear();
    const footerHtml = (settings.footer_html || '').replace(/\{\{YEAR\}\}/g, String(year));
    const siteUrl = (settings.site_url && /^https?:\/\//i.test(settings.site_url)) ? settings.site_url : `https://${config.publicDomain}`;
    const plainBio = (settings.bio || '').replace(/<[^>]+>/g, '').trim();
    const metaDescription = (settings.og_description || plainBio || 'All my links in one place!').slice(0, 280);
    let ogImage = settings.og_image || settings.avatar_path || '';
    if (!ogImage) ogImage = '/static/og-default.jpg';
    if (!/^https?:\/\//i.test(ogImage)) {
      ogImage = `${siteUrl.replace(/\/+$/, '')}${ogImage.startsWith('/') ? '' : '/'}${ogImage}`;
    }
    res.render('index', { links, settings: { ...settings, site_url: siteUrl, og_image_abs: ogImage, meta_description: metaDescription }, footerHtml, twitchParent: config.publicDomain, embeds });
  } catch (e) { next(e); }
});

app.get('/api/stats', async (req, res) => {
  const visits = await get('SELECT `value` AS v FROM metrics WHERE `key`=?', ['visits']);
  const likes = await get('SELECT COUNT(*) AS c FROM likes');
  const liked = !!(await get('SELECT ip FROM likes WHERE ip=?', [clientIp(req)]));
  res.json({ visits: visits ? Number(visits.v) : 0, likes: likes ? Number(likes.c) : 0, liked });
});
app.post('/api/like', async (req, res) => {
  const ip = clientIp(req) || 'unknown';
  const row = await get('SELECT ip FROM likes WHERE ip=?', [ip]);
  if (row) return res.json({ liked: true });
  await run('INSERT INTO likes (ip) VALUES (?)', [ip]);
  const likes = await get('SELECT COUNT(*) AS c FROM likes');
  res.json({ liked: true, likes: Number(likes.c) });
});

app.get('/admin/login', (req, res) => { if (req.session.userId) return res.redirect('/admin'); res.render('admin_login', { error: null }); });
app.post('/admin/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const user = await get('SELECT * FROM users WHERE username=?', [String(username || '').trim()]);
  if (!user) return res.render('admin_login', { error: 'Invalid credentials' });
  const ok = await bcrypt.compare(String(password || ''), user.password_hash);
  if (!ok) return res.render('admin_login', { error: 'Invalid credentials' });
  req.session.regenerate(err => {
    if (err) return res.status(500).send('Session error');
    req.session.userId = user.id;
    req.session.save(err2 => err2 ? res.status(500).send('Session save error') : res.redirect('/admin'));
  });
});
app.post('/admin/logout', (req, res) => { req.session.destroy(() => res.redirect('/admin/login')); });

app.get('/admin', requireAuth, csrfProtection, async (req, res, next) => {
  try {
    const links = await q('SELECT * FROM links ORDER BY order_index ASC, id ASC');
    const settingsRows = await q('SELECT `key`, value FROM settings');
    const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
    const embeds = await q('SELECT * FROM embeds ORDER BY order_index ASC, id ASC');
    const redirects = await q('SELECT * FROM redirects ORDER BY slug ASC');

    const socialsDir = path.join(__dirname, 'public', 'images', 'socials');
    let icons = [];
    try { icons = fs.readdirSync(socialsDir).filter(f => f.endsWith('.svg')).map(f => f.replace(/\.svg$/, '')); } catch { }

    res.render('admin_dashboard', { links, settings, csrfToken: req.csrfToken(), embeds, redirects, icons });
  } catch (e) { next(e); }
});

app.post('/admin/link', requireAuth, csrfProtection, async (req, res) => {
  const { id, title, url, icon_key, order_index, is_visible, color_hex } = req.body || {};
  const safeTitle = String(title || '').slice(0, 255);
  const safeUrl = String(url || '').slice(0, 2048);
  const safeIcon = String(icon_key || '').slice(0, 50);
  const safeColor = String(color_hex || '').slice(0, 20);
  const order = parseInt(order_index || '0', 10);
  const visible = is_visible ? 1 : 0;
  if (id) {
    await run('UPDATE links SET title=?, url=?, icon_key=?, order_index=?, is_visible=?, color_hex=? WHERE id=?',
      [safeTitle, safeUrl, safeIcon, order, visible, safeColor, id]);
  } else {
    await run('INSERT INTO links (title,url,icon_key,order_index,is_visible,color_hex) VALUES (?,?,?,?,?,?)',
      [safeTitle, safeUrl, safeIcon, order, visible, safeColor]);
  }
  res.redirect('/admin');
});
app.post('/admin/link/delete', requireAuth, csrfProtection, async (req, res) => {
  await run('DELETE FROM links WHERE id=?', [req.body.id]);
  res.redirect('/admin');
});

app.post('/admin/settings', requireAuth, uploadFields, csrfProtection, async (req, res) => {
  const allowedKeys = ['site_title', 'bg_youtube_id', 'footer_html', 'twitch_channel', 'tiktok_embed_html', 'display_name', 'handle', 'bio', 'avatar_path', 'page_title', 'site_url', 'og_image', 'og_description', 'theme_color'];
  for (const key of allowedKeys) {
    if (key in req.body) {
      let value = String(req.body[key] || '');
      if (['footer_html', 'tiktok_embed_html', 'bio', 'og_description'].includes(key)) {
        value = sanitizeHtml(value, {
          allowedTags: ['p', 'b', 'i', 'em', 'strong', 'a', 'br', 'ul', 'ol', 'li', 'span', 'small', 'div', 'iframe'],
          allowedAttributes: { 'a': ['href', 'target', 'rel'], 'iframe': ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'scrolling', 'referrerpolicy'], 'div': ['class', 'style'], 'span': ['class', 'style'] },
          transformTags: { 'a': sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }) }
        });
      } else {
        value = value.trim();
      }
      await run('INSERT INTO settings (`key`,value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)', [key, value]);
    }
  }
  if (req.files && req.files.avatar && req.files.avatar[0]) {
    const rel = '/static/uploads/' + req.files.avatar[0].filename;
    await run('INSERT INTO settings (`key`,value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)', ['avatar_path', rel]);
  }
  if (req.files && req.files.og_image_file && req.files.og_image_file[0]) {
    const rel = '/static/uploads/' + req.files.og_image_file[0].filename;
    await run('INSERT INTO settings (`key`,value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)', ['og_image', rel]);
  }
  res.redirect('/admin');
});

app.post('/admin/embed', requireAuth, csrfProtection, async (req, res) => {
  const { id, title, embed_html, order_index, is_visible } = req.body || {};
  const safeTitle = String(title || '').slice(0, 255);
  const order = parseInt(order_index || '0', 10);
  const visible = is_visible ? 1 : 0;
  let safeHtml = sanitizeHtml(String(embed_html || ''), {
    allowedTags: ['iframe', 'div', 'p', 'span', 'b', 'i', 'strong', 'em', 'a', 'br', 'small'],
    allowedAttributes: { 'iframe': ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'scrolling', 'referrerpolicy'], 'a': ['href', 'target', 'rel'], 'div': ['class', 'style'], 'span': ['class', 'style'], 'p': ['class', 'style'] },
    transformTags: { 'a': sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }) }
  });
  if (id) {
    await run('UPDATE embeds SET title=?, embed_html=?, order_index=?, is_visible=? WHERE id=?',
      [safeTitle, safeHtml, order, visible, id]);
  } else {
    await run('INSERT INTO embeds (title, embed_html, order_index, is_visible) VALUES (?,?,?,?)',
      [safeTitle, safeHtml, order, visible]);
  }
  res.redirect('/admin');
});
app.post('/admin/embed/delete', requireAuth, csrfProtection, async (req, res) => {
  await run('DELETE FROM embeds WHERE id=?', [req.body.id]);
  res.redirect('/admin');
});

app.use(async (req, res, next) => {
  try {
    res.locals.settings = await getSettingsMap();
  } catch {
    res.locals.settings = {};
  }
  next();
});

app.post('/admin/redirect', requireAuth, csrfProtection, async (req, res) => {
  const slug = String(req.body.slug || '').trim().replace(/^\/*|\/*$/g, '').toLowerCase();
  const target = String(req.body.target_url || '').trim().slice(0, 2048);
  const active = req.body.is_active ? 1 : 0;
  if (!slug || !target) return res.redirect('/admin');
  await run('INSERT INTO redirects (slug, target_url, is_active) VALUES (?,?,?) ON DUPLICATE KEY UPDATE target_url=VALUES(target_url), is_active=VALUES(is_active)', [slug, target, active]);
  res.redirect('/admin');
});
app.post('/admin/redirect/delete', requireAuth, csrfProtection, async (req, res) => {
  await run('DELETE FROM redirects WHERE id=?', [req.body.id]);
  res.redirect('/admin');
});

app.get('/debug/settings', async (req, res, next) => {
  try { res.json(await getSettingsMap()); } catch (e) { next(e); }
});

app.use((err, req, res, next) => {
  if (err instanceof URIError || err?.code === 'ERR_URI_DECODE') {
    return res.status(400).send('Bad request');
  }
  return next(err);
});

const RESERVED = new Set(['admin', 'static', 'api', 'debug']);
app.get('/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    if (RESERVED.has(slug)) return next();
    const row = await get('SELECT target_url FROM redirects WHERE slug=? AND is_active=1', [slug]);
    if (row && row.target_url) return res.redirect(302, row.target_url);
    return next();
  } catch (e) { return next(e); }
});

// 404 handler (last middleware)
app.use((req, res) => {
  res.status(404).render('404');
});

async function main() {
  await initDb();
  const port = process.env.PORT || config.port;
  app.listen(port, () => console.log(`Server running on port ${port}`));
}
main().catch(err => { console.error('Fatal startup error:', err); process.exit(1); });
