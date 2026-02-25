# LinkHub

LinkHub is a self-hosted link-in-bio app with an admin dashboard, short redirects, embeds, and basic analytics.

## Highlights

- Secure admin login with hashed passwords (`bcrypt`)
- Link management (ordering, visibility, icons, custom color)
- Redirect management (`/slug -> target URL`)
- Custom embed blocks (sanitized iframe HTML)
- Visit and like counters
- Open Graph / social share metadata editor
- CSP + Helmet hardening, rate limiting, and CSRF checks
- CI workflow with syntax checks and tests

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
- File uploads are restricted to PNG/JPG/WEBP/GIF.
- Rich text and embeds are sanitized before storage.
- Session-backed CSRF token is required on admin writes.
- `TRUST_PROXY` should match your deployment topology.

## Quality Checks

```bash
npm run check
npm test
```

CI (`.github/workflows/ci.yml`) runs install + check + test on push/PR.

## License

MIT
