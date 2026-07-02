const express = require("express");

const PendingAction = require("../models/PendingAction");
const Task = require("../models/Task");

const {
  getCurrentPendingAction,
  formatPendingAction,
} = require("../services/pendingActionService");

const router = express.Router();

function getUserId(req) {
  return req.body.userId || req.query.userId || "main-whatsapp";
}

function normalizeAction(value) {
  const action = String(value || "").toLowerCase().trim();

  if (["accept", "add", "create", "save"].includes(action)) {
    return "accept";
  }

  if (["reject", "ignore", "skip", "dismiss", "cancel"].includes(action)) {
    return "reject";
  }

  return "";
}

function normalizeSelection(selection, count) {
  if (count <= 0) {
    throw new Error("There are no suggestions to select.");
  }

  if (selection === undefined || selection === null || selection === "") {
    if (count === 1) return [1];

    throw new Error(
      "Please specify which suggestion to use, for example selection: [1] or selection: \"all\"."
    );
  }

  if (typeof selection === "string") {
    const lower = selection.toLowerCase().trim();

    if (["all", "both", "everything"].includes(lower)) {
      return Array.from({ length: count }, (_, index) => index + 1);
    }

    const numbers = lower.match(/\d+/g);

    if (!numbers || numbers.length === 0) {
      throw new Error("Could not understand the selected suggestion number.");
    }

    return [...new Set(numbers.map(Number))];
  }

  if (typeof selection === "number") {
    return [selection];
  }

  if (Array.isArray(selection)) {
    return [...new Set(selection.map(Number))];
  }

  throw new Error("Invalid selection format.");
}

function validateSelection(numbers, count) {
  for (const number of numbers) {
    if (!Number.isInteger(number) || number < 1 || number > count) {
      throw new Error(
        `Invalid selection number ${number}. Available range is 1-${count}.`
      );
    }
  }

  return numbers;
}

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

function formatSuggestion(suggestion, number = null) {
  return {
    number,
    id: suggestion._id,
    title: suggestion.title,
    description: suggestion.description,
    subject: suggestion.subject,
    category: suggestion.category,
    priority: suggestion.priority,
    complexity: suggestion.complexity,
    tags: suggestion.tags,
    dueDate: suggestion.dueDate,
    confidence: suggestion.confidence,
    status: suggestion.status,
    similarTasks: Array.isArray(suggestion.similarTaskIds)
      ? suggestion.similarTaskIds.map((task) => ({
          id: task._id,
          title: task.title,
          description: task.description,
          dueDate: task.dueDate,
          status: task.status,
        }))
      : [],
  };
}

async function markPendingActionResolvedIfDone(pendingAction) {
  const refreshed = await PendingAction.findById(pendingAction._id).populate(
    "suggestionIds"
  );

  if (!refreshed) return null;

  const stillPending = refreshed.suggestionIds.some(
    (suggestion) => suggestion.status === "pending"
  );

  if (!stillPending) {
    refreshed.status = "resolved";
    refreshed.resolvedAt = new Date();
    refreshed.resolution = {
      reason: "All selected suggestions have been handled.",
    };
    await refreshed.save();
  }

  return refreshed;
}

async function createTaskFromSuggestion(suggestion) {
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

  return task;
}

router.get("/current", async (req, res) => {
  try {
    const userId = getUserId(req);
    const type =
      req.query.type || req.body?.type || "document_suggestion_confirmation";

    const pendingAction = await getCurrentPendingAction({ userId, type });

    if (!pendingAction) {
      return res.status(404).json({
        message: "No active pending action found.",
      });
    }

    const suggestions = pendingAction.suggestionIds || [];

    return res.json({
      message: "Current pending action found.",
      pendingAction: formatPendingAction(pendingAction),
      suggestions: suggestions.map((suggestion, index) =>
        formatSuggestion(suggestion, index + 1)
      ),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to get current pending action.",
      error: error.message,
    });
  }
});

router.post("/current/resolve", async (req, res) => {
  try {
    const userId = getUserId(req);
    const type = req.body.type || "document_suggestion_confirmation";
    const action = normalizeAction(req.body.action);
    const force = req.body.force === true;
    const reason = req.body.reason || "";

    if (!action) {
      return res.status(400).json({
        message:
          "Invalid action. Use action: accept/add/save or reject/ignore/skip.",
      });
    }

    const pendingAction = await getCurrentPendingAction({ userId, type });

    if (!pendingAction) {
      return res.status(404).json({
        message: "No active pending action found.",
      });
    }

    const suggestions = pendingAction.suggestionIds || [];

    if (suggestions.length === 0) {
      pendingAction.status = "resolved";
      pendingAction.resolvedAt = new Date();
      pendingAction.resolution = {
        reason: "Pending action had no suggestions.",
      };
      await pendingAction.save();

      return res.status(410).json({
        message: "This pending action has no suggestions left.",
        pendingAction: formatPendingAction(pendingAction),
      });
    }

    const selectedNumbers = validateSelection(
      normalizeSelection(req.body.selection, suggestions.length),
      suggestions.length
    );

    const selectedItems = selectedNumbers.map((number) => ({
      number,
      suggestion: suggestions[number - 1],
    }));

    const inactiveSelections = selectedItems.filter(
      (item) => item.suggestion.status !== "pending"
    );

    const activeSelections = selectedItems.filter(
      (item) => item.suggestion.status === "pending"
    );

    if (activeSelections.length === 0) {
      await markPendingActionResolvedIfDone(pendingAction);

      return res.status(409).json({
        message: "Selected suggestions are already handled.",
        inactiveSelections: inactiveSelections.map((item) =>
          formatSuggestion(item.suggestion, item.number)
        ),
      });
    }

    if (action === "accept") {
      const conflicts = activeSelections.filter((item) => {
        const similarTasks = item.suggestion.similarTaskIds || [];
        return similarTasks.length > 0;
      });

      if (conflicts.length > 0 && !force) {
        return res.status(409).json({
          message:
            "One or more selected suggestions may duplicate existing tasks. Send force=true to create anyway.",
          conflicts: conflicts.map((item) =>
            formatSuggestion(item.suggestion, item.number)
          ),
          pendingAction: formatPendingAction(pendingAction),
        });
      }

      const createdTasks = [];

      for (const item of activeSelections) {
        const task = await createTaskFromSuggestion(item.suggestion);

        createdTasks.push({
          number: item.number,
          task: formatTask(task),
        });
      }

      const refreshedPendingAction = await markPendingActionResolvedIfDone(
        pendingAction
      );

      return res.status(201).json({
        message: "Selected suggestions accepted and tasks created.",
        createdTasks,
        skipped: inactiveSelections.map((item) =>
          formatSuggestion(item.suggestion, item.number)
        ),
        pendingAction: formatPendingAction(refreshedPendingAction),
      });
    }

    if (action === "reject") {
      const rejectedSuggestions = [];

      for (const item of activeSelections) {
        item.suggestion.status = "rejected";
        item.suggestion.rejectionReason = reason || "Rejected by Sensei.";
        await item.suggestion.save();

        rejectedSuggestions.push(formatSuggestion(item.suggestion, item.number));
      }

      const refreshedPendingAction = await markPendingActionResolvedIfDone(
        pendingAction
      );

      return res.json({
        message: "Selected suggestions rejected.",
        rejectedSuggestions,
        skipped: inactiveSelections.map((item) =>
          formatSuggestion(item.suggestion, item.number)
        ),
        pendingAction: formatPendingAction(refreshedPendingAction),
      });
    }

    return res.status(400).json({
      message: "Unsupported action.",
    });
  } catch (error) {
    return res.status(400).json({
      message: "Failed to resolve pending action.",
      error: error.message,
    });
  }
});

module.exports = router;