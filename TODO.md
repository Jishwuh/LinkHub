## Now (Highest impact)

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

---

## Next (Makes it feel “pro” fast)

- [ ] **Themes + template gallery**
  - [ ] Theme system using CSS variables (colors, fonts, spacing, radius)
  - [ ] Template gallery in admin with one-click apply
  - [ ] Theme presets: Minimal, Glass, Neon, Creator, Business, Dark

- [ ] **Modern animations (optional + accessible)**
  - [ ] Staggered entrance animation for blocks/links
  - [ ] Button microinteractions: hover lift, subtle glow, press feedback
  - [ ] Respect `prefers-reduced-motion`

- [ ] **Featured / spotlight link**
  - [ ] Allow 1 featured block with bigger card layout + thumbnail
  - [ ] Pin to top option

- [ ] **Asset manager**
  - [ ] Upload library (reuse images/videos across blocks)
  - [ ] Image compression + basic crop tool (optional)
  - [ ] Alt text support

---

## Later (Premium differentiators)

- [ ] **Scheduling + rules**
  - [ ] Schedule blocks/links to show between dates/times
  - [ ] Optional targeting rules: device, geo, referrer, query param

- [ ] **Multiple pages + teams**
  - [ ] Multiple pages per account (personal, business, campaigns)
  - [ ] Roles: owner, editor, viewer

- [ ] **Custom domains**
  - [ ] Support custom domain mapping with CNAME instructions
  - [ ] SSL strategy (start simple, expand later)

---

## “Nice to have” extras (quick wins)

- [x] **QR code generator**
  - [x] QR for profile page
  - [x] QR for each redirect slug

- [x] **Auto link enrichment**
  - [x] Paste URL → suggest title + icon + preview image

- [ ] **Per-slug OpenGraph**
  - [ ] Custom OG/Twitter preview per redirect slug (not just per page)

- [ ] **Private content**
  - [ ] Password-protected page or hidden blocks/links

- [ ] **Abuse + safety**
  - [ ] Rate limiting on redirects
  - [ ] Basic anti-spam / throttling for likes + view counting

---
