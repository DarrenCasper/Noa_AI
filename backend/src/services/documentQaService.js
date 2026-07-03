const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function normalizeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function getQuestionKeywords(question) {
  const stopwords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "from",
    "with",
    "this",
    "that",
    "what",
    "why",
    "how",
    "when",
    "where",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "me",
    "my",
    "it",
    "pdf",
    "document",
    "image",
    "file",
    "screenshot",
    "explain",
    "jelaskan",
    "apa",
    "yang",
    "ini",
    "itu",
    "dari",
    "ke",
    "di",
    "dan",
    "atau",
    "untuk",
  ]);

  return normalizeText(question)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !stopwords.has(word))
    .slice(0, 20);
}

function chunkText(text, chunkSize = 3500, overlap = 400) {
  const clean = normalizeText(text);

  if (!clean) return [];

  const chunks = [];
  let start = 0;

  while (start < clean.length) {
    const end = Math.min(start + chunkSize, clean.length);
    const chunk = clean.slice(start, end).trim();

    if (chunk) {
      chunks.push({
        index: chunks.length + 1,
        start,
        end,
        text: chunk,
      });
    }

    if (end >= clean.length) break;

    start = Math.max(0, end - overlap);
  }

  return chunks;
}

function scoreChunk(chunk, keywords) {
  if (!keywords.length) return 0;

  const lower = chunk.text.toLowerCase();

  return keywords.reduce((score, keyword) => {
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    const matches = lower.match(regex);

    return score + (matches ? matches.length : 0);
  }, 0);
}

function selectRelevantChunks(text, question, maxChunks = 4) {
  const chunks = chunkText(text);
  const keywords = getQuestionKeywords(question);

  if (!chunks.length) return [];

  if (!keywords.length) {
    return chunks.slice(0, maxChunks);
  }

  const scored = chunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(chunk, keywords),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = scored.filter((chunk) => chunk.score > 0).slice(0, maxChunks);

  if (selected.length > 0) {
    return selected.sort((a, b) => a.index - b.index);
  }

  return chunks.slice(0, maxChunks);
}

function buildContext(chunks) {
  return chunks
    .map((chunk) => {
      return `Section ${chunk.index}:\n${chunk.text}`;
    })
    .join("\n\n---\n\n");
}

function fallbackAnswer(rawText) {
  const clean = normalizeText(rawText);

  return {
    answer:
      clean ||
      "Sensei, I tried to answer from the document, but I could not produce a clear response.",
    confidence: "low",
    referencedSections: [],
    suggestedFollowUps: [
      "Summarize this document",
      "Find the important points",
      "Make a checklist",
    ],
  };
}

function normalizeQaResult(parsed, rawText) {
  if (!parsed || typeof parsed !== "object") {
    return fallbackAnswer(rawText);
  }

  const answer = normalizeText(parsed.answer);
  const confidence = ["low", "medium", "high"].includes(
    String(parsed.confidence || "").toLowerCase()
  )
    ? String(parsed.confidence).toLowerCase()
    : "medium";

  const referencedSections = Array.isArray(parsed.referencedSections)
    ? parsed.referencedSections
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
        .slice(0, 8)
    : [];

  const suggestedFollowUps = Array.isArray(parsed.suggestedFollowUps)
    ? parsed.suggestedFollowUps
        .map((item) => normalizeText(item))
        .filter(Boolean)
        .slice(0, 4)
    : [];

  return {
    answer:
      answer ||
      "Sensei, I found the document, but I could not produce a clear answer from its content.",
    confidence,
    referencedSections,
    suggestedFollowUps:
      suggestedFollowUps.length > 0
        ? suggestedFollowUps
        : [
            "Summarize this document",
            "Find the important points",
            "Make a checklist",
          ],
  };
}

async function askDocumentQuestion(document, question) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in .env");
  }

  const cleanQuestion = normalizeText(question);

  if (!cleanQuestion) {
    throw new Error("Question is required.");
  }

  if (!document.extractedText || !document.extractedText.trim()) {
    throw new Error("Document has no extracted text to answer from.");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const selectedChunks = selectRelevantChunks(
    document.extractedText,
    cleanQuestion,
    4
  );

  const context = buildContext(selectedChunks);

  const prompt = `
You are Noa, Sensei's calm document assistant.

Always answer in English by default, even if the document is in Indonesian.
Answer only using the provided document context.
If the answer is not available in the context, say that clearly.
Do not invent facts, deadlines, requirements, or page numbers.
If the question asks for a checklist, create a practical checklist from the available context.
If the question asks what to study, explain the important study points.
If the question asks for an explanation, make it easier to understand.
Keep the tone calm, concise, and useful.

Document name:
${document.originalName || "uploaded document"}

Question:
${cleanQuestion}

Document context:
${context}

Return valid JSON only with this structure:
{
  "answer": "clear answer in English",
  "confidence": "low | medium | high",
  "referencedSections": [1, 2],
  "suggestedFollowUps": [
    "short follow-up question 1",
    "short follow-up question 2"
  ]
}
`;

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt,
          },
        ],
      },
    ],
  });

  const rawText = response.output_text || "";
  const parsed = safeJsonParse(rawText);
  const result = normalizeQaResult(parsed, rawText);

  return {
    ...result,
    usedSections: selectedChunks.map((chunk) => ({
      section: chunk.index,
      start: chunk.start,
      end: chunk.end,
      score: scoreChunk(chunk, getQuestionKeywords(cleanQuestion)),
    })),
  };
}

module.exports = {
  askDocumentQuestion,
};