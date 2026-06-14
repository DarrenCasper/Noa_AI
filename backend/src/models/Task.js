const mongoose = require("mongoose");
const crypto = require("crypto");

const taskSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },

    taskCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    subject: {
      type: String,
      default: "",
      trim: true,
    },

    tags: {
      type: [String],
      default: [],
    },

    detailsStatus: {
      type: String,
      enum: ["missing", "partial", "filled"],
      default: "missing",
    },

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

    estimatedMinutes: {
      type: Number,
      default: null,
      min: 0,
    },

    dueDate: {
      type: Date,
      default: null,
    },

    plannedFor: {
      type: Date,
      default: null,
      index: true,
    },

    plannedAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "completed"],
      default: "active",
    },

    completedAt: {
      type: Date,
      default: null,
    },

    source: {
      type: String,
      default: "whatsapp",
    },

    reminderEnabled: {
      type: Boolean,
      default: true,
    },

    reminderAt: {
      type: Date,
      default: null,
    },

    reminderSent: {
      type: Boolean,
      default: false,
    },

    reminderSentAt: {
      type: Date,
      default: null,
    },

    lastReminderError: {
      type: String,
      default: "",
    },

  },
  {
    timestamps: true,
  }
);

taskSchema.pre("validate", function () {
  if (!this.taskCode) {
    const code = crypto.randomBytes(3).toString("hex").toUpperCase();
    this.taskCode = `NOA-${code}`;
  }

  const hasDescription = this.description && this.description.trim() !== "";
  const hasSubject = this.subject && this.subject.trim() !== "";
  const hasTags = Array.isArray(this.tags) && this.tags.length > 0;

  if (!hasDescription && !hasSubject && !hasTags) {
    this.detailsStatus = "missing";
  } else if (hasDescription && hasSubject) {
    this.detailsStatus = "filled";
  } else {
    this.detailsStatus = "partial";
  }

  if (!this.reminderAt && this.dueDate) {
    this.reminderAt = this.dueDate;
  }
});

module.exports = mongoose.model("Task", taskSchema);
