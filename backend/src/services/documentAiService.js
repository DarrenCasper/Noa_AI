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

Always respond in English.
Even if the document is written in Indonesian or another language, summarize and extract tasks in English.
Do not switch language unless Sensei explicitly asks.

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
- Always provide a useful summary, even if no task or deadline is found.
- If the document contains an assignment, project instruction, checklist, submission requirement, or homework instruction, suggest a task even when there is no deadline.
- If no deadline is found, set dueDate to null and make it clear through importantDates: [].
- If the document is only lecture notes, reading material, slides, or reference material, do not suggest a task unless there is an explicit assignment or action required.
- If the document looks useful for studying but has no explicit task, add a questionForSensei asking whether they want to create a study task.
- Never treat "no deadline found" as an error.
- If the document looks like homework/assignment, category should be "homework".
- If no task is found, return suggestedTasks: [].
- Keep summary concise.
- Use Asia/Jakarta timezone when interpreting dates if possible.
- If suggestedTasks has one item, questionsForSensei must include exactly one question asking whether Sensei wants to add that task to the task list.
- If suggestedTasks has more than one item, questionsForSensei must ask whether Sensei wants to add all tasks, add only a specific number, or ignore them.
- Do not ask whether Sensei wants a cleaner summary, academic summary, JSON output, or another formatting conversion.
- The next action must be about saving, ignoring, or reviewing task suggestions.

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