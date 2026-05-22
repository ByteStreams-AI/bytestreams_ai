const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");

module.exports = function (eleventyConfig) {

  // Code block syntax highlighting (Prism.js)
  eleventyConfig.addPlugin(syntaxHighlight);

  // Date display filter: 2026-05-21 → "May 21, 2026"
  eleventyConfig.addFilter("dateDisplay", function (date) {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric", timeZone: "UTC"
    });
  });

  // ISO date filter: used in <time datetime="..."> attributes
  eleventyConfig.addFilter("dateISO", function (date) {
    return new Date(date).toISOString().split("T")[0];
  });

  // Reading time filter: strips HTML tags, counts words at 200 wpm
  eleventyConfig.addFilter("readingTime", function (content) {
    const text = content.replace(/<[^>]+>/g, "");
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 200)) + " min read";
  });

  // "posts" collection — all items tagged "posts", sorted newest first
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
