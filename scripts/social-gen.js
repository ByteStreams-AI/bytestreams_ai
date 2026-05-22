#!/usr/bin/env node
// scripts/social-gen.js
// Generates Twitter thread + LinkedIn post from a blog post using an LLM.
//
// Usage:
//   npm run social -- 2026-05-21-why-ai-workflow-implementations-fail
//   npm run social -- 2026-05-21-why-ai-workflow-implementations-fail --force
//
// Requires .env with ANTHROPIC_API_KEY or OPENAI_API_KEY.
// If both are set, Anthropic is used.

const fs   = require("fs");
const path = require("path");

// ─── Load .env ────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val   = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// ─── Parse YAML frontmatter ──────────────────────────────────────────────────
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { data: {}, content: raw };
  const data = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let   val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    data[key] = val;
  }
  return { data, content: match[2].trim() };
}

// ─── LLM call ────────────────────────────────────────────────────────────────
async function callAnthropic(prompt) {
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }
  const json = await res.json();
  return json.content[0].text;
}

async function callOpenAI(prompt) {
  const model = process.env.OPENAI_MODEL || "gpt-4o";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }
  const json = await res.json();
  return json.choices[0].message.content;
}

async function callLLM(prompt) {
  if (process.env.ANTHROPIC_API_KEY) return callAnthropic(prompt);
  if (process.env.OPENAI_API_KEY)    return callOpenAI(prompt);
  throw new Error("No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env");
}

// ─── Prompts ─────────────────────────────────────────────────────────────────
function twitterPrompt({ title, description, category, content, url }) {
  return `You are writing a Twitter/X thread for ByteStreams, an AI engineering studio that builds production AI workflows and data systems for professional services teams.

Write a Twitter thread based on this blog post. Requirements:
- 4–6 tweets total
- Tweet 1: A strong hook that works as a standalone statement. No hashtags. No "Thread:" label.
- Middle tweets: Break down the key insights. Number them (1/, 2/, 3/).
- Final tweet: Punchy conclusion + CTA with the blog URL. Optional 1–2 hashtags max.
- Each tweet must be under 280 characters (count carefully)
- Tone: direct, technical but accessible, confident — no buzzwords, no fluff, no cringe
- Use bullet points with • for lists within a tweet
- Keep ByteStreams voice: earned expertise, not hype

Blog URL: ${url}
Title: ${title}
Category: ${category || "Insights"}
Description: ${description}

Blog post:
${content}

Output format — use exactly this structure, no extra commentary:
Tweet 1:
[text]

Tweet 2:
[text]

Tweet 3:
[text]

(continue as needed)`;
}

function linkedinPrompt({ title, description, category, content, url }) {
  return `You are writing a LinkedIn post for ByteStreams, an AI engineering studio that builds production AI workflows and data systems for professional services teams.

Write a LinkedIn post based on this blog post. Requirements:
- Line 1 is the hook — this is what appears before "see more". Make it impossible to scroll past.
- 150–250 words total
- Short paragraphs (2–4 lines max) for mobile readability
- Use **bold** for section headers where it helps structure
- End with 3–5 hashtags — mix broad (#AI) with specific (#LLMEngineering)
- Add "Full post in the comments 👇" as the final line before hashtags
- DO NOT include the blog URL in the post body — LinkedIn suppresses reach on posts with external links. Put the URL in the "Comment" section below.
- Tone: professional but human, backed by real technical experience, direct — not salesy

Blog URL: ${url}
Title: ${title}
Category: ${category || "Insights"}
Description: ${description}

Blog post:
${content}

Output format — use exactly this structure, no extra commentary:
POST:
[LinkedIn post text]

COMMENT:
${url}`;
}

// ─── File output ──────────────────────────────────────────────────────────────
function buildTwitterFile({ title, url, date, slug }, generated) {
  return `# Twitter Thread
# Post: ${title}
# Blog URL: ${url}
# Date: ${date}
# Status: DRAFT
# Generated by: scripts/social-gen.js
# ─────────────────────────────────────────────────────────────────────────────

${generated}
`;
}

function buildLinkedinFile({ title, url, date, slug }, generated) {
  // Split POST and COMMENT sections from LLM output
  const postMatch    = generated.match(/POST:\s*([\s\S]*?)(?:\nCOMMENT:|$)/);
  const commentMatch = generated.match(/COMMENT:\s*([\s\S]*?)$/);
  const postBody    = postMatch    ? postMatch[1].trim()    : generated.trim();
  const commentBody = commentMatch ? commentMatch[1].trim() : url;

  return `# LinkedIn Post
# Post: ${title}
# Blog URL: ${url}
# Date: ${date}
# Status: DRAFT
# Generated by: scripts/social-gen.js
# ─────────────────────────────────────────────────────────────────────────────

${postBody}

---

**Comment (post link separately for better reach):**
${commentBody}
`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  loadEnv();

  const args  = process.argv.slice(2);
  const force = args.includes("--force");
  const input = args.find(a => !a.startsWith("--"));

  if (!input) {
    console.error("Usage: npm run social -- <post-slug-or-filename> [--force]");
    console.error("Example: npm run social -- 2026-05-21-why-ai-workflow-implementations-fail");
    process.exit(1);
  }

  // Resolve post file
  const postsDir = path.join(process.cwd(), "src", "posts");
  const slug     = input.replace(/\.md$/, "");
  const postPath = path.join(postsDir, `${slug}.md`);

  if (!fs.existsSync(postPath)) {
    console.error(`Post not found: ${postPath}`);
    process.exit(1);
  }

  // Parse post
  const raw            = fs.readFileSync(postPath, "utf8");
  const { data, content } = parseFrontmatter(raw);
  const { title, description, category } = data;

  if (!title) {
    console.error("Post is missing a 'title' in frontmatter.");
    process.exit(1);
  }

  // Derive date and clean slug (strip leading date prefix for URL)
  const dateMatch = slug.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  const date      = dateMatch ? dateMatch[1] : new Date().toISOString().split("T")[0];
  const urlSlug   = dateMatch ? dateMatch[2] : slug;
  const url       = `https://bytestreams.ai/blog/${urlSlug}/`;

  // Check output files
  const twitterPath  = path.join(process.cwd(), "twitter",  `${slug}.md`);
  const linkedinPath = path.join(process.cwd(), "linkedin", `${slug}.md`);

  for (const p of [twitterPath, linkedinPath]) {
    if (fs.existsSync(p) && !force) {
      console.error(`File already exists: ${p}`);
      console.error("Use --force to overwrite.");
      process.exit(1);
    }
  }

  const ctx = { title, description, category, content, url, date, slug };

  console.log(`\n📝 Generating social posts for: "${title}"`);
  console.log(`   Provider: ${process.env.ANTHROPIC_API_KEY ? "Anthropic" : "OpenAI"}`);
  console.log(`   Blog URL: ${url}\n`);

  // Generate both in parallel
  const [twitterRaw, linkedinRaw] = await Promise.all([
    callLLM(twitterPrompt(ctx)).then(r => { console.log("   ✓ Twitter thread generated"); return r; }),
    callLLM(linkedinPrompt(ctx)).then(r => { console.log("   ✓ LinkedIn post generated");  return r; })
  ]);

  // Write files
  fs.writeFileSync(twitterPath,  buildTwitterFile(ctx, twitterRaw),   "utf8");
  fs.writeFileSync(linkedinPath, buildLinkedinFile(ctx, linkedinRaw), "utf8");

  console.log(`\n✅ Done!`);
  console.log(`   twitter/${slug}.md`);
  console.log(`   linkedin/${slug}.md\n`);
}

main().catch(err => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});
