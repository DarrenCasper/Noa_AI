const mongoose = require("mongoose");

const reminderLogSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },

        taskId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Task",
            default: null,
            index: true,
        },

        type: {
            type: String,
            required: true,
            enum: [
                "morning_briefing",
                "deadline_7d",
                "deadline_5d",
                "deadline_3d",
                "deadline_1d",
                "deadline_3h",
                "deadline_1h",
                "overdue_noon",
                "overdue_evening",
                "missing_details_6h",
                "priority_attention_6h",
            ],
            index: true,
        },

        dateKey: {
            type: String,
            required: true,
            index: true,
        },

        status: {
            type: String,
            enum: ["sent", "failed"],
            default: "sent",
        },

        message: {
            type: String,
            default: "",
        },

        error: {
            type: String,
            default: "",
        },

        sentAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

reminderLogSchema.index(
    {
        userId: 1,
        taskId: 1,
        type: 1,
        dateKey: 1,
    },
    {
        unique: true,
    }
);

module.exports = mongoose.model("ReminderLog", reminderLogSchema);