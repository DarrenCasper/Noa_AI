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

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    "photo",
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
    const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "g");
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
    .map((chunk) => `Section ${chunk.index}:\n${chunk.text}`)
    .join("\n\n---\n\n");
}

function removeGenericClosing(answer) {
  const text = normalizeText(answer);
  if (!text) return "";

  const forbiddenPatterns = [
    /\bif\s+you\s+want\b/i,
    /\bif\s+you(?:'|’)d\s+like\b/i,
    /\bif\s+you\s+would\s+like\b/i,
    /\blet\s+me\s+know\b/i,
    /\bi\s+can\s+also\b/i,
    /\bi\s+can\s+help\s+further\b/i,
    /\bi\s+can\s+help\s+you\s+further\b/i,
    /\bfeel\s+free\s+to\s+ask\b/i,
  ];

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const filtered = sentences.filter((sentence) => {
    return !forbiddenPatterns.some((pattern) => pattern.test(sentence));
  });

  return filtered.join(" ").trim();
}

function getDefaultSuggestedFollowUps(question, answer = "") {
  const q = normalizeText(question).toLowerCase();
  const a = normalizeText(answer).toLowerCase();

  if (
    q.includes("question") ||
    q.includes("questions") ||
    q.includes("soal") ||
    a.includes("question") ||
    a.includes("questions")
  ) {
    return ["Answer the questions one by one", "Make a short cheat sheet"];
  }

  if (
    q.includes("study") ||
    q.includes("belajar") ||
    q.includes("important") ||
    q.includes("points") ||
    q.includes("materi")
  ) {
    return ["Make a short cheat sheet", "Turn this into a study checklist"];
  }

  if (q.includes("checklist")) {
    return ["Create a study task from this checklist", "Find deadlines"];
  }

  if (
    q.includes("requirement") ||
    q.includes("requirements") ||
    q.includes("assignment")
  ) {
    return ["Make an assignment checklist", "Find deadlines"];
  }

  return ["Make a short cheat sheet", "Answer the questions one by one"];
}

function buildDefaultClosingQuestion(question, suggestedFollowUps = [], answer = "") {
  const q = normalizeText(question).toLowerCase();
  const joinedFollowUps = suggestedFollowUps.join(" ").toLowerCase();
  const a = normalizeText(answer).toLowerCase();

  if (
    q.includes("question") ||
    q.includes("questions") ||
    q.includes("soal") ||
    joinedFollowUps.includes("question") ||
    a.includes("question") ||
    a.includes("questions")
  ) {
    return "Would you like me to answer the questions one by one, Sensei?";
  }

  if (
    q.includes("checklist") ||
    joinedFollowUps.includes("checklist") ||
    a.includes("checklist")
  ) {
    return "Would you like me to turn this into a study checklist, Sensei?";
  }

  if (
    q.includes("cheat sheet") ||
    joinedFollowUps.includes("cheat sheet") ||
    q.includes("study") ||
    q.includes("belajar") ||
    q.includes("important points")
  ) {
    return "Would you like me to make this into a short cheat sheet, Sensei?";
  }

  if (
    q.includes("deadline") ||
    q.includes("due") ||
    joinedFollowUps.includes("deadline")
  ) {
    return "Would you like me to check this file for deadlines, Sensei?";
  }

  return "Would you like me to continue with the next useful step, Sensei?";
}

function normalizeClosingQuestion(value, question, suggestedFollowUps = [], answer = "") {
  const text = normalizeText(value);

  const forbiddenPattern =
    /\bif\s+you\s+want\b|\bif\s+you(?:'|’)d\s+like\b|\bif\s+you\s+would\s+like\b|\blet\s+me\s+know\b|\bi\s+can\s+also\b|\bi\s+can\s+help\s+further\b/i;

  if (!text || forbiddenPattern.test(text)) {
    return buildDefaultClosingQuestion(question, suggestedFollowUps, answer);
  }

  if (!text.toLowerCase().startsWith("would you like me to")) {
    return buildDefaultClosingQuestion(question, suggestedFollowUps, answer);
  }

  if (!text.toLowerCase().includes("sensei")) {
    return `${text.replace(/[?.!]*$/, "")}, Sensei?`;
  }

  return text.replace(/[!.]*$/, "?");
}

function fallbackAnswer(rawText, question = "") {
  const clean = removeGenericClosing(rawText);

  const suggestedFollowUps = getDefaultSuggestedFollowUps(question, clean);

  return {
    answer:
      clean ||
      "Sensei, I tried to answer from the document, but I could not produce a clear response.",
    confidence: "low",
    referencedSections: [],
    suggestedFollowUps,
    closingQuestion: buildDefaultClosingQuestion(question, suggestedFollowUps, clean),
  };
}

function normalizeQaResult(parsed, rawText, question = "") {
  if (!parsed || typeof parsed !== "object") {
    return fallbackAnswer(rawText, question);
  }

  const answer = removeGenericClosing(parsed.answer);

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
    : getDefaultSuggestedFollowUps(question, answer);

  const finalSuggestedFollowUps =
    suggestedFollowUps.length > 0
      ? suggestedFollowUps
      : getDefaultSuggestedFollowUps(question, answer);

  const closingQuestion = normalizeClosingQuestion(
    parsed.closingQuestion,
    question,
    finalSuggestedFollowUps,
    answer
  );

  return {
    answer:
      answer ||
      "Sensei, I found the document, but I could not produce a clear answer from its content.",
    confidence,
    referencedSections,
    suggestedFollowUps: finalSuggestedFollowUps,
    closingQuestion,
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

Always respond in English, no matter what language is used elsewhere.
This applies even if the document is written in Indonesian or another language, AND even if Sensei's question below is written in Indonesian or another language.
Do not mirror or switch to the language of the question or the document.
Do not switch language unless Sensei explicitly asks you to answer in a different language.
Translate any checklist items, study points, or quoted material into English before including them in your answer.

Answer only using the provided document context.
If the answer is not available in the context, say that clearly.
Do not invent facts, deadlines, requirements, or page numbers.
If the question asks for a checklist, create a practical checklist from the available context.
If the question asks what to study, explain the important study points.
If the question asks for an explanation, make it easier to understand.
Keep the tone calm, concise, and useful.

Important response rules:
- The "answer" field must only answer Sensei's question.
- The "answer" field must be written entirely in English, including any checklist items, lists, or translated quotes from the document.
- Do not include generic closing offers inside the "answer" field.
- Avoid conditional offer phrasing such as "if" + "you want", "if" + "you would like", "let" + "me know", or "I can also" — in English or in any other language (for example, do not use Indonesian equivalents like "kalau Sensei mau" or "biar saya bisa").
- Put the final next-action question only in "closingQuestion".
- "closingQuestion" must start with "Would you like me to".
- "closingQuestion" must end with "Sensei?"
- "closingQuestion" and "suggestedFollowUps" must also be written in English.
- If the document contains numbered questions, use a closingQuestion that asks whether Sensei wants you to answer them one by one.
- If the document is study material, use a closingQuestion that asks whether Sensei wants a study checklist or short cheat sheet.

Document name:
${document.originalName || "uploaded document"}

Question:
${cleanQuestion}

Document context:
${context}

Return valid JSON only with this structure:
{
  "answer": "clear answer in English with no generic closing offer",
  "confidence": "low | medium | high",
  "referencedSections": [1, 2],
  "suggestedFollowUps": [
    "Answer the questions one by one",
    "Make a short cheat sheet"
  ],
  "closingQuestion": "Would you like me to answer the questions one by one, Sensei?"
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
  const result = normalizeQaResult(parsed, rawText, cleanQuestion);

  const keywords = getQuestionKeywords(cleanQuestion);

  return {
    ...result,
    usedSections: selectedChunks.map((chunk) => ({
      section: chunk.index,
      start: chunk.start,
      end: chunk.end,
      score: scoreChunk(chunk, keywords),
    })),
  };
}

module.exports = {
  askDocumentQuestion,
};