require("dotenv").config();

const express = require("express");
const cors = require("cors");

const connectDB = require("./db");
const taskRoutes = require("./routes/taskRoutes");
const documentRoutes = require("./routes/documentRoutes")
const taskSuggestionRoutes = require("./routes/taskSuggestionRoutes")
const { startReminderJob } = require("./jobs/reminderJob");

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    message: "Noa backend is running",
  });
});

app.use("/api/tasks", taskRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/task-suggestion", taskSuggestionRoutes);

connectDB().then(() => {
  startReminderJob();

  app.listen(PORT, () => {
    console.log(`Noa backend running on http://localhost:${PORT}`);
  });
});