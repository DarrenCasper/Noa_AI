const express = require("express");

const Task = require("../models/Task");
const TaskSuggestion = require("../models/TaskSuggestion");

const router = express.Router();

function formatTask(task) {
  return {
    id: task._id,
    title: task.title,
    description: task.description,
    subject: task.subject,
    category: task.category,
    priority: task.priority,
    complexity: task.complexity,
    tags: task.tags,
    dueDate: task.dueDate,
    status: task.status,
    createdAt: task.createdAt,
  };
}

function formatSuggestion(suggestion) {
  return {
    id: suggestion._id,
    userId: suggestion.userId,
    documentId: suggestion.documentId,
    title: suggestion.title,
    description: suggestion.description,
    subject: suggestion.subject,
    category: suggestion.category,
    priority: suggestion.priority,
    complexity: suggestion.complexity,
    tags: suggestion.tags,
    dueDate: suggestion.dueDate,
    confidence: suggestion.confidence,
    similarTaskIds: suggestion.similarTaskIds,
    createdTaskId: suggestion.createdTaskId,
    status: suggestion.status,
    rejectionReason: suggestion.rejectionReason,
    createdAt: suggestion.createdAt,
    updatedAt: suggestion.updatedAt,
  };
}

router.get("/", async (req, res) => {
  try {
    const userId = req.query.userId || "main-whatsapp";
    const status = req.query.status || "pending";
    const limit = Math.min(Number(req.query.limit || 20), 50);

    const query = { userId };

    if (status !== "all") {
      query.status = status;
    }

    const suggestions = await TaskSuggestion.find(query)
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.json({
      count: suggestions.length,
      suggestions: suggestions.map(formatSuggestion),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to list task suggestions.",
      error: error.message,
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const suggestion = await TaskSuggestion.findById(req.params.id).populate(
      "similarTaskIds"
    );

    if (!suggestion) {
      return res.status(404).json({
        message: "Task suggestion not found.",
      });
    }

    return res.json({
      suggestion: {
        ...formatSuggestion(suggestion),
        similarTasks: suggestion.similarTaskIds.map(formatTask),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to read task suggestion.",
      error: error.message,
    });
  }
});

router.post("/:id/accept", async (req, res) => {
  try {
    const force = req.body.force === true;

    const suggestion = await TaskSuggestion.findById(req.params.id).populate(
      "similarTaskIds"
    );

    if (!suggestion) {
      return res.status(404).json({
        message: "Task suggestion not found.",
      });
    }

    if (suggestion.status !== "pending") {
      return res.status(400).json({
        message: `Suggestion is already ${suggestion.status}.`,
        suggestion: formatSuggestion(suggestion),
      });
    }

    const similarTasks = suggestion.similarTaskIds || [];

    if (similarTasks.length > 0 && !force) {
      return res.status(409).json({
        message:
          "This suggestion may be similar to an existing task. Send force=true if Sensei still wants to create it.",
        suggestion: formatSuggestion(suggestion),
        similarTasks: similarTasks.map(formatTask),
      });
    }

    const task = await Task.create({
      userId: suggestion.userId,
      title: suggestion.title,
      description: suggestion.description,
      subject: suggestion.subject,
      category: suggestion.category,
      priority: suggestion.priority,
      complexity: suggestion.complexity,
      tags: suggestion.tags,
      dueDate: suggestion.dueDate,
      source: "document_ai",
      reminderEnabled: true,
    });

    suggestion.status = "accepted";
    suggestion.createdTaskId = task._id;
    await suggestion.save();

    return res.status(201).json({
      message: "Task suggestion accepted and task created.",
      task: formatTask(task),
      suggestion: formatSuggestion(suggestion),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to accept task suggestion.",
      error: error.message,
    });
  }
});

router.post("/:id/reject", async (req, res) => {
  try {
    const suggestion = await TaskSuggestion.findById(req.params.id);

    if (!suggestion) {
      return res.status(404).json({
        message: "Task suggestion not found.",
      });
    }

    if (suggestion.status !== "pending") {
      return res.status(400).json({
        message: `Suggestion is already ${suggestion.status}.`,
        suggestion: formatSuggestion(suggestion),
      });
    }

    suggestion.status = "rejected";
    suggestion.rejectionReason = req.body.reason || "";
    await suggestion.save();

    return res.json({
      message: "Task suggestion rejected.",
      suggestion: formatSuggestion(suggestion),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to reject task suggestion.",
      error: error.message,
    });
  }
});

module.exports = router;