const express = require("express");

const { browseSearch } = require("../services/browseSearchService");

const router = express.Router();

function getUserId(req) {
  return req.body?.userId || req.query?.userId || process.env.DEFAULT_USER_ID || "main-whatsapp";
}

router.get("/search", async (req, res) => {
  try {
    const query = req.query.q || req.query.query;

    const result = await browseSearch({
      query,
      provider: req.query.provider,
      maxResults: req.query.maxResults || req.query.max_results,
      searchDepth: req.query.searchDepth || req.query.search_depth,
      includeAnswer: req.query.includeAnswer !== "false",
      includeImages: req.query.includeImages === "true",
      includeRawContent: req.query.includeRawContent === "true",
    });

    return res.json({
      message: "Browse search completed.",
      userId: getUserId(req),
      ...result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: "Browse search failed.",
      error: error.message,
    });
  }
});

router.post("/search", async (req, res) => {
  try {
    const result = await browseSearch({
      query: req.body.query || req.body.q,
      provider: req.body.provider,
      maxResults: req.body.maxResults || req.body.max_results,
      searchDepth: req.body.searchDepth || req.body.search_depth,
      includeAnswer: req.body.includeAnswer !== false,
      includeImages: req.body.includeImages === true,
      includeRawContent: req.body.includeRawContent === true,
    });

    return res.json({
      message: "Browse search completed.",
      userId: getUserId(req),
      ...result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: "Browse search failed.",
      error: error.message,
    });
  }
});

module.exports = router;