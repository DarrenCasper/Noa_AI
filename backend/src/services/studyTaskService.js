const path = require("path");

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value, maxLength = 700) {
  const text = normalizeText(value);

  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength).trim()}...`;
}

function titleCase(value) {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function cleanFileName(originalName = "") {
  const baseName = path.basename(
    originalName || "study-material",
    path.extname(originalName || "")
  );

  return normalizeText(baseName.replace(/[_-]+/g, " "));
}

function getKeywordScore(text, keywords) {
  const lower = String(text || "").toLowerCase();

  return keywords.reduce((score, keyword) => {
    return lower.includes(keyword.toLowerCase()) ? score + 1 : score;
  }, 0);
}

function extractTopicFromSummary(summary = "") {
  const clean = normalizeText(summary);

  if (!clean) return "";

  const patterns = [
    /about ([^.]{4,80})/i,
    /discusses ([^.]{4,80})/i,
    /explains ([^.]{4,80})/i,
    /covers ([^.]{4,80})/i,
    /material on ([^.]{4,80})/i,
    /notes on ([^.]{4,80})/i,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match?.[1]) {
      return normalizeText(match[1])
        .replace(/^(the|a|an)\s+/i, "")
        .replace(/\.$/, "");
    }
  }

  const firstSentence = clean.split(/[.!?]/)[0];

  if (firstSentence && firstSentence.length <= 90) {
    return firstSentence;
  }

  return "";
}

function getStudyTopic(document, analysis = {}) {
  const summaryTopic = extractTopicFromSummary(analysis.summary);

  if (summaryTopic) {
    return titleCase(summaryTopic);
  }

  const documentType = normalizeText(analysis.documentType);

  if (
    documentType &&
    !["unknown", "general", "document", "image"].includes(
      documentType.toLowerCase()
    )
  ) {
    return titleCase(documentType);
  }

  const fileTopic = cleanFileName(document.originalName);

  if (fileTopic) {
    return titleCase(fileTopic);
  }

  return "Uploaded Material";
}

function isLikelyStudyMaterial(document, analysis = {}) {
  const documentType = normalizeText(analysis.documentType);
  const summary = normalizeText(analysis.summary);
  const questions = Array.isArray(analysis.questionsForSensei)
    ? analysis.questionsForSensei.join(" ")
    : "";
  const textPreview = normalizeText(document.textPreview || "");
  const extractedTextSample = normalizeText(
    String(document.extractedText || "").slice(0, 2500)
  );

  const combined = [
    documentType,
    summary,
    questions,
    textPreview,
    extractedTextSample,
    document.originalName,
  ].join(" ");

  const studyKeywords = [
    "lecture",
    "notes",
    "slide",
    "slides",
    "chapter",
    "module",
    "materi",
    "pertemuan",
    "handout",
    "course",
    "class",
    "study",
    "exam",
    "quiz",
    "concept",
    "theory",
    "definition",
    "introduction",
    "overview",
    "lesson",
    "database",
    "networking",
    "robotics",
    "algorithm",
    "programming",
  ];

  const nonStudyKeywords = [
    "invoice",
    "receipt",
    "payment",
    "ticket",
    "boarding pass",
    "menu",
    "promotion",
    "advertisement",
    "random photo",
    "chat screenshot",
  ];

  const studyScore = getKeywordScore(combined, studyKeywords);
  const nonStudyScore = getKeywordScore(combined, nonStudyKeywords);

  if (nonStudyScore >= 2 && studyScore === 0) {
    return false;
  }

  if (studyScore >= 1) {
    return true;
  }

  const lowerType = documentType.toLowerCase();

  return (
    lowerType.includes("lecture") ||
    lowerType.includes("notes") ||
    lowerType.includes("study") ||
    lowerType.includes("slides") ||
    lowerType.includes("material")
  );
}

function buildStudyTaskPayload(document, analysis = {}) {
  const topic = getStudyTopic(document, analysis);

  const summary = normalizeText(analysis.summary);
  const originalName = document.originalName || "uploaded material";

  const descriptionParts = [];

  if (summary) {
    descriptionParts.push(`Study summary: ${summary}`);
  }

  descriptionParts.push(`Source file: ${originalName}`);

  const description = truncate(descriptionParts.join("\n\n"), 1200);

  const rawTagSource = `${topic} ${analysis.documentType || ""}`;
  const topicTags = rawTagSource
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .slice(0, 5);

  const tags = [...new Set(["study", ...topicTags])].slice(0, 8);

  return {
    title: `Study ${topic}`,
    description,
    subject: topic,
    category: "homework",
    priority: "normal",
    complexity: "unknown",
    tags,
    dueDate: null,
    source: "document_ai_study",
  };
}

module.exports = {
  isLikelyStudyMaterial,
  buildStudyTaskPayload,
};