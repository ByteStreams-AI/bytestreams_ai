# ByteStreams Blog — Eleventy Integration Runbook

> **Stack:** Static HTML + Sass + Cloudflare Workers  
> **Tool added:** Eleventy (11ty) v3 — manages `/blog/` only; existing pages untouched  
> **Output:** Flat HTML files written to `public/blog/` — same Cloudflare deploy path

---

## Concept Glossary

| Term | Meaning |
|---|---|
| **Eleventy** | Reads Markdown + templates → outputs flat `.html` files |
| **Nunjucks (`.njk`)** | Template language — plain HTML with `{{ variable }}` and `{% for %}` |
| **Frontmatter** | YAML block between `---` lines at the top of every Markdown post |
| **Layout** | Reusable HTML shell (header + footer) wrapping post content |
| **Collection** | Group of posts Eleventy builds from a tag — ours is called `posts` |

Eleventy runs **after** the existing build. It only adds files to `public/blog/`. It never touches `index.html` or any existing page.

---

## Directory Structure (post-implementation)

```
.eleventy.js                  ← Eleventy config (project root)
src/
  _data/
    site.js                   ← global site variables (name, url, author, etc.)
  _includes/
    head.njk                  ← <head> block (SEO meta, fonts, CSS)
    header.njk                ← site header with Blog nav link
    footer.njk                ← site footer
  _layouts/
    blog-index.njk            ← blog listing page shell
    post.njk                  ← individual post shell + Article JSON-LD
  posts/
    posts.json                ← default layout/tag/permalink for every post
    YYYY-MM-DD-slug.md        ← blog posts (date prefix sets page.date)
  blog.njk                    ← blog index page (pagination config lives here)
sass/pages/_blog.scss         ← blog-specific styles (imports design tokens)
developer/
  blog-eleventy-runbook.md    ← this file
```

---

## Phase 1 — Install Eleventy

```bash
npm install --save-dev @11ty/eleventy @11ty/eleventy-plugin-syntaxhighlight
```

`eleventy-plugin-syntaxhighlight` adds Prism-powered colored code blocks — important for a technical blog.

Verify:
```bash
npx @11ty/eleventy --version
```

---

## Phase 2 — Create Source Directory Structure

```bash
mkdir -p src/_includes src/_layouts src/_data src/posts
```

---

## Phase 3 — Eleventy Config (`.eleventy.js`)

```js
const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");

module.exports = function (eleventyConfig) {

  eleventyConfig.addPlugin(syntaxHighlight);

  // "May 21, 2026"
  eleventyConfig.addFilter("dateDisplay", function (date) {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric", timeZone: "UTC"
    });
  });

  // "2026-05-21" — used in <time datetime="...">
  eleventyConfig.addFilter("dateISO", function (date) {
    return new Date(date).toISOString().split("T")[0];
  });

  // "4 min read"
  eleventyConfig.addFilter("readingTime", function (content) {
    const text = content.replace(/<[^>]+>/g, "");
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200)) + " min read";
  });

  // posts collection — newest first
  eleventyConfig.addCollection("posts", function (api) {
    return api.getFilteredByTag("posts").reverse();
  });

  return {
    dir: {
      input: "src",
      output: "public",
      includes: "_includes",
      layouts: "_layouts",
      data: "_data"
    },
    templateFormats: ["njk", "md", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
```

**Why `output: "public"`?**  
Cloudflare Workers serves from `public/`. Eleventy adds files to `public/blog/` alongside the existing pages. It does not overwrite them.

---

## Phase 4 — Global Site Data (`src/_data/site.js`)

```js
module.exports = {
  name:          "ByteStreams",
  url:           "https://bytestreams.ai",
  description:   "Smarter Workflows, Stronger Results. AI-powered workflow automation for professional services.",
  author:        "ByteStreams Team",
  twitterHandle: "@byte_streams",
  ogImage:       "https://bytestreams.ai/assets/og-image.png"
};
```

Every template accesses these as `{{ site.name }}`, `{{ site.url }}`, etc.

---

## Phase 5 — Partial Templates

### `src/_includes/head.njk`

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="{{ description }}">
<meta name="theme-color" content="#0D1117">
<title>{{ title }}</title>
<link rel="canonical" href="{{ site.url }}{{ page.url }}">
{% if keywords %}<meta name="keywords" content="{{ keywords }}">{% endif %}
<meta property="og:title"       content="{{ title }}">
<meta property="og:description" content="{{ description }}">
<meta property="og:type"        content="article">
<meta property="og:url"         content="{{ site.url }}{{ page.url }}">
<meta property="og:image"       content="{{ ogImage if ogImage else site.ogImage }}">
<meta name="twitter:card"        content="summary_large_image">
<meta name="twitter:title"       content="{{ title }}">
<meta name="twitter:description" content="{{ description }}">
<meta name="twitter:image"       content="{{ ogImage if ogImage else site.ogImage }}">
<link rel="icon" type="image/svg+xml" href="/assets/bytestreams-icon-256.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<link rel="stylesheet" href="/dist/css/main.css">
```

### `src/_includes/header.njk`

Nav links use absolute paths (`/#about`) since blog pages live at a different depth.

```html
<header class="header" id="siteHeader">
  <div class="header__container">
    <div class="header__brand">
      <a href="/" class="header__logo" aria-label="ByteStreams — home">
        <img src="/assets/blue-side-slim-logo.png" alt="ByteStreams"
             class="header__logo-mark" width="198" height="56">
      </a>
      <p class="header__tagline">Smarter Workflows, Stronger Results.</p>
    </div>
    <nav class="header__nav" id="primaryNav" aria-label="Primary">
      <ul class="header__nav-list">
        <li><a href="/"          class="header__nav-link">Home</a></li>
        <li><a href="/#features" class="header__nav-link">Features</a></li>
        <li><a href="/#about"    class="header__nav-link">About</a></li>
        <li><a href="/blog/"     class="header__nav-link">Blog</a></li>
        <li><a href="/#contact"  class="header__nav-link">Contact</a></li>
      </ul>
    </nav>
    <div class="header__actions">
      <a href="/#contact" class="btn btn--primary btn--sm">Get Started</a>
      <button class="header__hamburger" id="hamburgerBtn"
              aria-label="Toggle navigation"
              aria-controls="primaryNav"
              aria-expanded="false">
        <span></span>
      </button>
    </div>
  </div>
</header>
```

### `src/_includes/footer.njk`

```html
<footer class="footer">
  <div class="footer__container">
    <div class="footer__grid">
      <div class="footer__brand">
        <a href="/" class="footer__logo" aria-label="ByteStreams — home">
          <img src="/assets/blue-side-slim-logo.png" alt="ByteStreams" width="198" height="56">
        </a>
        <p class="footer__tagline">Smarter Workflows, Stronger Results.</p>
      </div>
      <div class="footer__site-map" aria-label="Footer site links">
        <div class="footer__site-row">
          <p class="footer__site-label">Company</p>
          <ul class="footer__site-links">
            <li><a href="/#about" class="footer__link">About</a></li>
            <li><a href="#"       class="footer__link">Security</a></li>
          </ul>
        </div>
        <div class="footer__site-row">
          <p class="footer__site-label">Product</p>
          <ul class="footer__site-links">
            <li><a href="https://dialtone.menu" class="footer__link">DialTone.menu</a></li>
            <li><a href="#"                     class="footer__link">DialTone.med (coming soon)</a></li>
            <li><a href="/#features"            class="footer__link">Features</a></li>
          </ul>
        </div>
        <div class="footer__site-row">
          <p class="footer__site-label">Legal</p>
          <ul class="footer__site-links">
            <li><a href="/privacy.html"   class="footer__link">Privacy</a></li>
            <li><a href="/terms.html"     class="footer__link">Terms</a></li>
            <li><a href="/sms-terms.html" class="footer__link">SMS Terms</a></li>
            <li><a href="/cookies.html"   class="footer__link">Cookie Policy</a></li>
          </ul>
        </div>
      </div>
    </div>
    <div class="footer__bottom">
      <p class="footer__copyright">
        &copy; 2026 ByteStreams. Smarter Workflows, Stronger Results.
      </p>
      <div class="footer__social" aria-label="Social links">
        <a href="https://www.linkedin.com/company/bytestreams/" class="footer__social-link" aria-label="LinkedIn">
          <i class="fa-brands fa-linkedin-in" aria-hidden="true"></i>
        </a>
        <a href="https://x.com/byte_streams" class="footer__social-link" aria-label="X / Twitter">
          <i class="fa-brands fa-x-twitter" aria-hidden="true"></i>
        </a>
        <a href="https://github.com/ByteStreams-AI" class="footer__social-link" aria-label="GitHub">
          <i class="fa-brands fa-github" aria-hidden="true"></i>
        </a>
      </div>
    </div>
  </div>
</footer>
```

---

## Phase 6 — Layout Templates

### `src/_layouts/blog-index.njk`

```html
<!DOCTYPE html>
<html lang="en">
<head>{% include "head.njk" %}</head>
<body data-theme="dark">
{% include "header.njk" %}
<main id="main">
  <section class="blog-hero">
    <div class="blog-hero__container">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <ol class="breadcrumb__list">
          <li class="breadcrumb__item"><a href="/" class="breadcrumb__link">Home</a></li>
          <li class="breadcrumb__item" aria-current="page">Blog</li>
        </ol>
      </nav>
      <h1 class="blog-hero__title">Insights</h1>
      <p class="blog-hero__subtitle">
        AI automation, data engineering, and workflow optimization — straight from the ByteStreams team.
      </p>
    </div>
  </section>
  <section class="blog-listing section">
    <div class="section__container">
      <div class="blog-grid">
        {% for post in pagination.items %}
        <article class="post-card">
          <div class="post-card__meta">
            {% if post.data.category %}<span class="post-card__tag">{{ post.data.category }}</span>{% endif %}
            <time class="post-card__date" datetime="{{ post.date | dateISO }}">{{ post.date | dateDisplay }}</time>
          </div>
          <h2 class="post-card__title">
            <a href="{{ post.url }}" class="post-card__link">{{ post.data.title }}</a>
          </h2>
          <p class="post-card__excerpt">{{ post.data.description }}</p>
          <div class="post-card__footer">
            <span class="post-card__read-time">
              <i class="fa-regular fa-clock" aria-hidden="true"></i>
              {{ post.content | readingTime }}
            </span>
            <a href="{{ post.url }}" class="post-card__cta" aria-label="Read: {{ post.data.title }}">
              Read more <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </a>
          </div>
        </article>
        {% endfor %}
      </div>
      {% if pagination.href.previous or pagination.href.next %}
      <nav class="blog-pagination" aria-label="Blog pagination">
        {% if pagination.href.previous %}
        <a href="{{ pagination.href.previous }}" class="btn btn--ghost">
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Newer Posts
        </a>
        {% endif %}
        <span class="blog-pagination__info">Page {{ pagination.pageNumber + 1 }} of {{ pagination.pages.length }}</span>
        {% if pagination.href.next %}
        <a href="{{ pagination.href.next }}" class="btn btn--ghost">
          Older Posts <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
        </a>
        {% endif %}
      </nav>
      {% endif %}
    </div>
  </section>
</main>
{% include "footer.njk" %}
<script src="/js/main.js" defer></script>
</body>
</html>
```

### `src/_layouts/post.njk`

```html
<!DOCTYPE html>
<html lang="en">
<head>
{% include "head.njk" %}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{{ title | replace('"', '\"') }}",
  "description": "{{ description | replace('"', '\"') }}",
  "datePublished": "{{ page.date | dateISO }}",
  "dateModified": "{{ page.date | dateISO }}",
  "author": { "@type": "Organization", "name": "{{ site.name }}", "url": "{{ site.url }}" },
  "publisher": { "@type": "Organization", "name": "{{ site.name }}", "url": "{{ site.url }}" },
  "url": "{{ site.url }}{{ page.url }}"
}
</script>
</head>
<body data-theme="dark">
{% include "header.njk" %}
<main id="main">
  <article class="blog-post" aria-labelledby="postTitle">
    <div class="blog-post__container">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <ol class="breadcrumb__list">
          <li class="breadcrumb__item"><a href="/" class="breadcrumb__link">Home</a></li>
          <li class="breadcrumb__item"><a href="/blog/" class="breadcrumb__link">Blog</a></li>
          <li class="breadcrumb__item" aria-current="page">{{ title }}</li>
        </ol>
      </nav>
      <header class="blog-post__header">
        {% if category %}<span class="post-tag">{{ category }}</span>{% endif %}
        <h1 class="blog-post__title" id="postTitle">{{ title }}</h1>
        <div class="blog-post__meta">
          <time class="blog-post__date" datetime="{{ page.date | dateISO }}">{{ page.date | dateDisplay }}</time>
          <span class="blog-post__divider" aria-hidden="true">·</span>
          <span class="blog-post__read-time">
            <i class="fa-regular fa-clock" aria-hidden="true"></i>
            {{ content | readingTime }}
          </span>
        </div>
      </header>
      <div class="blog-post__body">{{ content | safe }}</div>
      <footer class="blog-post__footer">
        <a href="/blog/" class="btn btn--ghost">
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back to Blog
        </a>
      </footer>
    </div>
  </article>
</main>
{% include "footer.njk" %}
<script src="/js/main.js" defer></script>
</body>
</html>
```

---

## Phase 7 — Blog Index Page (`src/blog.njk`)

```yaml
---
layout: blog-index.njk
title: "Insights | ByteStreams"
description: "Expert insights on AI automation, data engineering, and workflow optimization from the ByteStreams team."
keywords: "AI automation, data engineering, workflow optimization, LLM integration, ByteStreams blog"
pagination:
  data: collections.posts
  size: 9
  alias: posts
permalink: "/blog/{% if pagination.pageNumber > 0 %}page/{{ pagination.pageNumber + 1 }}/{% endif %}"
---
```

That is the entire file — frontmatter only. The layout handles the HTML.

---

## Phase 8 — Post Defaults (`src/posts/posts.json`)

```json
{
  "layout": "post.njk",
  "tags": "posts",
  "category": "Insights",
  "permalink": "/blog/{{ page.fileSlug }}/index.html"
}
```

This JSON applies to every `.md` file in `src/posts/` automatically. You never repeat layout or tags in individual post frontmatter.

**Permalink note:** For a file named `2026-05-21-my-post.md`, Eleventy strips the date prefix and outputs `public/blog/my-post/index.html` → URL: `https://bytestreams.ai/blog/my-post/`

---

## Phase 9 — Writing Posts

### Frontmatter reference

```markdown
---
title: "Your Post Title"
description: "One sentence — appears as Google snippet and post card excerpt. 140–160 chars."
category: "AI Automation"
keywords: "keyword one, keyword two, keyword three, keyword four"
ogImage: "https://bytestreams.ai/assets/blog/post-og.jpg"
---

Post content starts here...
```

| Field | Required | Purpose |
|---|---|---|
| `title` | Yes | `<title>`, `og:title`, post `<h1>` |
| `description` | Yes | Meta description, og:description, card excerpt |
| `category` | No | Tag badge on card and post header (falls back to "Insights") |
| `keywords` | No | `<meta keywords>` — 6–10 comma-separated terms |
| `ogImage` | No | Custom social share image — falls back to `site.ogImage` |

The **filename date** (`2026-05-21-`) sets `page.date`. Always include it.

---

## Phase 10 — Sass (`sass/pages/_blog.scss`)

See [sass/pages/_blog.scss](../sass/pages/_blog.scss) — uses existing design tokens (`$stream-blue`, `$font-size-h4`, `$space-xl`, etc.).

Registered in `sass/main.scss` with:
```scss
@use 'pages/blog';
```

---

## Phase 11 — package.json Scripts

```json
"blog:build":  "eleventy",
"blog:serve":  "eleventy --serve --port 8080",
"build":       "npm run sass && npm run build:public && npm run blog:build",
"dev:worker":  "npm run build && wrangler dev --config wrangler.toml --port 8787"
```

**Build order matters:** `sass` → `build:public` (wipes + repopulates `public/`) → `blog:build` (Eleventy adds `public/blog/`).

---

## Phase 12 — Nav Update (Existing HTML Pages)

Add to nav list in `index.html`, `privacy.html`, `terms.html`, `cookies.html`, `sms-terms.html`:

```html
<li><a href="/blog/" class="header__nav-link">Blog</a></li>
```

Between the About and Contact items.

---

## Day-to-Day Writing Workflow

1. Create `src/posts/YYYY-MM-DD-post-slug.md`
2. Add frontmatter + write content
3. Preview: `npm run blog:serve` → `http://localhost:8080/blog/`
4. Full build: `npm run build`
5. Full local test: `wrangler dev --config wrangler.toml --port 8787`
6. Deploy: `wrangler deploy` (when ready)

---

## Sitemap

After each deploy, add a `<url>` entry to `public/sitemap.xml` for each new post:

```xml
<url>
  <loc>https://bytestreams.ai/blog/post-slug/</loc>
  <lastmod>2026-05-21</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.8</priority>
</url>
```

Then submit in Google Search Console → Sitemaps.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Error: Cannot find module '.eleventy.js'` | Run all commands from project root |
| CSS not loading on blog pages | CSS path must be `/dist/css/main.css` (absolute), not relative |
| Posts not showing on listing page | Check `tags: posts` is in `src/posts/posts.json` |
| Date showing as `Invalid Date` | Filename must start with `YYYY-MM-DD-` |
| Eleventy overwrites `index.html` | It won't — it only processes files inside `src/` |
