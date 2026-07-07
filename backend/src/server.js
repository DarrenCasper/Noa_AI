require("dotenv").config();

const express = require("express");
const cors = require("cors");

const connectDB = require("./db");
const taskRoutes = require("./routes/taskRoutes");
const documentRoutes = require("./routes/documentRoutes");
const taskSuggestionRoutes = require("./routes/taskSuggestionRoutes");
const pendingActionRoutes = require("./routes/pendingActionRoutes");
const { startReminderJob } = require("./jobs/reminderJob");
const browseRoutes = require("./routes/browseRoutes");

const app = express();
const PORT = process.env.PORT || 5050;

function isReminderJobEnabled() {
  return String(process.env.ENABLE_REMINDER_JOB || "true").toLowerCase() === "true";
}

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    message: "Noa backend is running",
  });
});

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.use("/api/tasks", taskRoutes);
app.use("/api/documents", documentRoutes);

// Preferred route
app.use("/api/task-suggestions", taskSuggestionRoutes);

// Legacy alias, keep this so older SKILL.md or tests do not break
// app.use("/api/task-suggestion", taskSuggestionRoutes);

app.use("/api/pending-actions", pendingActionRoutes);

app.use("/api/browse", browseRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found.",
  });
});

app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);

  res.status(error.status || 500).json({
    message: "Unexpected server error.",
    error: error.message,
  });
});

connectDB().then(() => {
  if (isReminderJobEnabled()) {
    startReminderJob();
  } else {
    console.log("Reminder job disabled by ENABLE_REMINDER_JOB=false");
  }

  app.listen(PORT, () => {
    console.log(`Noa backend running on http://localhost:${PORT}`);
  });
});