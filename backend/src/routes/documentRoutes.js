const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const Document = require("../models/Document");
const Task = require("../models/Task");
const TaskSuggestion = require("../models/TaskSuggestion");

const {
  extractTextFromDocument,
  getTextPreview,
  getFileExtension,
} = require("../services/documentTextService");

const { analyzeDocumentWithAi } = require("../services/documentAiService");
const { findSimilarTasks } = require("../services/taskSimilarityService");

const router = express.Router();

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "documents");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const allowedExtensions = new Set([
  ".pdf",
  ".txt",
  ".md",
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
]);

const allowedMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function getExtensionFromMimeType(mimeType) {
  const map = {
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };

  return map[mimeType] || "";
}

function getSafeExtension(file) {
  const fromName = path.extname(file.originalname || "").toLowerCase();
  if (allowedExtensions.has(fromName)) return fromName;

  return getExtensionFromMimeType(file.mimetype || "");
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },

  filename: function (req, file, cb) {
    const extension = getSafeExtension(file) || ".bin";

    const safeBaseName = path
      .basename(file.originalname || "document", path.extname(file.originalname || ""))
      .replace(/[^a-zA-Z0-9-_]/g, "_")
      .slice(0, 80);

    const uniqueName = `${Date.now()}-${safeBaseName}${extension}`;

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
  fileFilter: function (req, file, cb) {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const mimeType = file.mimetype || "";

    const extensionAllowed = allowedExtensions.has(extension);
    const mimeAllowed = allowedMimeTypes.has(mimeType) || mimeType.startsWith("image/");

    if (!extensionAllowed && !mimeAllowed) {
      return cb(
        new Error(
          "Unsupported file type. Use PDF, TXT, MD, DOCX, JPG, JPEG, PNG, or WEBP."
        )
      );
    }

    cb(null, true);
  },
});

function getUserId(req) {
  return req.body.userId || req.query.userId || "main-whatsapp";
}

function formatDocument(document) {
  return {
    id: document._id,
    userId: document.userId,
    originalName: document.originalName,
    mimeType: document.mimeType,
    extension: document.extension,
    sizeBytes: document.sizeBytes,
    textLength: document.textLength,
    textPreview: document.textPreview,
    status: document.status,
    extractionError: document.extractionError,
    source: document.source,
    createdAt: document.createdAt,
  };
}

function formatSuggestionForResponse(savedSuggestion, similarItems) {
  return {
    id: savedSuggestion._id,
    title: savedSuggestion.title,
    description: savedSuggestion.description,
    subject: savedSuggestion.subject,
    category: savedSuggestion.category,
    priority: savedSuggestion.priority,
    complexity: savedSuggestion.complexity,
    tags: savedSuggestion.tags,
    dueDate: savedSuggestion.dueDate,
    confidence: savedSuggestion.confidence,
    status: savedSuggestion.status,
    similarTasks: similarItems.map((item) => ({
      id: item.task._id,
      title: item.task.title,
      dueDate: item.task.dueDate,
      description: item.task.description,
      similarityScore: Number(item.score.toFixed(2)),
    })),
  };
}

router.post("/upload", upload.single("document"), async (req, res) => {
  let savedDocument = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No document uploaded. Use form field name: document.",
      });
    }

    const userId = getUserId(req);
    const extension = getFileExtension(req.file);

    const extractedText = await extractTextFromDocument(req.file);
    const textPreview = getTextPreview(extractedText);

    savedDocument = await Document.create({
      userId,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      extension,
      sizeBytes: req.file.size,
      filePath: req.file.path,
      extractedText,
      textLength: extractedText.length,
      textPreview,
      status: "processed",
      extractionError: "",
      source: req.body.source || "upload",
    });

    return res.status(201).json({
      message: "Document uploaded and processed.",
      document: formatDocument(savedDocument),
    });
  } catch (error) {
    if (req.file) {
      try {
        savedDocument = await Document.create({
          userId: getUserId(req),
          originalName: req.file.originalname,
          storedName: req.file.filename,
          mimeType: req.file.mimetype,
          extension: getFileExtension(req.file),
          sizeBytes: req.file.size,
          filePath: req.file.path,
          extractedText: "",
          textLength: 0,
          textPreview: "",
          status: "failed",
          extractionError: error.message,
          source: req.body.source || "upload",
        });
      } catch (saveError) {
        console.error("Failed to save failed document record:", saveError.message);
      }
    }

    return res.status(400).json({
      message: "Document upload failed.",
      error: error.message,
      document: savedDocument ? formatDocument(savedDocument) : null,
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const userId = req.query.userId || "main-whatsapp";
    const limit = Math.min(Number(req.query.limit || 20), 50);

    const documents = await Document.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.json({
      count: documents.length,
      documents: documents.map(formatDocument),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to list documents.",
      error: error.message,
    });
  }
});

router.post("/:id/analyze", async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        message: "Document not found.",
      });
    }

    if (document.status !== "processed") {
      return res.status(400).json({
        message: "Document is not processed yet.",
        status: document.status,
        extractionError: document.extractionError,
      });
    }

    if (!document.extractedText || !document.extractedText.trim()) {
      return res.status(400).json({
        message:
          "Document has no extracted text. It may be a scanned PDF, unclear image, or unsupported file.",
      });
    }

    const analysis = await analyzeDocumentWithAi(document);

    const existingTasks = await Task.find({
      userId: document.userId,
      status: "active",
    }).sort({ createdAt: -1 });

    const savedSuggestions = [];

    for (const suggestedTask of analysis.suggestedTasks) {
      const similarItems = findSimilarTasks(suggestedTask, existingTasks);
      const similarTaskIds = similarItems.map((item) => item.task._id);

      const savedSuggestion = await TaskSuggestion.create({
        userId: document.userId,
        documentId: document._id,
        title: suggestedTask.title,
        description: suggestedTask.description,
        subject: suggestedTask.subject,
        category: suggestedTask.category,
        priority: suggestedTask.priority,
        complexity: suggestedTask.complexity,
        tags: suggestedTask.tags,
        dueDate: suggestedTask.dueDate,
        confidence: suggestedTask.confidence,
        similarTaskIds,
        status: "pending",
      });

      savedSuggestions.push(
        formatSuggestionForResponse(savedSuggestion, similarItems)
      );
    }

    return res.json({
      message: "Document analyzed.",
      document: formatDocument(document),
      analysis: {
        summary: analysis.summary,
        documentType: analysis.documentType,
        importantDates: analysis.importantDates,
        questionsForSensei: analysis.questionsForSensei,
      },
      suggestions: savedSuggestions,
    });
  } catch (error) {
    console.error("Document analysis failed:", error);

    return res.status(500).json({
      message: "Document analysis failed.",
      error: error.message,
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({
        message: "Document not found.",
      });
    }

    return res.json({
      document: {
        ...formatDocument(document),
        extractedText: document.extractedText,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to read document.",
      error: error.message,
    });
  }
});

module.exports = router;