const mongoose = require("mongoose");

const pendingActionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },

    type: {
      type: String,
      required: true,
      enum: ["document_suggestion_confirmation"],
      index: true,
    },

    status: {
      type: String,
      enum: ["active", "resolved", "cancelled"],
      default: "active",
      index: true,
    },

    title: { type: String, default: "" },
    message: { type: String, default: "" },

    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      default: null,
      index: true,
    },

    suggestionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TaskSuggestion",
      },
    ],

    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    resolution: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

pendingActionSchema.index({ userId: 1, type: 1, status: 1, createdAt: -1 });
pendingActionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PendingAction", pendingActionSchema);