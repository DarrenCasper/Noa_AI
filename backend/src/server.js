require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./db");
const taskRoutes = require("./routes/taskRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Noa Assistant Backend is running",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "noa-assistant-backend",
  });
});

app.use("/api/tasks", taskRoutes);

const PORT = process.env.PORT || 5050;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Noa backend running on http://localhost:${PORT}`);
  });
});