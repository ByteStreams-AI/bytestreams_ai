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

Create a new Markdown file in `src/posts/`. The filename date sets the
publish date — always include it.

```bash
# File naming convention
src/posts/YYYY-MM-DD-post-slug-here.md
```

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

### Writing guidelines

- **First paragraph** must contain the primary keyword naturally
- At least one `## H2` should include a keyword or close variant
- Aim for 600–1500 words — enough to signal content depth to Google
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

To override the model:
```
# In .env
ANTHROPIC_MODEL=claude-opus-4-5
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
3. `blog:build` — Eleventy generates `public/blog/` from `src/`

### Verify output

```bash
ls public/blog/
# Should show: index.html  your-new-post/
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

```bash
wrangler deploy
```

> Only run this when you are ready to go live. See git workflow policy —
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

## Step 8 — Update Sitemap

Add a `<url>` entry to `public/sitemap.xml`:

```xml
<url>
  <loc>https://bytestreams.ai/blog/post-slug/</loc>
  <lastmod>YYYY-MM-DD</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.8</priority>
</url>
```

Then submit in **Google Search Console → Sitemaps**.

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

# 6. Deploy (when ready)
wrangler deploy
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
