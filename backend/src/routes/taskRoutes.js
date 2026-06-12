const express = require("express");
const Task = require("../models/Task")

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { userId, title, description, category, dueDate } = req.body;

    if (!userId || !title) {
      return res.status(400).json({
        message: "userId and title are required",
      });
    }

    const task = await Task.create({
      userId,
      title,
      description,
      category,
      dueDate: dueDate ? new Date(dueDate) : null,
    });

    res.status(201).json({
      message: "Task created",
      task,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create task",
      error: error.message,
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const { userId, status = "active" } = req.query;

    if (!userId) {
      return res.status(400).json({
        message: "userId query is required",
      });
    }

    const tasks = await Task.find({
      userId,
      status,
    }).sort({ dueDate: 1, createdAt: -1 });

    res.json({
      count: tasks.length,
      tasks,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to get tasks",
      error: error.message,
    });
  }
});

router.patch("/:id/done", async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      {
        status: "completed",
        completedAt: new Date(),
      },
      { new: true }
    );

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    res.json({
      message: "Task marked as completed",
      task,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to complete task",
      error: error.message,
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    res.json({
      message: "Task deleted",
      task,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete task",
      error: error.message,
    });
  }
});

module.exports = router;