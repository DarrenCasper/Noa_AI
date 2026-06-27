const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function safeJsonParse(text) {
  if (!text) {
    throw new Error("AI response is empty.");
  }

  let cleaned = text.trim();

  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json/i, "").replace(/```$/i, "").trim();
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```/i, "").replace(/```$/i, "").trim();
  }

  return JSON.parse(cleaned);
}

function clampText(text, maxLength = 18000) {
  if (!text) return "";

  if (text.length <= maxLength) return text;

  return text.slice(0, maxLength);
}

function normalizeCategory(value) {
  const allowed = ["homework", "coding", "appointment", "general"];
  return allowed.includes(value) ? value : "general";
}

function normalizePriority(value) {
  const allowed = ["low", "normal", "high", "urgent"];
  return allowed.includes(value) ? value : "normal";
}

function normalizeComplexity(value) {
  const allowed = ["unknown", "simple", "medium", "complex"];
  return allowed.includes(value) ? value : "unknown";
}

function normalizeSuggestedTask(task) {
  return {
    title: String(task.title || "").trim(),
    description: String(task.description || "").trim(),
    subject: String(task.subject || "").trim(),
    category: normalizeCategory(task.category),
    priority: normalizePriority(task.priority),
    complexity: normalizeComplexity(task.complexity),
    tags: Array.isArray(task.tags)
      ? task.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8)
      : [],
    dueDate: task.dueDate || null,
    confidence:
      typeof task.confidence === "number"
        ? Math.max(0, Math.min(task.confidence, 1))
        : 0,
  };
}

async function analyzeDocumentWithAi(document) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in .env");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const documentText = clampText(document.extractedText || "");

  if (!documentText.trim()) {
    throw new Error("Document has no extracted text to analyze.");
  }

  const prompt = `
You are Noa, a calm assistant for Sensei.

Analyze the document text below.

Return JSON only. Do not use markdown.

Schema:
{
  "summary": "short summary of the document",
  "documentType": "homework | lecture_note | schedule | announcement | general",
  "importantDates": [
    {
      "label": "what the date is for",
      "dateText": "original date text from document",
      "isoDate": "ISO 8601 date if clear, otherwise null"
    }
  ],
  "suggestedTasks": [
    {
      "title": "short task title",
      "description": "what Sensei needs to do",
      "subject": "subject or topic if available",
      "category": "homework | coding | appointment | general",
      "priority": "low | normal | high | urgent",
      "complexity": "unknown | simple | medium | complex",
      "tags": ["short", "tags"],
      "dueDate": "ISO 8601 date if clear, otherwise null",
      "confidence": 0.0
    }
  ],
  "questionsForSensei": [
    "short question if important details are missing"
  ]
}

Rules:
- Only suggest tasks that are actually supported by the document.
- Do not invent due dates.
- If the deadline date is unclear, use dueDate: null.
- If the document looks like homework/assignment, category should be "homework".
- If no task is found, return suggestedTasks: [].
- Keep summary concise.
- Use Asia/Jakarta timezone when interpreting dates if possible.

Document name:
${document.originalName}

Document text:
${documentText}
`;

  const response = await client.responses.create({
    model,
    input: prompt,
  });

  const outputText = response.output_text;

  const parsed = safeJsonParse(outputText);

  return {
    summary: String(parsed.summary || "").trim(),
    documentType: String(parsed.documentType || "general").trim(),
    importantDates: Array.isArray(parsed.importantDates)
      ? parsed.importantDates
      : [],
    suggestedTasks: Array.isArray(parsed.suggestedTasks)
      ? parsed.suggestedTasks
          .map(normalizeSuggestedTask)
          .filter((task) => task.title)
      : [],
    questionsForSensei: Array.isArray(parsed.questionsForSensei)
      ? parsed.questionsForSensei.map(String).filter(Boolean)
      : [],
    rawOutput: outputText,
  };
}

module.exports = {
  analyzeDocumentWithAi,
};