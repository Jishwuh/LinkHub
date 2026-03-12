# TODO
## Next (Biggest product upgrades)

* [ ] **Conversion blocks**

  * [ ] Email capture block
  * [ ] Contact form block
  * [ ] Booking block
  * [ ] Product showcase block
  * [ ] Countdown / launch block
  * [ ] Testimonial / social proof block

---

## Soon (Makes the platform powerful)

* [ ] **API + webhooks**

  * [ ] Public REST API
  * [ ] API authentication system
  * [ ] Webhook system
  * [ ] Click event webhook
  * [ ] Lead / conversion webhook
  * [ ] Analytics endpoint

---

## Important (Professional features)

* [ ] **Import tools**

  * [ ] Linktree importer
  * [ ] Beacons importer
  * [ ] Carrd importer
  * [ ] CSV import
  * [ ] JSON import

---

## Growth features

* [ ] **Integrations**

  * [ ] Calendly block
  * [ ] Stripe payment links
  * [ ] Shopify product cards
  * [ ] Discord invite block
  * [ ] Twitch live status
  * [ ] YouTube live status
  * [ ] Spotify latest track block

---

## Later (Nice improvements)

* [ ] **Page versioning**

  * [ ] Snapshot system
  * [ ] Restore previous version
  * [ ] Version history UI
  * [ ] Draft preview mode

* [ ] **Starter templates**

  * [ ] Creator starter template
  * [ ] Business starter template
  * [ ] Streamer starter template
  * [ ] Store template
  * [ ] Portfolio template

---

## Future ideas

* [ ] AI page generator
* [ ] AI link optimization suggestions
* [ ] Auto layout recommendations
* [ ] Creator monetization tools
* [ ] Affiliate analytics tools
* [ ] Built-in storefront
* [ ] AI theme generator

---

## Completed as of 3/11/26

- [x] **Per-link analytics**
  - [x] Track clicks per link (not just total visits)
  - [x] Show CTR (clicks / page views)
  - [x] Basic breakdowns: referrer, device, country, time of day
  - [x] Export analytics to CSV
  - [x] UTM builder + Copy tracked link button

- [x] **Blocks system (beyond links + iframes)**
  - [x] Create a `blocks` table: `id, page_id, type, data(JSON), order, visible, created_at`
  - [x] Render blocks in order on the public page
  - [x] Build 5 core block types:
    - [x] Heading
    - [x] Rich text
    - [x] Button link
    - [x] Image
    - [x] Embed (iframe / YouTube / etc.)

- [x] **Admin builder improvements**
  - [x] Drag-and-drop reorder for links/blocks
  - [x] Split view: Admin editor + Live preview panel
  - [x] Inline edit (click to edit text, labels, URLs)

- [x] **Themes + template gallery**
  - [x] Theme system using CSS variables (colors, fonts, spacing, radius)
  - [x] Template gallery in admin with one-click apply
  - [x] Theme presets: Minimal, Glass, Neon, Creator, Business, Dark

- [x] **Modern animations (optional + accessible)**
  - [x] Staggered entrance animation for blocks/links
  - [x] Button microinteractions: hover lift, subtle glow, press feedback
  - [x] Respect `prefers-reduced-motion`

- [x] **Featured / spotlight link**
  - [x] Allow 1 featured block with bigger card layout + thumbnail
  - [x] Pin to top option
  - [x] If pinned, visually pull the featured link out of the cluster and place it above the page/cluster

- [x] **Asset manager**
  - [x] Upload library (reuse images/videos across blocks)
  - [x] Image compression + basic crop tool (optional)
  - [x] Alt text support

- [x] **Scheduling + rules**
  - [x] Schedule blocks/links to show between dates/times
  - [x] Optional targeting rules: device, geo, referrer, query param

- [x] **QR code generator**
  - [x] QR for profile page
  - [x] QR for each redirect slug

- [x] **Auto link enrichment**
  - [x] Paste URL → suggest title + icon + preview image

- [x] **Per-slug OpenGraph**
  - [x] Custom OG/Twitter preview per redirect slug (not just per page)

- [x] **Private content**
  - [x] Password-protected page or hidden blocks/links (If redirect has password, should contain an "unlock" page asking for password to lead them to the content/page).
  - [x] Age restricted content verification. (Ask if they are 18 or over, if yes, unblur/enable content/block/link). Should be on links itself as well as blocks.
  - [x] Spoiler blocks/links (click to view, with a cool disintegrating animation to reveal it)

- [x] **Abuse + safety**
  - [x] Rate limiting on redirects
  - [x] Basic anti-spam / throttling for likes + view counting

- [x] **Media Library Input**
  - [x] Allow image blocks to be set to an item in the library. Properly implemented to resolve and save the library asset local URL/path, with alt fallback.