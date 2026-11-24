# Blog & Social Publishing — Operations Runbook

> Day-to-day reference for publishing a ByteStreams blog post and its
> corresponding Twitter thread and LinkedIn post.

---

## Prerequisites

| Tool | Check |
|---|---|
| Node.js 18+ | `node --version` |
| Eleventy installed | `npx @11ty/eleventy --version` |
| `.env` configured | `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set |
| Sass compiled | `dist/css/main.css` exists |

---

## Step 1 — Write the Blog Post

Create a new Markdown file in `src/posts/` (copy `src/posts/_template.md`
as a starting point). The filename date sets the publish date — always
include it.

```bash
# File naming convention
src/posts/YYYY-MM-DD-post-slug-here.md
# → published at https://bytestreams.ai/blog/post-slug-here/
```

The date prefix is stripped from the URL. Keep the slug **lowercase** —
URLs are case-sensitive, and renaming a slug after it's indexed needs a
redirect.

### Required frontmatter

```markdown
---
title: "Your Post Title Here"
description: "One sentence that will become the Google snippet and card excerpt. Keep it 140–160 characters."
category: "AI Automation"
keywords: "keyword one, keyword two, keyword three, keyword four, keyword five"
---

Post body starts here...
```

### Frontmatter reference

| Field | Required | Notes |
|---|---|---|
| `title` | Yes | Appears in `<title>`, `og:title`, and the post `<h1>` |
| `description` | Yes | Meta description + card excerpt. 140–160 chars. |
| `category` | No | Tag badge on card and post header. Defaults to `"Insights"` |
| `keywords` | No | 6–10 comma-separated terms for `<meta keywords>` |
| `ogImage` | No | Custom social share image URL. Falls back to site default |
| `updated` | No | `YYYY-MM-DD` of a meaningful revision. Sets the sitemap `<lastmod>` and Article `dateModified`; defaults to the filename date |

### Writing guidelines

- **First paragraph** must contain the primary keyword naturally
- At least one `## H2` should include a keyword or close variant
- Aim for 600–1500 words — enough to signal content depth to Google
- Link to the relevant service page where it fits
  (`/healthcare-consulting.html` or `/ai-data-services.html`)
- End with a CTA linking to `/#contact`

---

## Step 2 — Generate Social Posts

Run the generator immediately after writing the post. Both Twitter and
LinkedIn are created in a single command.

```bash
npm run social -- YYYY-MM-DD-post-slug-here
```

**Example:**
```bash
npm run social -- 2026-05-21-why-ai-workflow-implementations-fail
```

**Output:**
```
twitter/2026-05-21-why-ai-workflow-implementations-fail.md
linkedin/2026-05-21-why-ai-workflow-implementations-fail.md
```

### Regenerate (overwrite existing files)

```bash
npm run social -- 2026-05-21-post-slug --force
```

### How it works

- Reads frontmatter + content from `src/posts/`
- Calls the LLM API (Anthropic preferred, falls back to OpenAI)
- Both platforms generated in parallel (~5–10 seconds)
- Output files are marked `Status: DRAFT` — review before posting

### API provider priority

1. `ANTHROPIC_API_KEY` — used first if present
2. `OPENAI_API_KEY` — used as fallback
3. Neither set → error with instructions

Defaults (set in `scripts/social-gen.js`) are `claude-opus-4-5` and
`gpt-4o`. To override the model:
```
# In .env
ANTHROPIC_MODEL=claude-opus-5-5
OPENAI_MODEL=gpt-4o
```

---

## Step 3 — Review Social Content

Open the generated files and review:

```
twitter/YYYY-MM-DD-post-slug.md
linkedin/YYYY-MM-DD-post-slug.md
```

### Twitter checklist
- [ ] Hook tweet works as a standalone statement
- [ ] Each tweet is under 280 characters
- [ ] Numbered points are clear and scannable
- [ ] Final tweet has the blog URL
- [ ] Tone sounds like ByteStreams, not a press release

### LinkedIn checklist
- [ ] Line 1 (the hook) is strong enough to stop a scroll
- [ ] Paragraphs are short (2–4 lines)
- [ ] URL is in the **Comment** section only — not the post body
- [ ] 3–5 hashtags at the end
- [ ] Ends with `Full post in the comments 👇`

Change `Status: DRAFT` → `Status: SCHEDULED` or `Status: POSTED` when done.

---

## Step 4 — Build the Site

```bash
npm run build
```

This runs three steps in sequence:
1. `sass` — compiles `sass/main.scss` → `dist/css/main.css`
2. `build:public` — wipes and repopulates `public/` from source files
3. `blog:build` — Eleventy generates `public/blog/` and `public/sitemap.xml` from `src/`

### Verify output

```bash
ls public/blog/
# Should show: index.html  your-new-post/
grep your-new-post public/sitemap.xml
# Should show the post's <loc> — the sitemap is generated, never hand-edited
```

---

## Step 5 — Preview Locally

```bash
npm run dev:worker
```

Opens the full site via Cloudflare Workers at **http://localhost:8787**

Check:
- `http://localhost:8787/blog/` — post card appears in grid
- `http://localhost:8787/blog/your-post-slug/` — post renders correctly
- Breadcrumb, reading time, category tag all display
- "Back to Blog" button works

---

## Step 6 — Deploy

Deploys run through GitHub Actions (`.github/workflows/deploy.yml`), which
builds the site and runs `wrangler deploy` on every push to `main`.

> **Gotcha:** the workflow ignores `**/*.md` changes, so a push that only
> adds a post (or edits `twitter/` / `linkedin/` drafts) does **not**
> deploy. After merging, run it manually: GitHub → Actions → **Deploy** →
> **Run workflow**, or `gh workflow run deploy.yml --ref main`.

Manual fallback from a local machine (after `npm run build`):

```bash
npx wrangler deploy --config wrangler.toml
```

> Only deploy when you are ready to go live. See git workflow policy —
> stage and review changes before deploying.

---

## Step 7 — Post to Social

**Twitter/X:**
1. Open `twitter/YYYY-MM-DD-post-slug.md`
2. Copy Tweet 1 → post
3. Reply to your own tweet with Tweet 2, continue threading
4. Final tweet includes the blog URL

**LinkedIn:**
1. Open `linkedin/YYYY-MM-DD-post-slug.md`
2. Copy the `POST:` section → paste into LinkedIn
3. Post it
4. Immediately add the first comment with just the blog URL

---

## Step 8 — Request Indexing

No sitemap edits needed: `src/sitemap.njk` adds every post automatically
on build, and `/blog/`'s `<lastmod>` follows the newest post. Confirm it's
live at <https://bytestreams.ai/sitemap.xml>.

In **Google Search Console**:

1. **URL Inspection** → paste the post URL → **Request Indexing**.
2. The sitemap only needs submitting once (**Sitemaps** → `sitemap.xml`);
   Google re-reads it on its own.

> Static (non-blog) pages are listed in `src/_data/sitemapPages.js`. Add a
> row when you create a new page, and bump its `lastmod` when its content
> meaningfully changes.

---

## Full Command Summary

```bash
# 1. Write post
#    src/posts/YYYY-MM-DD-slug.md

# 2. Generate social
npm run social -- YYYY-MM-DD-slug

# 3. Review twitter/ and linkedin/ files

# 4. Build
npm run build

# 5. Preview
npm run dev:worker

# 6. Deploy (when ready) — merge to main, then run the workflow manually
gh workflow run deploy.yml --ref main

# 7. Post to Twitter/X and LinkedIn

# 8. Search Console → URL Inspection → Request Indexing
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `No API key found` | Check `.env` has `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` |
| `Post not found` | Filename must match exactly — include the date prefix |
| `File already exists` | Add `--force` to regenerate |
| Post not in blog grid | Check `src/posts/posts.json` has `"tags": "posts"` |
| CSS missing on blog pages | CSS path must be absolute: `/dist/css/main.css` |
| Date shows as `Invalid Date` | Filename must start with `YYYY-MM-DD-` |
| Eleventy build error | Run from project root; check `.eleventy.js` is present |
| Post not in sitemap | Rebuild; check the post has the `posts` tag (via `posts.json`) and isn't in `.eleventyignore` |
| Pushed a post but site didn't update | `.md`-only pushes skip the deploy workflow — run it manually (Step 6) |
