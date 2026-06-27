const fs = require("fs/promises");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

function normalizeText(text) {
  if (!text) return "";

  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getTextPreview(text, maxLength = 800) {
  if (!text) return "";
  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength).trim()}...`;
}

function getFileExtension(file) {
  const originalName = file.originalname || "";
  const filePath = file.path || "";

  const fromOriginalName = path.extname(originalName).toLowerCase();
  if (fromOriginalName) return fromOriginalName;

  return path.extname(filePath).toLowerCase();
}

async function extractTextFromTxtLike(file) {
  const text = await fs.readFile(file.path, "utf8");
  return normalizeText(text);
}

async function extractTextFromPdf(file) {
  const buffer = await fs.readFile(file.path);
  const result = await pdfParse(buffer);

  return normalizeText(result.text || "");
}

async function extractTextFromDocx(file) {
  const result = await mammoth.extractRawText({ path: file.path });

  return normalizeText(result.value || "");
}

async function extractTextFromDocument(file) {
  const extension = getFileExtension(file);
  const mimeType = file.mimetype || "";

  if (
    extension === ".txt" ||
    extension === ".md" ||
    mimeType === "text/plain" ||
    mimeType === "text/markdown"
  ) {
    return extractTextFromTxtLike(file);
  }

  if (extension === ".pdf" || mimeType === "application/pdf") {
    return extractTextFromPdf(file);
  }

  if (
    extension === ".docx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractTextFromDocx(file);
  }

  throw new Error("Unsupported file type. Supported types: PDF, TXT, MD, DOCX.");
}

module.exports = {
  extractTextFromDocument,
  getTextPreview,
  getFileExtension,
  normalizeText,
};