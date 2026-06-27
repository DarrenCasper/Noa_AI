const mongoose = require("mongoose");

const taskSuggestionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },

    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },

    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    subject: { type: String, default: "" },

    category: {
      type: String,
      enum: ["homework", "coding", "appointment", "general"],
      default: "general",
    },

    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },

    complexity: {
      type: String,
      enum: ["unknown", "simple", "medium", "complex"],
      default: "unknown",
    },

    tags: { type: [String], default: [] },
    dueDate: { type: Date, default: null },

    confidence: { type: Number, default: 0 },

    similarTaskIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Task",
      },
    ],

    createdTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      default: null,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
      index: true,
    },

    rejectionReason: { type: String, default: "" },

    source: {
      type: String,
      enum: ["document_ai"],
      default: "document_ai",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TaskSuggestion", taskSuggestionSchema);