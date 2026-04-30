# ByteStreams

**Smarter Workflows, Stronger Results.**

A modern marketing site for ByteStreams, a SaaS platform for AI-powered workflow
automation. Built as a static single-page site using the same tech stack as the
`portfolio2` project — pure HTML, Sass (7-1 architecture), and vanilla JS.

## ✨ Overview

The site follows the [ByteStreams Brand Kit v1.0](./ByteStreams-Brand-Kit.pdf)
and the layout in `site/*.png`:

- **Hero** — "Build Your Digital Future" headline with brand-aligned description copy and primary CTA
- **About** — Company intro + four stat cards (10+/500+/1000+/50+)
- **Features** — "Why Choose Us" 3×2 feature grid
- **Contact** — Contact info + form
- **Header** — Logo with "Smarter Workflows, Stronger Results." tagline beneath (desktop only)
- **Footer** — Row-based site map next to brand block:
  - Company -> About -> Security
  - Product -> DialTone.menu -> DialTone.med (comming soon) -> Features
  - Legal -> Privacy -> Terms -> Cookie Policy
  - Social icons link to LinkedIn, X / Twitter, and GitHub
- **Legal pages** — Dedicated `privacy.html`, `terms.html`, `cookies.html`,
  and `sms-terms.html`
- **404** — Branded `404.html` for not-found responses

Dark-mode-first per brand guidelines (§7.1), with an alternate light palette
already wired up via `body[data-theme="light"]`.

## 🛠️ Tech Stack

- HTML5 (semantic, no framework)
- Sass (dart-sass) with the **7-1** architecture pattern
- Vanilla JavaScript (no bundlers)
- Inter + JetBrains Mono (Google Fonts)
- Font Awesome 6 (CDN)

## 🚀 Quick Start

```bash
npm install                 # one-time: installs dart-sass
npm run sass:watch          # watch-compile Sass to dist/css/main.css
# in another tab:
npm run serve               # python3 -m http.server 8000
```

Open `http://localhost:8000`.

### Test contact/email flow in local dev

The contact form posts to the Worker endpoint (`/api/contact`), so use Worker
dev mode for end-to-end email testing.

```bash
# one-time per machine: create .dev.vars with your key
# RESEND_API_KEY=...

npm run sass
npm run dev:worker
```

Then open `http://127.0.0.1:8787` and submit the contact form.

Quick API sanity check:

```bash
curl -i -X POST http://127.0.0.1:8787/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Dev Test","email":"you@example.com","message":"Hello from dev"}'
```

Expected success is `200` with `{"ok":true}`.

### Production build

```bash
npm run sass
```

Then deploy `index.html`, `dist/`, `js/`, and `assets/` to any static host.

## 📁 Structure

```text
bytestreams/
├── index.html
├── privacy.html
├── terms.html
├── cookies.html
├── sms-terms.html
├── 404.html
├── js/main.js
├── sass/
│   ├── abstracts/   # _variables.scss, _mixins.scss (brand tokens)
│   ├── base/        # _reset.scss, _typography.scss
│   ├── layout/      # _header.scss, _footer.scss
│   ├── components/  # _buttons.scss, _cards.scss, _contact-form.scss
│   ├── pages/       # _home.scss
│   └── main.scss    # entry point
├── dist/css/main.css   # generated — do not edit
├── assets/             # logos, favicon, brand marks
├── docs/               # policy and campaign copy/source docs
└── ByteStreams-Brand-Kit.pdf  # full brand kit v1.0
```

## 🎨 Design Tokens

All colors, type sizes, spacing, radii, and motion values in
`sass/abstracts/_variables.scss` are pulled directly from the Brand Kit:

- Primary: **Stream Blue `#2563EB`**, hover Flow Blue `#3B82F6`
- Secondary: **Data Teal `#06B6D4`**, gradient `#2563EB → #06B6D4` @ 135°
- Dark surfaces: Void / Carbon / Slate / Edge
- Typography: Inter (body/headings), JetBrains Mono (code)
- 4px spacing unit, radii 4 / 8 / 12 / 16 / 9999px

## ♿ Accessibility

- Logical heading structure, landmarks (`header`, `main`, `footer`, `nav`)
- `aria-expanded` / `aria-controls` on the mobile menu button
- Visible focus-ring using the brand blue
- Honors `prefers-reduced-motion` (Brand Kit §8)

## 📄 License

Copyright © 2026 ByteStreams. All rights reserved.
