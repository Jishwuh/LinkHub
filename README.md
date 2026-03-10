# LinkHub

LinkHub is a self-hosted link-in-bio app with an admin dashboard, short redirects, embeds, analytics, and a large visual customization system.

## Highlights

- Secure admin login with hashed passwords (`bcrypt`)
- Link management (ordering, visibility, icons, custom color)
- Featured spotlight link system (single featured link, optional pinned top placement, optional thumbnail)
- Redirect management (`/slug -> target URL`)
- Per-slug OpenGraph/Twitter metadata for redirects
- Custom embed blocks (strictly sanitized iframe HTML)
- Per-link and per-redirect analytics (clicks, CTR, referrers, device, geo, hour, UTM)
- QR code generator in admin (profile, links, blocks, redirects)
- Auto link enrichment in admin (URL -> suggested title, icon, preview image)
- Asset manager with reusable media library (images/videos), alt text metadata, and in-form picker buttons
- Theme template gallery with one-click presets and JSON import/export
- Visit and like counters
- Open Graph / social share metadata editor
- Private content controls (password gates, 18+ verification, spoiler reveal)
- CSP + Helmet hardening, rate limiting, and CSRF checks
- Abuse controls for production traffic (redirect rate limits + view-count dedupe window)
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
- Featured spotlight links:
  - One featured link at a time (enforced server-side)
  - Optional `Pin to top` to visually pull featured link out of the Links Cluster
  - Optional thumbnail URL for larger, more visual spotlight card layout
- Link enrichment workflow:
  - Paste a URL in `Create/Edit Link`
  - Auto-suggested title, icon key, and preview image
  - Manual `Suggest` trigger plus auto-fetch on paste/input
- QR sharing tools:
  - Profile-level QR button in Links panel
  - Per-row QR buttons on Links, URL-capable Blocks, and Redirects
  - In-modal QR preview with PNG download + URL copy
- Asset manager:
  - Dedicated `Asset Manager` accordion in admin with reusable upload library
  - In-form `Library` picker buttons for background/OG URLs, redirect OG image, featured thumbnail, and block image URL
  - Client-side image optimization options during upload: center crop presets + resize + quality compression
  - Alt text metadata per asset, with automatic block-image alt fallback when empty
  - Safe delete behavior: prevents deleting assets still referenced by settings/blocks/links/redirects
- Full analytics upgrade:
  - Outbound tracking route for regular links (`/out/:id`)
  - Redirect analytics for all short links (`/:slug`)
  - Per-link clicks, unique clickers, and profile CTR
  - Referrer, device type, country/city (from edge/proxy geo headers), and time-of-day breakdowns
  - UTM campaign breakdown in admin
  - UTM builder modal + `Copy Tracked Link` on links/redirects
  - CSV export for all events, link-only, or redirect-only scopes
- Redirect social previews:
  - Per-redirect `OG title`, `OG description`, and `OG image URL` in Redirect modal
  - Social crawler requests to `/:slug` receive slug-specific OG/Twitter metadata
  - Normal user requests still perform immediate 302 redirect + analytics tracking
- Color picker and swatch improvements:
  - Profile theme color now has live swatch preview
  - Link color fields include swatch preview + hover hex visibility
- Background customization fixes:
  - Pattern overlay visibility improved
  - Background-mode fields now show only relevant controls
  - Modal overlay hidden-state fix (`[hidden]`) to prevent blocking clicks on admin load
- Abuse + safety hardening:
  - Dedicated redirect rate limiting on `/out/:id` and `/:slug`
  - Configurable like endpoint throttling
  - View counter dedupe (same visitor only counts once per throttle window)
- Private content and reveal system:
  - Page-level password and 18+ access controls in settings
  - Per-link/per-block/per-redirect password options in admin modals
  - Per-link/per-block 18+ toggles + spoiler reveal toggles
  - Direct unlock page flow for protected redirects/outbound links
  - Public unlock and age-verify modals without full-page refresh for on-page items
- Theme system + templates:
  - Theme token controls in Design tab (`surface`, `text`, `muted`, `border`, spacing scale, radius scale)
  - Template gallery with one-click apply presets: `Minimal`, `Glass`, `Neon`, `Creator`, `Business`, `Dark`
  - Template JSON export (`/admin/theme/export`) and import (`/admin/theme/import`) with schema/field validation

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

### Asset manager

- Upload images and videos once, then reuse them with URL insertion buttons
- Searchable library cards with preview, copy URL, edit label/alt text, and delete actions
- Optional image optimization:
  - Crop presets: `none`, `square`, `portrait (4:5)`, `landscape (16:9)`
  - Max width resizing
  - JPEG/WebP quality slider
- Alt text support:
  - Store alt text directly on image assets
  - Block image saves can auto-fill alt text from the selected library asset when left blank

## Private Content

Available in **Admin -> Site Settings -> Private** and item modals.

- Page-level controls:
  - Optional password gate for the whole profile page
  - Optional 18+ verification requirement for the whole profile page
- Item-level controls:
  - Links: optional password, 18+ toggle, spoiler reveal toggle
  - Blocks: optional password, 18+ toggle, spoiler reveal toggle
  - Redirects: optional password, 18+ toggle
- Unlock flow:
  - Protected direct routes (`/out/:id` and `/:slug`) render an unlock/verify page
  - Protected on-page links/blocks use in-page modal unlock + toast confirmation
- Spoiler behavior:
  - First click reveals content with a disintegrating animation
  - Next click performs normal interaction
  - Reveal state is persisted in `sessionStorage` for the current browser session

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

### Theme Templates (JSON)

Available in **Admin -> Site Settings -> Design**.

- CSS-variable theme tokens:
  - `theme_color` (accent)
  - `theme_surface_color`
  - `theme_text_color`
  - `theme_muted_color`
  - `theme_border_color`
  - `theme_spacing_scale`
  - `theme_radius_scale`
- One-click preset gallery:
  - `Minimal`, `Glass`, `Neon`, `Creator`, `Business`, `Dark`
- Import/export:
  - `Export JSON` downloads the current theme template
  - `Import JSON` validates and applies only supported LinkHub theme keys
  - Schema used: `linkhub-theme-v1`

Example exported template:

```json
{
  "schema": "linkhub-theme-v1",
  "name": "My Theme",
  "exported_at": "2026-03-10T00:00:00.000Z",
  "settings": {
    "background_mode": "gradient",
    "bg_youtube_id": "",
    "background_gradient": "midnight",
    "background_pattern": "none",
    "overlay_opacity": "0.45",
    "theme_color": "#6ea8fe",
    "theme_surface_color": "#12161d",
    "theme_text_color": "#f5f7fb",
    "theme_muted_color": "#b4bdca",
    "theme_border_color": "#5f6b7c",
    "theme_spacing_scale": "1",
    "theme_radius_scale": "0.9",
    "link_layout": "list",
    "font_theme": "modern",
    "button_style": "rounded",
    "animation_style": "none",
    "like_emoji": "❤",
    "share_emoji": "🔗"
  }
}
```

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
  - Asset library: PNG, JPG, WEBP, GIF, MP4, WEBM, OGG
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
- Redirect traffic is rate-limited (`REDIRECT_RATE_LIMIT_*`) to reduce bot abuse.
- Likes endpoint is throttled (`LIKE_RATE_LIMIT_*`) to reduce spam clicks.
- Profile visit counting is deduped per visitor hash over a configurable window (`VIEW_COUNT_THROTTLE_SECONDS`) with retention cleanup (`VIEW_COUNT_RETENTION_DAYS`).
- Access passwords are stored as bcrypt hashes (never plaintext), with minimum length enforcement.
- Asset deletion is blocked while that asset is still referenced by settings, links, blocks, or redirects.
- Age verification is intentionally short-lived and route-scoped (refresh requires re-verification, per current UX).

## Quality Checks

```bash
npm run check
npm test
```

CI (`.github/workflows/ci.yml`) runs install + check + test on push/PR.

## License

MIT
