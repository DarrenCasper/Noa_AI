function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isBrowseSearchEnabled() {
  return String(process.env.ENABLE_BROWSE_SEARCH || "false").toLowerCase() === "true";
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) return fallback;

  return Math.min(Math.max(number, min), max);
}

function normalizeSearchResult(item, index) {
  return {
    index: index + 1,
    title: normalizeText(item.title),
    url: item.url || "",
    content: normalizeText(item.content),
    score: typeof item.score === "number" ? item.score : null,
    publishedDate: item.published_date || item.publishedDate || null,
  };
}

function buildNoaSearchSummary({ query, answer, results }) {
  const lines = [];

  lines.push(`I searched the web for: ${query}`);

  if (answer) {
    lines.push("");
    lines.push("Quick answer:");
    lines.push(answer);
  }

  if (results.length > 0) {
    lines.push("");
    lines.push("Sources found:");

    results.slice(0, 5).forEach((result) => {
      lines.push(`${result.index}. ${result.title || "Untitled source"}`);
      lines.push(`   ${result.url}`);
      if (result.content) {
        lines.push(`   ${result.content.slice(0, 180)}`);
      }
    });
  }

  if (results.length === 0) {
    lines.push("");
    lines.push("No useful sources were found.");
  }

  return lines.join("\n");
}

async function searchWithTavily({
  query,
  maxResults = 5,
  searchDepth = "basic",
  includeAnswer = true,
  includeRawContent = false,
  includeImages = false,
}) {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw makeStatusError("TAVILY_API_KEY is not set in .env", 503);
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: searchDepth,
      max_results: maxResults,
      include_answer: includeAnswer,
      include_raw_content: includeRawContent,
      include_images: includeImages,
    }),
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Tavily returned non-JSON response: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(
      data?.error || data?.message || `Tavily search failed with HTTP ${response.status}`
    );
  }

  const results = Array.isArray(data.results)
    ? data.results.map(normalizeSearchResult)
    : [];

  const answer = normalizeText(data.answer);

  return {
    provider: "tavily",
    query,
    answer,
    results,
    images: Array.isArray(data.images) ? data.images : [],
    responseTime: data.response_time || null,
    summary: buildNoaSearchSummary({
      query,
      answer,
      results,
    }),
    closingQuestion:
      results.length > 0
        ? "Would you like me to look into any of these further, Sensei?"
        : "Would you like me to try a different search, Sensei?",
  };
}

function makeStatusError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function browseSearch(options) {
  if (!isBrowseSearchEnabled()) {
    throw makeStatusError(
      "Browse search is disabled. Set ENABLE_BROWSE_SEARCH=true.",
      503
    );
  }

  const query = normalizeText(options.query || options.q);

  if (!query) {
    throw makeStatusError("Search query is required.", 400);
  }

  const provider = String(
    options.provider || process.env.BROWSE_SEARCH_PROVIDER || "tavily"
  ).toLowerCase();

  const maxResults = clampNumber(options.maxResults || options.max_results, 5, 1, 10);

  const searchDepth =
    options.searchDepth === "advanced" || options.search_depth === "advanced"
      ? "advanced"
      : "basic";

  const includeAnswer = options.includeAnswer !== false;
  const includeRawContent = options.includeRawContent === true;
  const includeImages = options.includeImages === true;

  if (provider !== "tavily") {
    throw makeStatusError(`Unsupported browse search provider: ${provider}`, 400);
  }

  return searchWithTavily({
    query,
    maxResults,
    searchDepth,
    includeAnswer,
    includeRawContent,
    includeImages,
  });
}

module.exports = {
  browseSearch,
};