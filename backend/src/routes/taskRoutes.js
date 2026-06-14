const express = require("express");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const Task = require("../models/Task");

dayjs.extend(utc);
dayjs.extend(timezone);

const APP_TZ = process.env.APP_TZ || "Asia/Jakarta";
const router = express.Router();

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTags(tags) {
  if (!tags) return [];

  if (Array.isArray(tags)) {
    return tags.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
}

function requireUserIdFromQuery(req, res) {
  const { userId } = req.query;

  if (!userId) {
    res.status(400).json({
      message: "userId query is required",
    });
    return null;
  }

  return userId;
}

function requireUserIdFromBody(req, res) {
  const { userId } = req.body;

  if (!userId) {
    res.status(400).json({
      message: "userId body field is required",
    });
    return null;
  }

  return userId;
}

function getTodayRange() {
  const now = dayjs().tz(APP_TZ);
  const todayStart = now.startOf("day");
  const todayEnd = todayStart.add(1, "day");

  return {
    now,
    todayStart,
    todayEnd,
  };
}

function getDueDateLocal(task) {
  return task.dueDate
    ? dayjs(task.dueDate).tz(APP_TZ).format("ddd, DD MMM YYYY HH:mm")
    : null;
}

function getPlannedForLocal(task) {
  return task.plannedFor
    ? dayjs(task.plannedFor).tz(APP_TZ).format("ddd, DD MMM YYYY")
    : null;
}

function getDetailsText(task) {
  if (task.description && task.description.trim()) {
    return task.description.trim();
  }

  return "not filled yet";
}

function calculatePriority(task, now = dayjs().tz(APP_TZ)) {
  let score = 0;
  const reasons = [];

  if (task.priority === "urgent") {
    score += 40;
    reasons.push("marked urgent");
  } else if (task.priority === "high") {
    score += 25;
    reasons.push("marked high priority");
  } else if (task.priority === "low") {
    score -= 10;
    reasons.push("marked low priority");
  }

  if (task.dueDate) {
    const due = dayjs(task.dueDate).tz(APP_TZ);
    const hoursUntilDue = due.diff(now, "hour", true);

    if (hoursUntilDue < 0) {
      score += 120;
      reasons.push("overdue");
    } else if (hoursUntilDue <= 12) {
      score += 100;
      reasons.push("due within 12 hours");
    } else if (hoursUntilDue <= 24) {
      score += 85;
      reasons.push("due within 24 hours");
    } else if (hoursUntilDue <= 48) {
      score += 70;
      reasons.push("due within 2 days");
    } else if (hoursUntilDue <= 7 * 24) {
      score += 50;
      reasons.push("due this week");
    } else {
      score += 20;
      reasons.push("future deadline");
    }
  } else {
    score += 5;
    reasons.push("no due date");
  }

  if (task.complexity === "complex") {
    score += 25;
    reasons.push("complex task");
  } else if (task.complexity === "medium") {
    score += 15;
    reasons.push("medium complexity");
  } else if (task.complexity === "unknown") {
    const textLength = `${task.title || ""} ${task.description || ""}`.length;
    const tagCount = Array.isArray(task.tags) ? task.tags.length : 0;

    if (textLength > 120 || tagCount >= 3) {
      score += 15;
      reasons.push("appears complex");
    } else if (task.category === "homework" || task.category === "coding") {
      score += 8;
      reasons.push("may need focus");
    }
  }

  if (task.detailsStatus === "missing") {
    score += 8;
    reasons.push("details missing");
  }

  if (task.category === "appointment") {
    score += 20;
    reasons.push("appointment");
  } else if (task.category === "homework") {
    score += 12;
    reasons.push("homework");
  } else if (task.category === "coding") {
    score += 10;
    reasons.push("coding task");
  }

  let priorityLabel = "normal";

  if (score >= 110) {
    priorityLabel = "urgent";
  } else if (score >= 75) {
    priorityLabel = "high";
  } else if (score >= 40) {
    priorityLabel = "medium";
  } else {
    priorityLabel = "low";
  }

  return {
    score: Math.round(score),
    label: priorityLabel,
    reasons,
  };
}

function formatTask(task, options = {}) {
  const priorityInfo = calculatePriority(task);

  const base = {
    _id: task._id,
    taskCode: task.taskCode,
    title: task.title,
    description: task.description,
    details: getDetailsText(task),
    subject: task.subject,
    category: task.category,
    tags: task.tags,
    priority: task.priority,
    complexity: task.complexity,
    estimatedMinutes: task.estimatedMinutes,
    dueDate: task.dueDate,
    dueDateLocal: getDueDateLocal(task),
    plannedFor: task.plannedFor,
    plannedForLocal: getPlannedForLocal(task),
    detailsStatus: task.detailsStatus,
    status: task.status,
    completedAt: task.completedAt,
    reminderEnabled: task.reminderEnabled,
    reminderAt: task.reminderAt,
    reminderSent: task.reminderSent,
    reminderSentAt: task.reminderSentAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };

  if (options.includePriority !== false) {
    base.priorityAnalysis = priorityInfo;
  }

  return base;
}

async function getActiveTasksForUser(userId) {
  return Task.find({
    userId,
    status: "active",
  }).sort({ dueDate: 1, createdAt: -1 });
}

function sortByPriority(tasks, now = dayjs().tz(APP_TZ)) {
  return [...tasks].sort((a, b) => {
    const priorityA = calculatePriority(a, now).score;
    const priorityB = calculatePriority(b, now).score;

    if (priorityB !== priorityA) return priorityB - priorityA;

    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate) - new Date(b.dueDate);
    }

    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;

    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function buildPriorityBriefing(tasks, limit = 4) {
  const now = dayjs().tz(APP_TZ);
  const sorted = sortByPriority(tasks, now);
  const priorityTasks = sorted.slice(0, limit);

  const overdue = tasks.filter((task) => {
    return task.dueDate && dayjs(task.dueDate).tz(APP_TZ).isBefore(now);
  });

  const today = tasks.filter((task) => {
    if (!task.dueDate) return false;
    const due = dayjs(task.dueDate).tz(APP_TZ);
    return due.isSame(now, "day") && due.isAfter(now);
  });

  const upcoming = tasks.filter((task) => {
    if (!task.dueDate) return false;
    const due = dayjs(task.dueDate).tz(APP_TZ);
    return due.isAfter(now.endOf("day")) && due.isBefore(now.add(7, "day"));
  });

  const unscheduled = tasks.filter((task) => !task.dueDate);

  return {
    generatedAt: now.format("YYYY-MM-DD HH:mm:ss"),
    timezone: APP_TZ,
    limit,
    counts: {
      active: tasks.length,
      priorityTasks: priorityTasks.length,
      overdue: overdue.length,
      today: today.length,
      upcoming: upcoming.length,
      unscheduled: unscheduled.length,
    },
    priorityTasks: priorityTasks.map((task) => formatTask(task)),
    sections: {
      overdue: sortByPriority(overdue, now)
        .slice(0, limit)
        .map((task) => formatTask(task)),
      today: sortByPriority(today, now)
        .slice(0, limit)
        .map((task) => formatTask(task)),
      upcoming: sortByPriority(upcoming, now)
        .slice(0, limit)
        .map((task) => formatTask(task)),
      unscheduled: sortByPriority(unscheduled, now)
        .slice(0, limit)
        .map((task) => formatTask(task)),
    },
    suggestedAction:
      priorityTasks.length > 0
        ? "Choose one of the priorityTasks as today's focus."
        : "No urgent task found. You can rest or pick an unscheduled task.",
  };
}

// CREATE TASK
router.post("/", async (req, res) => {
  try {
    const {
      userId,
      title,
      description = "",
      subject = "",
      tags = [],
      category = "general",
      priority = "normal",
      complexity = "unknown",
      estimatedMinutes = null,
      dueDate,
      reminderEnabled = true,
      reminderAt,
    } = req.body;

    if (!userId || !title) {
      return res.status(400).json({
        message: "userId and title are required",
      });
    }

    const task = await Task.create({
      userId,
      title,
      description,
      subject,
      tags: normalizeTags(tags),
      category,
      priority,
      complexity,
      estimatedMinutes,
      dueDate: dueDate ? new Date(dueDate) : null,
      reminderEnabled,
      reminderAt: reminderAt
        ? new Date(reminderAt)
        : dueDate
        ? new Date(dueDate)
        : null,
    });

    res.status(201).json({
      message: "Task created",
      task: formatTask(task),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create task",
      error: error.message,
    });
  }
});

// SEARCH TASKS FOR AMBIGUITY HANDLING
router.get("/search", async (req, res) => {
  try {
    const { userId, q, status = "active" } = req.query;

    if (!userId) {
      return res.status(400).json({
        message: "userId query is required",
      });
    }

    if (!q || !q.trim()) {
      return res.status(400).json({
        message: "q query is required",
      });
    }

    const safeQuery = escapeRegex(q.trim());
    const regex = new RegExp(safeQuery, "i");

    const query = {
      userId,
      $or: [
        { title: regex },
        { description: regex },
        { subject: regex },
        { category: regex },
        { tags: regex },
        { taskCode: regex },
      ],
    };

    if (status !== "all") {
      query.status = status;
    }

    const tasks = await Task.find(query).sort({ dueDate: 1, createdAt: -1 });

    res.json({
      count: tasks.length,
      needsConfirmation: tasks.length > 1,
      tasks: tasks.map((task) => formatTask(task)),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to search tasks",
      error: error.message,
    });
  }
});

// PRIORITY BRIEFING
router.get("/briefing", async (req, res) => {
  try {
    const userId = requireUserIdFromQuery(req, res);
    if (!userId) return;

    const limit = Math.min(Number(req.query.limit || 4), 10);
    const tasks = await getActiveTasksForUser(userId);
    const briefing = buildPriorityBriefing(tasks, limit);

    res.json({
      message: "Priority briefing generated",
      ...briefing,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to generate briefing",
      error: error.message,
    });
  }
});

// SMART TODAY PLAN
router.get("/today", async (req, res) => {
  try {
    const userId = requireUserIdFromQuery(req, res);
    if (!userId) return;

    const { todayStart, todayEnd } = getTodayRange();

    const plannedToday = await Task.find({
      userId,
      plannedFor: {
        $gte: todayStart.toDate(),
        $lt: todayEnd.toDate(),
      },
    }).sort({ dueDate: 1, createdAt: -1 });

    const activePlannedToday = plannedToday.filter(
      (task) => task.status === "active"
    );
    const completedPlannedToday = plannedToday.filter(
      (task) => task.status === "completed"
    );

    const activeTasks = await getActiveTasksForUser(userId);
    const suggestions = buildPriorityBriefing(activeTasks, 4).priorityTasks;

    let mode = "needs_selection";
    let message = "No tasks have been selected for today yet.";

    if (plannedToday.length > 0 && activePlannedToday.length > 0) {
      mode = "has_active_today_plan";
      message = "There are active tasks selected for today.";
    } else if (plannedToday.length > 0 && activePlannedToday.length === 0) {
      mode = "today_plan_completed";
      message =
        "All selected tasks for today are completed. Ask Sensei whether to continue today or stop for now.";
    }

    res.json({
      message,
      mode,
      timezone: APP_TZ,
      date: todayStart.format("YYYY-MM-DD"),
      counts: {
        plannedToday: plannedToday.length,
        activePlannedToday: activePlannedToday.length,
        completedPlannedToday: completedPlannedToday.length,
        suggestions: suggestions.length,
      },
      activeTodayTasks: activePlannedToday.map((task) => formatTask(task)),
      completedTodayTasks: completedPlannedToday.map((task) => formatTask(task)),
      suggestedOptions: suggestions,
      nextPrompt:
        mode === "today_plan_completed"
          ? "All today's selected tasks are done. Ask: continue today or stop for now?"
          : mode === "needs_selection"
          ? "Ask Sensei which suggested task they want to do today."
          : "Continue helping Sensei finish the active today tasks.",
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to get today plan",
      error: error.message,
    });
  }
});

// SELECT TASKS FOR TODAY
router.patch("/today/select", async (req, res) => {
  try {
    const userId = requireUserIdFromBody(req, res);
    if (!userId) return;

    const { taskIds } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        message: "taskIds must be a non-empty array",
      });
    }

    const { todayStart } = getTodayRange();

    const result = await Task.updateMany(
      {
        _id: { $in: taskIds },
        userId,
        status: "active",
      },
      {
        $set: {
          plannedFor: todayStart.toDate(),
          plannedAt: new Date(),
        },
      }
    );

    const selectedTasks = await Task.find({
      _id: { $in: taskIds },
      userId,
    }).sort({ dueDate: 1, createdAt: -1 });

    res.json({
      message: "Tasks selected for today",
      modifiedCount: result.modifiedCount,
      date: todayStart.format("YYYY-MM-DD"),
      tasks: selectedTasks.map((task) => formatTask(task)),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to select today's tasks",
      error: error.message,
    });
  }
});

// CLEAR TODAY PLAN
router.patch("/today/clear", async (req, res) => {
  try {
    const userId = requireUserIdFromBody(req, res);
    if (!userId) return;

    const { todayStart, todayEnd } = getTodayRange();

    const result = await Task.updateMany(
      {
        userId,
        status: "active",
        plannedFor: {
          $gte: todayStart.toDate(),
          $lt: todayEnd.toDate(),
        },
      },
      {
        $set: {
          plannedFor: null,
          plannedAt: null,
        },
      }
    );

    res.json({
      message: "Today plan cleared",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to clear today plan",
      error: error.message,
    });
  }
});

// TRUE DUE-TODAY TASKS
router.get("/due-today", async (req, res) => {
  try {
    const userId = requireUserIdFromQuery(req, res);
    if (!userId) return;

    const { todayStart, todayEnd } = getTodayRange();

    const tasks = await Task.find({
      userId,
      status: "active",
      dueDate: {
        $gte: todayStart.toDate(),
        $lt: todayEnd.toDate(),
      },
    }).sort({ dueDate: 1 });

    res.json({
      count: tasks.length,
      timezone: APP_TZ,
      tasks: tasks.map((task) => formatTask(task)),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to get due-today tasks",
      error: error.message,
    });
  }
});

// WEEK TASKS
router.get("/week", async (req, res) => {
  try {
    const userId = requireUserIdFromQuery(req, res);
    if (!userId) return;

    const now = dayjs().tz(APP_TZ);
    const start = now.startOf("day");
    const end = start.add(7, "day");

    const tasks = await Task.find({
      userId,
      status: "active",
      dueDate: {
        $gte: start.toDate(),
        $lt: end.toDate(),
      },
    }).sort({ dueDate: 1 });

    res.json({
      count: tasks.length,
      timezone: APP_TZ,
      range: {
        start: start.format("YYYY-MM-DD HH:mm:ss"),
        end: end.format("YYYY-MM-DD HH:mm:ss"),
      },
      tasks: tasks.map((task) => formatTask(task)),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to get weekly tasks",
      error: error.message,
    });
  }
});

// OVERDUE TASKS
router.get("/overdue", async (req, res) => {
  try {
    const userId = requireUserIdFromQuery(req, res);
    if (!userId) return;

    const now = dayjs().tz(APP_TZ);

    const tasks = await Task.find({
      userId,
      status: "active",
      dueDate: {
        $ne: null,
        $lt: now.toDate(),
      },
    }).sort({ dueDate: 1 });

    res.json({
      count: tasks.length,
      timezone: APP_TZ,
      generatedAt: now.format("YYYY-MM-DD HH:mm:ss"),
      tasks: tasks.map((task) => formatTask(task)),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to get overdue tasks",
      error: error.message,
    });
  }
});

// LIST TASKS / SHOW EVERYTHING
router.get("/", async (req, res) => {
  try {
    const { userId, status = "active" } = req.query;

    if (!userId) {
      return res.status(400).json({
        message: "userId query is required",
      });
    }

    const query = { userId };

    if (status !== "all") {
      query.status = status;
    }

    const tasks = await Task.find(query).sort({
      status: 1,
      dueDate: 1,
      createdAt: -1,
    });

    res.json({
      count: tasks.length,
      status,
      tasks: tasks.map((task) => formatTask(task)),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to get tasks",
      error: error.message,
    });
  }
});

// UPDATE TASK
router.patch("/:id", async (req, res) => {
  try {
    const {
      title,
      description,
      subject,
      tags,
      category,
      priority,
      complexity,
      estimatedMinutes,
      dueDate,
      reminderEnabled,
      reminderAt,
      reminderSent,
      plannedFor,
    } = req.body;

    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (subject !== undefined) task.subject = subject;
    if (tags !== undefined) task.tags = normalizeTags(tags);
    if (category !== undefined) task.category = category;
    if (priority !== undefined) task.priority = priority;
    if (complexity !== undefined) task.complexity = complexity;
    if (estimatedMinutes !== undefined) task.estimatedMinutes = estimatedMinutes;

    if (dueDate !== undefined) {
      task.dueDate = dueDate ? new Date(dueDate) : null;

      if (reminderAt === undefined) {
        task.reminderAt = dueDate ? new Date(dueDate) : null;
        task.reminderSent = false;
        task.reminderSentAt = null;
      }
    }

    if (reminderEnabled !== undefined) task.reminderEnabled = reminderEnabled;

    if (reminderAt !== undefined) {
      task.reminderAt = reminderAt ? new Date(reminderAt) : null;
      task.reminderSent = false;
      task.reminderSentAt = null;
    }

    if (reminderSent !== undefined) task.reminderSent = reminderSent;

    if (plannedFor !== undefined) {
      task.plannedFor = plannedFor ? new Date(plannedFor) : null;
      task.plannedAt = plannedFor ? new Date() : null;
    }

    await task.save();

    res.json({
      message: "Task updated",
      task: formatTask(task),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to update task",
      error: error.message,
    });
  }
});

// MARK TASK DONE
router.patch("/:id/done", async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      {
        status: "completed",
        completedAt: new Date(),
      },
      { returnDocument: "after" }
    );

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    res.json({
      message: "Task marked as completed",
      task: formatTask(task),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to complete task",
      error: error.message,
    });
  }
});

// DELETE TASK
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
      task: formatTask(task),
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete task",
      error: error.message,
    });
  }
});

module.exports = router;