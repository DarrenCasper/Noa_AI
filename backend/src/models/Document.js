const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },

    originalName: { type: String, required: true },
    storedName: { type: String, required: true },
    mimeType: { type: String, default: "" },
    extension: { type: String, default: "" },
    sizeBytes: { type: Number, default: 0 },

    filePath: { type: String, required: true },

    extractedText: { type: String, default: "" },
    textLength: { type: Number, default: 0 },
    textPreview: { type: String, default: "" },

    status: {
      type: String,
      enum: ["processed", "failed"],
      default: "processed",
    },

    extractionError: { type: String, default: "" },

    source: {
      type: String,
      enum: ["upload", "whatsapp", "manual"],
      default: "upload",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", documentSchema);