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

function truncate(value, maxLength = 16000) {
  const text = normalizeText(value);
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength).trim()}\n\n[Text truncated for checklist generation]`;
}

function normalizeDueDate(value) {
  if (!value) return null;

  const text = String(value).trim();

  if (
    text.toLowerCase() === "null" ||
    text.toLowerCase() === "not set" ||
    text.toLowerCase() === "no clear deadline found" ||
    text.toLowerCase() === "unknown"
  ) {
    return null;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function cleanTags(tags) {
  if (!Array.isArray(tags)) return [];

  return [
    ...new Set(
      tags
        .map((tag) =>
          String(tag || "")
            .toLowerCase()
            .replace(/[^a-z0-9-_\s]/g, "")
            .trim()
        )
        .filter(Boolean)
        .slice(0, 8)
    ),
  ];
}

function normalizeChecklistItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, index) => ({
      title: normalizeText(item.title).slice(0, 160),
      description: normalizeText(item.description).slice(0, 400),
      order: Number(item.order || index + 1),
      status: "pending",
      source: "document_ai_checklist",
    }))
    .filter((item) => item.title)
    .slice(0, 15)
    .map((item, index) => ({
      ...item,
      order: index + 1,
    }));
}

function removeGenericClosing(value) {
  const text = normalizeText(value);

  if (!text) return "";

  const forbiddenPatterns = [
    /\bif\s+you\s+want\b/i,
    /\bif\s+you(?:'|’)d\s+like\b/i,
    /\bif\s+you\s+would\s+like\b/i,
    /\blet\s+me\s+know\b/i,
    /\bi\s+can\s+also\b/i,
    /\bi\s+can\s+help\s+further\b/i,
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

function buildDefaultNextActionQuestion(result) {
  if (result?.isActionableAssignment) {
    return "Would you like me to create this task with the checklist, Sensei?";
  }

  return "Would you like me to create a study task instead, Sensei?";
}

function normalizeNextActionQuestion(value, result) {
  const text = normalizeText(value);

  const forbiddenPattern =
    /\bif\s+you\s+want\b|\bif\s+you(?:'|’)d\s+like\b|\bif\s+you\s+would\s+like\b|\blet\s+me\s+know\b|\bi\s+can\s+also\b/i;

  if (!text || forbiddenPattern.test(text)) {
    return buildDefaultNextActionQuestion(result);
  }

  if (!text.toLowerCase().startsWith("would you like me to")) {
    return buildDefaultNextActionQuestion(result);
  }

  if (!text.toLowerCase().includes("sensei")) {
    return `${text.replace(/[?.!]*$/, "")}, Sensei?`;
  }

  return text.replace(/[!.]*$/, "?");
}

function normalizeChecklistResult(parsed, document) {
  const mainTask = parsed?.mainTask || {};
  const checklistItems = normalizeChecklistItems(parsed?.checklistItems);

  const isActionableAssignment = Boolean(parsed?.isActionableAssignment);

  const title =
    normalizeText(mainTask.title) ||
    `Complete ${document.originalName || "uploaded assignment"}`;

  const description =
    normalizeText(mainTask.description) ||
    normalizeText(parsed?.summary) ||
    `Complete the assignment based on ${document.originalName || "the uploaded file"}.`;

  const result = {
    isActionableAssignment,
    summary: removeGenericClosing(parsed?.summary),
    reason: removeGenericClosing(parsed?.reason),
    nonActionableReason: removeGenericClosing(parsed?.nonActionableReason),
    mainTask: {
      title: title.slice(0, 180),
      description: description.slice(0, 1200),
      subject: normalizeText(mainTask.subject).slice(0, 120),
      category: ["homework", "coding", "appointment", "general"].includes(
        mainTask.category
      )
        ? mainTask.category
        : "homework",
      priority: ["low", "normal", "high", "urgent"].includes(mainTask.priority)
        ? mainTask.priority
        : "normal",
      complexity: ["unknown", "simple", "medium", "complex"].includes(
        mainTask.complexity
      )
        ? mainTask.complexity
        : "medium",
      tags: cleanTags(mainTask.tags),
      dueDate: normalizeDueDate(mainTask.dueDate),
      source: "document_ai_checklist",
    },
    checklistItems: isActionableAssignment ? checklistItems : [],
  };

  return {
    ...result,
    nextActionQuestion: normalizeNextActionQuestion(
      parsed?.nextActionQuestion,
      result
    ),
  };
}

async function generateAssignmentChecklist(document) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in .env");
  }

  if (!document.extractedText || !document.extractedText.trim()) {
    throw new Error("Document has no extracted text to build a checklist from.");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const context = truncate(document.extractedText);

  const prompt = `
You are Noa, Sensei's calm academic assistant.

Always respond in English.
Even if the document or image is written in Indonesian or another language, write the summary, reason, mainTask fields, checklist items, and nextActionQuestion in English.
Do not switch language unless Sensei explicitly asks for it.
Do not copy the document's original language into any output field.

Your job:
Analyze the uploaded document/image text and decide whether it contains an actionable assignment that can be turned into a task checklist.

STRICT ACTIONABILITY RULES:
Set "isActionableAssignment": true ONLY if the file clearly contains at least one of these:
1. Assignment instructions
2. Homework instructions
3. Project requirements
4. Report or submission requirements
5. Lab/practicum task instructions
6. Worksheet/exercise questions that Sensei is expected to answer
7. Exam/task questions that Sensei is expected to solve
8. A clear to-do/task list

Set "isActionableAssignment": false if the file is only:
1. Lecture notes
2. Study material
3. Theory explanation
4. Reading material
5. Slides without a required task
6. Reference material
7. General announcement with no required action
8. Random chat/image content with no clear task

IMPORTANT QUESTION RULE:
Do not treat every question mark as an assignment.
Only treat questions as actionable if they are clearly exercise questions, assignment questions, worksheet questions, exam questions, or task questions that Sensei is expected to answer.

DEADLINE RULES:
- Do not invent deadlines.
- If no clear deadline exists, use null for dueDate.
- If the date is ambiguous or incomplete, use null and mention uncertainty in "reason".
- Only use an ISO date string if the deadline is clearly stated.

CHECKLIST RULES:
- If actionable, create practical checklist items that help Sensei finish the assignment.
- Checklist items must be small, concrete, and actionable.
- Prefer 5 to 10 checklist items.
- Maximum 15 checklist items.
- Do not create vague items like "Do the assignment" or "Finish everything".
- Do not include generic motivational steps.
- Do not include steps that are not supported by the document.
- If the document has numbered questions, make checklist items that match answering or preparing those questions.
- If the document requires a report, include outline, writing, reviewing, and submitting steps only if supported by the document.

OUTPUT STYLE RULES:
- Return valid JSON only.
- Do not include Markdown outside JSON.
- Do not include generic closing phrases.
- Do not use "If you want", "I can also", or "Let me know".
- Put the final confirmation question only in "nextActionQuestion".
- "nextActionQuestion" must start with "Would you like me to".
- "nextActionQuestion" must end with "Sensei?"
- Every text field in the JSON output (summary, reason, nonActionableReason, mainTask.title, mainTask.description, mainTask.subject, checklistItems[].title, checklistItems[].description, nextActionQuestion) must be written in English, regardless of the document's original language.

Document name:
${document.originalName || "uploaded file"}

Extracted text:
${context}

Return JSON only using exactly this structure:
{
  "isActionableAssignment": true,
  "summary": "short summary of what the file contains",
  "reason": "short reason why this is or is not actionable",
  "nonActionableReason": "if not actionable, explain why; otherwise empty string",
  "mainTask": {
    "title": "main task title",
    "description": "short task description",
    "subject": "subject or topic",
    "category": "homework | coding | appointment | general",
    "priority": "low | normal | high | urgent",
    "complexity": "unknown | simple | medium | complex",
    "tags": ["tag1", "tag2"],
    "dueDate": "ISO date string or null"
  },
  "checklistItems": [
    {
      "title": "concrete checklist item title",
      "description": "short explanation",
      "order": 1
    }
  ],
  "nextActionQuestion": "Would you like me to create this task with the checklist, Sensei?"
}

If the file is not actionable, return:
{
  "isActionableAssignment": false,
  "summary": "short summary of the material",
  "reason": "this is not actionable because ...",
  "nonActionableReason": "lecture notes / study material / no required submission / no task found",
  "mainTask": {
    "title": "",
    "description": "",
    "subject": "",
    "category": "homework",
    "priority": "normal",
    "complexity": "unknown",
    "tags": [],
    "dueDate": null
  },
  "checklistItems": [],
  "nextActionQuestion": "Would you like me to create a study task instead, Sensei?"
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

  if (!parsed) {
    throw new Error("Could not parse checklist JSON from AI response.");
  }

  const result = normalizeChecklistResult(parsed, document);

  if (result.isActionableAssignment && result.checklistItems.length === 0) {
    throw new Error("Checklist generation produced no checklist items.");
  }

  return result;
}

module.exports = {
  generateAssignmentChecklist,
};