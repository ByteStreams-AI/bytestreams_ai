// Non-blog pages listed in /sitemap.xml (built by src/sitemap.njk).
// Blog posts and the blog index are added automatically from the posts
// collection — only edit this list when a static page is added, removed,
// or its content meaningfully changes (bump `lastmod`).
// Paths are extensionless: Cloudflare redirects /page.html → /page, so the
// extensionless form is the canonical URL. Match each page's <link rel="canonical">.
// Priority: homepage 1.0, content pages 0.8, legal 0.3. Never list 404.html.
module.exports = [
  { path: "/",                      lastmod: "2026-11-25", changefreq: "weekly",  priority: "1.0" },
  { path: "/tools",                 lastmod: "2026-11-23", changefreq: "monthly", priority: "0.8" },
  { path: "/healthcare-consulting", lastmod: "2026-11-23", changefreq: "monthly", priority: "0.8" },
  { path: "/ai-data-services",      lastmod: "2026-11-24", changefreq: "monthly", priority: "0.8" },
  { path: "/privacy",               lastmod: "2026-04-22", changefreq: "yearly",  priority: "0.3" },
  { path: "/terms",                 lastmod: "2026-04-22", changefreq: "yearly",  priority: "0.3" },
  { path: "/sms-terms",             lastmod: "2026-04-29", changefreq: "yearly",  priority: "0.3" },
  { path: "/cookies",               lastmod: "2026-04-22", changefreq: "yearly",  priority: "0.3" }
];
