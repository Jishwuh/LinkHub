# LinkHub

LinkHub is a self-hosted link-in-bio app with an admin dashboard, short redirects, embeds, analytics, and a large visual customization system.

## Highlights

- Secure admin login with hashed passwords (`bcrypt`)
- Link management (ordering, visibility, icons, custom color)
- Redirect management (`/slug -> target URL`)
- Custom embed blocks (strictly sanitized iframe HTML)
- Per-link and per-redirect analytics (clicks, CTR, referrers, device, geo, hour, UTM)
- QR code generator in admin (profile, links, blocks, redirects)
- Auto link enrichment in admin (URL -> suggested title, icon, preview image)
- Visit and like counters
- Open Graph / social share metadata editor
- CSP + Helmet hardening, rate limiting, and CSRF checks
- CI workflow with syntax checks and tests

## Recent Updates

- Admin dashboard redesign:
  - Cleaner layout and less visual clutter
  - Section tabs with better spacing and readability
  - Context tooltips for advanced controls
- No-refresh admin workflow:
  - Settings save via AJAX with toast confirmation
  - Link/Block/Redirect create, edit, delete, toggle, and reorder without page reload
- Modal-based editing:
  - Replaced inline create/edit fields with `Create New` + `Edit` modals
  - Consistent modal UX for Links, Blocks, and Redirects
- Better list management UX:
  - Drag-and-drop reordering for links and blocks
  - Action buttons grouped per item (`Edit`, `Hide/Show`, `Del`)
  - Per-item order badges and clearer visibility state
- Link enrichment workflow:
  - Paste a URL in `Create/Edit Link`
  - Auto-suggested title, icon key, and preview image
  - Manual `Suggest` trigger plus auto-fetch on paste/input
- QR sharing tools:
  - Profile-level QR button in Links panel
  - Per-row QR buttons on Links, URL-capable Blocks, and Redirects
  - In-modal QR preview with PNG download + URL copy
- Full analytics upgrade:
  - Outbound tracking route for regular links (`/out/:id`)
  - Redirect analytics for all short links (`/:slug`)
  - Per-link clicks, unique clickers, and profile CTR
  - Referrer, device type, country/city (from edge/proxy geo headers), and time-of-day breakdowns
  - UTM campaign breakdown in admin
  - UTM builder modal + `Copy Tracked Link` on links/redirects
  - CSV export for all events, link-only, or redirect-only scopes
- Color picker and swatch improvements:
  - Profile theme color now has live swatch preview
  - Link color fields include swatch preview + hover hex visibility
- Background customization fixes:
  - Pattern overlay visibility improved
  - Background-mode fields now show only relevant controls
  - Modal overlay hidden-state fix (`[hidden]`) to prevent blocking clicks on admin load

## Customization Studio

Everything below is configurable from **Admin -> Site Settings**.

### Background engine

- `YouTube` background mode (existing behavior)
- `Image` background mode
  - URL image
  - Uploaded image file
- `Video` background mode
  - URL video
  - Uploaded video file
- `Gradient` background mode with presets
  - `sunset`, `ocean`, `forest`, `neon`, `midnight`
- `JS Particles` background mode (animated canvas particles)

### Background controls

- Pattern overlays: `none`, `grid`, `dots`, `noise`
- Overlay opacity control
- Blur strength control
- Particle density + particle speed controls

### Layout and button organization

- Link layouts:
  - `list`
  - `grid`
  - `compact`
  - `table`
- Button styles:
  - `rounded`
  - `pill`
  - `square`
  - `glass`

## Analytics and Growth

Analytics is available in **Admin -> Analytics** with selectable date windows.

- Per-link analytics:
  - Total clicks
  - Unique clickers (hashed-IP dedupe)
  - CTR against profile visits
- Redirect analytics:
  - Click totals and unique clickers per slug
- Traffic insights:
  - Referrer host breakdown
  - Device type breakdown (`desktop`, `mobile`, `tablet`, `bot`, `unknown`)
  - Country and city breakdown (when country headers are available from your edge/proxy)
  - Time-of-day click activity (hourly)
- UTM tools:
  - Build campaign links directly from link/redirect rows
  - One-click copy of tracked URLs
- CSV export:
  - Export click event history from admin (`all`, `link`, `redirect` scope)

### Typography, motion, and personality

- Font themes:
  - `modern`
  - `editorial`
  - `rounded`
  - `mono`
- Animation styles:
  - `none`
  - `subtle`
  - `energetic`
- Emoji customizers:
  - Fallback avatar emoji
  - Like button emoji
  - Share button emoji

## Tech Stack

- Node.js + Express
- EJS templates
- MySQL / MariaDB
- Session storage in MySQL

## Project Structure

```text
public/                  Static assets (css, js, images, uploads)
views/                   EJS templates
scripts/                 Dev startup scripts
test/                    Node test suite
server.cjs               Main app + startup
.env.example             Production-style environment template
.env.development.example Local development environment template
```

## Local Development (Fast Visual Preview)

This includes fake/demo data so the UI is populated immediately.

### 1) Install dependencies

```bash
npm install
```

### 2) Create your development env file

```bash
cp .env.development.example .env.development
```

Windows PowerShell:

```powershell
Copy-Item .env.development.example .env.development
```

### 3) Start local MySQL (Docker)

```bash
npm run dev:db:up
```

### 4) Run the dev server

```bash
npm run dev
```

Open:

- App: `http://localhost:3000`
- Admin: `http://localhost:3000/admin/login`
- Default dev admin (from `.env.development.example`):
  - username: `admin`
  - password: `admin12345`

To stop local DB:

```bash
npm run dev:db:down
```

### Troubleshooting: `ECONNREFUSED 127.0.0.1:3307`

This means the app cannot reach your MySQL dev DB.

For Docker-based dev DB:

1. Start Docker Desktop.
2. Run:

```bash
npm run dev:db:up
```

3. Then start app:

```bash
npm run dev
```

Quick port check in PowerShell:

```powershell
Test-NetConnection -ComputerName 127.0.0.1 -Port 3307
```

If you use a local MySQL install instead of Docker, update `.env.development` with the correct `DB_HOST` / `DB_PORT` and ensure MySQL is running.

## Production Setup

### 1) Create environment file

```bash
cp .env.example .env
```

Set strong values for:

- `SESSION_SECRET`
- `ADMIN_PASSWORD`
- `DB_*`
- `PUBLIC_DOMAIN`

### 2) Run

```bash
npm start
```

## Security Notes

- Only `http/https` URLs are accepted for links and redirects.
- File uploads are restricted by field:
  - Avatar / OG: PNG, JPG, WEBP, GIF
  - Background media: PNG, JPG, WEBP, GIF, MP4, WEBM, OGG
- Rich text is sanitized before storage.
- Embeds are hardened with strict server-side sanitization:
  - Only `iframe` embeds are allowed
  - Only `https` iframe sources are allowed
  - Iframe hostnames are restricted to an allowlist:
    - `youtube.com`, `youtube-nocookie.com`, `player.twitch.tv`, `tiktok.com`, `open.spotify.com`
  - Iframe `allow` permissions are filtered to a safe subset
  - Legacy/stored embed HTML is sanitized again before render (defense in depth)
- Session-backed CSRF token is required on admin writes.
- `TRUST_PROXY` should match your deployment topology.
- Click analytics stores hashed IP (`sha256` with session-secret salt) for unique counts, not raw IPs.

## Quality Checks

```bash
npm run check
npm test
```

CI (`.github/workflows/ci.yml`) runs install + check + test on push/PR.

## License

MIT
