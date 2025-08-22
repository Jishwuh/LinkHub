# LinkHub 🔗✨

A **self-hostable LinkHub platform** where you can create a personalized “link in bio” page with dynamic links, embeds, redirects, and admin controls.  
This project is designed to be **plug-and-play** — clone it, configure `.env`, deploy, and you’re live.  

---

## 🚀 Features

- **Customizable profile page**
  - Links with SVG icons, colors, and descriptions
  - Background image/video (MP4 or YouTube embed)
  - Open Graph + Twitter embed metadata (configurable in admin)
- **Dynamic links system**
  - Add/edit/remove links in the admin panel
  - Control order, visibility, icons, and colors
- **Redirect system**
  - Add custom shortlinks (`/twitch` → `https://twitch.tv/username`)
  - Works for any slug/target URL
- **Custom iFrame embeds**
  - Add unlimited iFrames (not just TikTok/Twitch)
- **Like button (per IP)**
  - Users can like your page; likes are counted once per IP
  - Animated heart icon
- **Visit counter**
  - Tracks total visits on your page
- **404 page**
  - Any unknown route plays the "Background Youtube ID" in the admin panel with a redirect to the main page.
- **Admin dashboard**
  - Secure login (bcrypt password)
  - Manage links, embeds, redirects, OpenGraph/Twitter settings
  - Auto-database migration: missing columns/tables are created on boot

---

## 📂 Project Structure

```

├── public/             # Static assets (CSS, JS, icons, uploads)
│   ├── images/         # SVGs and logos
│   ├── js/             # Frontend JS (admin.js, like/share buttons)
│   └── uploads/        # Uploaded OG images, background videos
├── views/              # EJS templates (main page, admin dashboard, 404, etc.)
├── server.cjs          # Main Express server
├── package.json
├── .env.example        # Example environment configuration
└── README.md

````

---

## ⚙️ Setup

### 1) Clone and install
```bash
git clone https://github.com/jishwuh/linkhub.git
cd linkhub
npm install
````

### 2) Create `.env`

Copy from `.env.example`:

```ini
# App
PORT=3000
PUBLIC_DOMAIN=http://localhost:3000
SESSION_SECRET=supersecret
BCRYPT_ROUNDS=12

# Admin credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme   # or leave blank to auto-generate on first run

# Database (local MySQL or remote, e.g. PlanetScale/Namecheap)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=password
DB_NAME=linkhub

# Optional uploads dir (otherwise uses ./public/uploads)
# UPLOADS_DIR=/data/uploads
```

### 3) Run locally

```bash
npm start
```

Visit: **[http://localhost:3000](http://localhost:3000)**

* Admin login: **[http://localhost:3000/admin](http://localhost:3000/admin)**
* If `ADMIN_PASSWORD` is blank, check logs on first run for the generated password.

---

## 🛠️ Customization

### 🖼️ Icons

* Add new SVG icons to `/public/images/socials/`.
* In the Admin dashboard, set the **icon key** (filename without `.svg`).

### 🎨 Theme

* Backgrounds, colors, and text are editable from admin.
* Upload background video/image in admin → settings.

### 🔗 Redirects

* Add a redirect in admin:
  Example: `slug: twitch`, `target: https://twitch.tv/username`
  → visiting `/twitch` will redirect automatically.

### 📝 Embeds

* Add HTML `<iframe>` snippets in the **Embed Editor** inside admin.
* Control visibility and order.

### 🐦 OpenGraph / Twitter Embeds

* In Admin → “Discord/Twitter Embed Editor”, configure:

  * Title
  * Description
  * Image (upload or URL)
* These meta tags appear when sharing your LinkHub to Discord, Twitter, etc.

---

## 🗄️ Database Notes

* **Supported:** MySQL / MariaDB (local, PlanetScale, Namecheap DB, etc.)
* On startup, tables are automatically created if missing:

  * `users` (admin login)
  * `links` (main page links)
  * `embeds` (iframe embeds)
  * `redirects` (custom slugs → target URLs)
  * `settings` (OG meta, theme, etc.)
  * `likes` (per-IP likes)

---

## 🌍 Deploy (Recommended: Render)

This project works perfectly on **Render** with a **PlanetScale MySQL DB**.

### 1) Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourname/linkhub.git
git push -u origin main
```

### 2) PlanetScale database

* Create a free DB at [PlanetScale](https://planetscale.com).
* Get connection info (host, username, password, db name).

### 3) Deploy on Render

* Go to [Render](https://render.com).
* New → **Web Service** → Connect your GitHub repo.
* Environment:

  * Runtime: **Node 20+**
  * Build Command: `npm install`
  * Start Command: `npm start`
* Add environment variables (from your `.env`).

### 4) Done 🎉

Your app is live at `https://your-app.onrender.com`
Add your custom domain in Render dashboard.

---

## 🤝 Contributing

* Fork this repo
* Create a feature branch (`git checkout -b feature/foo`)
* Commit and push changes
* Open a Pull Request

---

## 📜 License

MIT — free to use, modify, and deploy.

---
