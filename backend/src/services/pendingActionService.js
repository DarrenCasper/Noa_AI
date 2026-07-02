const PendingAction = require("../models/PendingAction");

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function getPendingActionTtlMinutes() {
  return Number(process.env.PENDING_ACTION_TTL_MINUTES || 30);
}

function formatPendingAction(pendingAction) {
  if (!pendingAction) return null;

  return {
    id: pendingAction._id,
    userId: pendingAction.userId,
    type: pendingAction.type,
    status: pendingAction.status,
    title: pendingAction.title,
    message: pendingAction.message,
    documentId: pendingAction.documentId,
    suggestionIds: pendingAction.suggestionIds,
    payload: pendingAction.payload,
    expiresAt: pendingAction.expiresAt,
    createdAt: pendingAction.createdAt,
    updatedAt: pendingAction.updatedAt,
  };
}

async function cancelActivePendingActions(userId, type = null) {
  const query = {
    userId,
    status: "active",
  };

  if (type) {
    query.type = type;
  }

  await PendingAction.updateMany(query, {
    $set: {
      status: "cancelled",
      resolvedAt: new Date(),
      resolution: {
        reason: "Replaced by a newer pending action.",
      },
    },
  });
}

async function createDocumentSuggestionPendingAction({
  userId,
  documentId,
  suggestions,
  ttlMinutes = getPendingActionTtlMinutes(),
}) {
  await cancelActivePendingActions(userId);

  const suggestionIds = suggestions.map((suggestion) => suggestion._id);

  const options = suggestions.map((suggestion, index) => ({
    number: index + 1,
    suggestionId: suggestion._id,
    title: suggestion.title,
    description: suggestion.description,
    dueDate: suggestion.dueDate,
    priority: suggestion.priority,
    confidence: suggestion.confidence,
  }));

  return PendingAction.create({
    userId,
    type: "document_suggestion_confirmation",
    status: "active",
    title: "Document task suggestion confirmation",
    message:
      "Sensei has pending task suggestions from the latest document/image analysis.",
    documentId,
    suggestionIds,
    payload: {
      options,
    },
    expiresAt: addMinutes(new Date(), ttlMinutes),
  });
}

async function createStudyTaskPendingAction({
  userId,
  documentId,
  studyTask,
  analysis,
  ttlMinutes = getPendingActionTtlMinutes(),
}) {
  await cancelActivePendingActions(userId);

  return PendingAction.create({
    userId,
    type: "study_task_confirmation",
    status: "active",
    title: "Study task confirmation",
    message:
      "Sensei has a pending study task suggestion from the latest document/image analysis.",
    documentId,
    suggestionIds: [],
    payload: {
      studyTask,
      analysis: {
        summary: analysis?.summary || "",
        documentType: analysis?.documentType || "",
        importantDates: analysis?.importantDates || [],
      },
    },
    expiresAt: addMinutes(new Date(), ttlMinutes),
  });
}

async function getCurrentPendingAction({
  userId,
  type = null,
  populateSuggestions = true,
}) {
  const query = {
    userId,
    status: "active",
    expiresAt: { $gt: new Date() },
  };

  if (type) {
    query.type = type;
  }

  let pendingActionQuery = PendingAction.findOne(query).sort({ createdAt: -1 });

  if (populateSuggestions) {
    pendingActionQuery = pendingActionQuery.populate({
      path: "suggestionIds",
      populate: {
        path: "similarTaskIds",
      },
    });
  }

  return pendingActionQuery;
}

module.exports = {
  createDocumentSuggestionPendingAction,
  createStudyTaskPendingAction,
  getCurrentPendingAction,
  formatPendingAction,
  cancelActivePendingActions,
};