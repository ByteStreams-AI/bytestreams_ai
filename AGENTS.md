# AGENTS.md

Agent activity log for the **ByteStreams** repository. Records changes made by
AI agents (Oz / Warp) across branches and sessions.

---

## 2026-04-21 — `chore/copy-updates`

**Agent:** Oz (Warp)

### Updates Applied

#### Hero section copy (`index.html`)
Updated the hero description from generic placeholder text to brand-aligned
messaging:

- **Before:** "Transform your ideas into reality with our cutting-edge
  solutions. We help businesses grow and thrive in the digital age."
- **After:** "Scalable AI workflows that move as fast as your ambition. From
  data pipelines to intelligent automation — engineered to perform."

#### Header tagline (`index.html`, `privacy.html`, `terms.html`)
Added branded tagline **"Smarter Workflows, Stronger Results."** beneath the
ByteStreams logo in the site header across all pages:

- Wrapped the existing logo `<a>` in a new `.header__brand` flex container.
- Added `<p class="header__tagline">` rendered directly below the logo image.
- Tagline is hidden on mobile viewports (`< 600px`).

#### Sass (`sass/layout/_header.scss`)
New BEM modifiers to support the header brand block:

- **`.header__brand`** — `flex-direction: column` wrapper with `gap: 2px`.
- **`.header__tagline`** — `$font-size-tiny`, `var(--text-muted)`,
  `$ls-tiny` letter-spacing; `display: none` on mobile.

#### Documentation
- Updated `README.md` — Overview section reflects header tagline and
  refreshed hero copy description.
- Created `github/ISSUES/copy-updates-header-tagline.md` — issue template
  documenting the branch changes.
- Created GitHub issue [#1](https://github.com/Bytes0211/bytestreams/issues/1).

### Files Modified (2026-04-22)
- `index.html`
- `privacy.html`
- `terms.html`
- `sass/layout/_header.scss`
- `dist/css/main.css` *(generated)*
- `README.md`
- `AGENTS.md` *(this file)*
- `github/ISSUES/copy-updates-header-tagline.md` *(new)*

---

## 2026-04-22 — `copy/footer-and-legal-pages`

**Agent:** GitHub Copilot

### Changes Made

#### Cookie Policy page (`cookies.html`)
Created a dedicated Cookie Policy page using copy from `docs/coookie-policy.md` and wired it into the existing legal-page shell (header, section header, footer).

#### Footer information architecture (`index.html`, `privacy.html`, `terms.html`, `cookies.html`)
Reworked footer navigation from stacked columns into a row-first site map beside the logo, matching requested reading order:

- **Company -> About -> Security**
- **Product -> DialTone.menu -> DialTone.med (comming soon) -> Features**
- **Legal -> Privacy -> Terms -> Cookie Policy**

Implemented arrow separators (`->`) between row links and kept row labels aligned on the left.

#### Product link updates
- Updated **DialTone.menu** to link to `https://dialtone.menu` across all footer instances.
- Kept **DialTone.med** as placeholder (`#`) and updated label text to **DialTone.med (comming soon)** per request.

#### Sass updates (`sass/layout/_footer.scss`, `sass/base/_typography.scss`)
- Added footer row-map styling to support top-down labels and left-to-right links.
- Added long-form legal content helper (`.legal-doc`) used by legal/policy pages.
- Regenerated `dist/css/main.css`.

#### Documentation and tracking
- Updated `README.md` overview and structure sections to include:
  - row-based footer map
  - dedicated legal pages (`privacy.html`, `terms.html`, `cookies.html`)
- Created issue note `github/ISSUES/copy-updates-footer-navigation.md`.
- Created GitHub issue [#7](https://github.com/Bytes0211/bytestreams/issues/7).

### Files Modified
- `index.html`
- `privacy.html`
- `terms.html`
- `cookies.html` *(new)*
- `sass/layout/_footer.scss`
- `sass/base/_typography.scss`
- `dist/css/main.css` *(generated)*
- `README.md`
- `AGENTS.md` *(this file)*
- `github/ISSUES/copy-updates-footer-navigation.md` *(new)*

---

## 2026-04-29 — `main`

**Agent:** Oz (Warp)

Reconstructed from git history (commits `23fed94`, `82a52af`, `7fa8daf`) since
no session notes were captured at the time of the changes.

### Changes Made

#### Contact phone number (`23fed94`)
Updated the public contact phone number across the site from
`+1 629-282-9555` to `+1 629-250-1143`. Both the displayed text and the
`tel:` href were updated to keep them in sync.

- `index.html` — footer / contact phone
- `sms-terms.html` — SMS terms contact references
- `terms.html` — multiple occurrences in legal copy
- `assets/blue-side-slim-semi-logo.png` — new logo asset added alongside
  the contact change

#### Footer social links populated (`82a52af`)
Replaced placeholder `href="#"` social icons in the footer with real
destinations on every public page (`index.html`, `privacy.html`,
`terms.html`, `cookies.html`, `sms-terms.html`):

- **LinkedIn** → `https://www.linkedin.com/company/`
- **X / Twitter** → `https://x.com/byte_streams`
- **GitHub** → `https://github.com/ByteStreams-AI`

#### LinkedIn URL fix (`7fa8daf`)
Follow-up correction to point the LinkedIn icon at the actual ByteStreams
company page on all five pages:

- **Before:** `https://www.linkedin.com/company/`
- **After:** `https://www.linkedin.com/company/bytestreams/`

### Files Modified
- `index.html`
- `privacy.html`
- `terms.html`
- `cookies.html`
- `sms-terms.html`
- `assets/blue-side-slim-semi-logo.png` *(new)*

---

## 2026-04-30 — `docs/agents-log-2026-04-29`

**Agent:** Oz (Warp)

### Changes Made

#### Documentation refresh
- Backfilled `AGENTS.md` with the 2026-04-29 entry above (phone number,
  social links, LinkedIn fix) from git history.
- Updated `README.md` Structure section to include `sms-terms.html` and
  `404.html` and to note the populated footer social links.

### Files Modified
- `AGENTS.md` *(this file)*
- `README.md`
