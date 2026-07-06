const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

const Task = require("../models/Task");

dayjs.extend(utc);
dayjs.extend(timezone);

const APP_TZ = process.env.APP_TZ || "Asia/Jakarta";

function getDetailsText(task) {
  if (task.description && task.description.trim()) {
    return task.description.trim();
  }

  return "not filled yet";
}

function getDueText(task) {
  if (!task.dueDate) return "not set";
  return dayjs(task.dueDate).tz(APP_TZ).format("ddd, DD MMM YYYY, HH:mm");
}

function getChecklistProgress(task) {
  const items = Array.isArray(task.checklistItems) ? task.checklistItems : [];

  const total = items.length;
  const done = items.filter((item) => item.status === "done").length;

  const pending = items
    .filter((item) => item.status !== "done")
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));

  const percentage = total === 0 ? null : Math.round((done / total) * 100);

  return {
    total,
    done,
    pending,
    percentage,
    hasChecklist: total > 0,
    nextItem: pending[0]?.title || null,
  };
}

function getMissingFields(task) {
  const missing = [];

  if (!task.description || !task.description.trim()) {
    missing.push("description");
  }

  if (!task.dueDate) {
    missing.push("due date");
  }

  if (!task.subject || !task.subject.trim()) {
    missing.push("subject");
  }

  if (!Array.isArray(task.tags) || task.tags.length === 0) {
    missing.push("tags");
  }

  return missing;
}

function getChecklistRisk(task, now = dayjs().tz(APP_TZ)) {
  const progress = getChecklistProgress(task);

  if (!progress.hasChecklist) return "none";
  if (progress.percentage === 100) return "complete";

  if (!task.dueDate) {
    if (progress.percentage <= 30) return "medium";
    return "low";
  }

  const due = dayjs(task.dueDate).tz(APP_TZ);
  const hoursUntilDue = due.diff(now, "hour", true);

  if (hoursUntilDue < 0 && progress.percentage < 100) {
    return "high";
  }

  if (hoursUntilDue <= 48 && progress.percentage <= 70) {
    return "high";
  }

  if (hoursUntilDue <= 7 * 24 && progress.percentage <= 30) {
    return "high";
  }

  if (progress.percentage <= 70) {
    return "medium";
  }

  return "low";
}

function calculateWeeklyPriority(task, now = dayjs().tz(APP_TZ)) {
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
    } else if (hoursUntilDue <= 24) {
      score += 90;
      reasons.push("due within 24 hours");
    } else if (hoursUntilDue <= 48) {
      score += 75;
      reasons.push("due within 2 days");
    } else if (hoursUntilDue <= 7 * 24) {
      score += 60;
      reasons.push("due this week");
    } else {
      score += 15;
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
  }

  if (task.category === "homework") {
    score += 15;
    reasons.push("homework");
  } else if (task.category === "coding") {
    score += 12;
    reasons.push("coding task");
  } else if (task.category === "appointment") {
    score += 20;
    reasons.push("appointment");
  }

  const missingFields = getMissingFields(task);

  if (missingFields.length >= 2) {
    score += 10;
    reasons.push("missing details");
  }

  const checklistProgress = getChecklistProgress(task);
  const checklistRisk = getChecklistRisk(task, now);

  if (checklistProgress.hasChecklist) {
    reasons.push(
      `checklist ${checklistProgress.done}/${checklistProgress.total} done`
    );

    if (checklistRisk === "high") {
      score += 30;
      reasons.push("high checklist risk");
    } else if (checklistRisk === "medium") {
      score += 15;
      reasons.push("checklist still needs progress");
    } else if (checklistRisk === "low") {
      score += 5;
    }
  }

  let label = "low";

  if (score >= 120) {
    label = "urgent";
  } else if (score >= 80) {
    label = "high";
  } else if (score >= 45) {
    label = "medium";
  }

  return {
    score: Math.round(score),
    label,
    reasons,
  };
}

function formatWeeklyTask(task, now = dayjs().tz(APP_TZ)) {
  const checklist = getChecklistProgress(task);
  const priority = calculateWeeklyPriority(task, now);
  const missingFields = getMissingFields(task);

  return {
    id: task._id,
    title: task.title,
    status: task.status,
    dueDate: task.dueDate,
    dueText: getDueText(task),
    details: getDetailsText(task),
    category: task.category,
    priority: task.priority,
    complexity: task.complexity,
    weeklyPriority: priority,
    checklist: {
      total: checklist.total,
      done: checklist.done,
      percentage: checklist.percentage,
      hasChecklist: checklist.hasChecklist,
      nextItem: checklist.nextItem,
      risk: getChecklistRisk(task, now),
    },
    missingFields,
    nextStep:
      checklist.nextItem ||
      (missingFields.length > 0
        ? `Fill missing ${missingFields[0]}`
        : "Review and continue this task"),
  };
}

function sortByWeeklyPriority(tasks, now = dayjs().tz(APP_TZ)) {
  return [...tasks].sort((a, b) => {
    const scoreA = calculateWeeklyPriority(a, now).score;
    const scoreB = calculateWeeklyPriority(b, now).score;

    if (scoreB !== scoreA) return scoreB - scoreA;

    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate) - new Date(b.dueDate);
    }

    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;

    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function buildDailyBreakdown(tasks, start, end, now) {
  const days = [];
  let cursor = start.startOf("day");

  while (cursor.isBefore(end)) {
    const dayStart = cursor.startOf("day");
    const dayEnd = dayStart.add(1, "day");

    const dueTasks = tasks.filter((task) => {
      if (!task.dueDate) return false;
      const due = dayjs(task.dueDate).tz(APP_TZ);
      return due.isAfter(dayStart) && due.isBefore(dayEnd);
    });

    const formattedTasks = sortByWeeklyPriority(dueTasks, now)
      .slice(0, 4)
      .map((task) => formatWeeklyTask(task, now));

    days.push({
      date: dayStart.format("YYYY-MM-DD"),
      dayName: dayStart.format("dddd"),
      tasks: formattedTasks,
      suggestedFocus:
        formattedTasks.length > 0
          ? `Prepare or finish ${formattedTasks[0].title}`
          : "Use this as a buffer day or continue checklist progress",
    });

    cursor = cursor.add(1, "day");
  }

  return days;
}

function buildRecommendation({ overdue, dueThisWeek, highChecklistRisk, missingDetails }) {
  if (overdue.length > 0) {
    return "Start with overdue tasks first, then move to this week's nearest deadline.";
  }

  if (highChecklistRisk.length > 0) {
    return "Start with the task that has the highest checklist risk.";
  }

  if (dueThisWeek.length > 0) {
    return "Start with the nearest deadline this week.";
  }

  if (missingDetails.length > 0) {
    return "Fill missing task details first so the week is easier to plan.";
  }

  return "No urgent weekly risk found. Use this week to make steady progress.";
}

async function generateWeeklyPlan({ userId, days = 7 }) {
  const now = dayjs().tz(APP_TZ);
  const start = now.startOf("day");
  const end = start.add(days, "day");

  const activeTasks = await Task.find({
    userId,
    status: "active",
  }).sort({ dueDate: 1, createdAt: -1 });

  const overdue = activeTasks.filter((task) => {
    return task.dueDate && dayjs(task.dueDate).tz(APP_TZ).isBefore(now);
  });

  const dueThisWeek = activeTasks.filter((task) => {
    if (!task.dueDate) return false;

    const due = dayjs(task.dueDate).tz(APP_TZ);

    return (
      due.isAfter(now) &&
      due.isBefore(end)
    );
  });

  const unscheduled = activeTasks.filter((task) => !task.dueDate);

  const highChecklistRisk = activeTasks.filter((task) => {
    return getChecklistRisk(task, now) === "high";
  });

  const missingDetails = activeTasks.filter((task) => {
    return getMissingFields(task).length > 0;
  });

  const sortedAll = sortByWeeklyPriority(activeTasks, now);

  const sections = {
    overdue: sortByWeeklyPriority(overdue, now)
      .slice(0, 6)
      .map((task) => formatWeeklyTask(task, now)),

    dueThisWeek: sortByWeeklyPriority(dueThisWeek, now)
      .slice(0, 8)
      .map((task) => formatWeeklyTask(task, now)),

    highChecklistRisk: sortByWeeklyPriority(highChecklistRisk, now)
      .slice(0, 6)
      .map((task) => formatWeeklyTask(task, now)),

    missingDetails: sortByWeeklyPriority(missingDetails, now)
      .slice(0, 6)
      .map((task) => formatWeeklyTask(task, now)),

    unscheduled: sortByWeeklyPriority(unscheduled, now)
      .slice(0, 6)
      .map((task) => formatWeeklyTask(task, now)),
  };

  const topPriorities = sortedAll
    .slice(0, 5)
    .map((task) => formatWeeklyTask(task, now));

  return {
    generatedAt: now.format("YYYY-MM-DD HH:mm:ss"),
    timezone: APP_TZ,
    range: {
      start: start.format("YYYY-MM-DD"),
      end: end.format("YYYY-MM-DD"),
      days,
    },
    counts: {
      active: activeTasks.length,
      overdue: overdue.length,
      dueThisWeek: dueThisWeek.length,
      highChecklistRisk: highChecklistRisk.length,
      missingDetails: missingDetails.length,
      unscheduled: unscheduled.length,
    },
    topPriorities,
    sections,
    dailyBreakdown: buildDailyBreakdown(activeTasks, start, end, now),
    recommendation: buildRecommendation({
      overdue,
      dueThisWeek,
      highChecklistRisk,
      missingDetails,
    }),
    closingQuestion:
      topPriorities.length > 0
        ? "Would you like me to place the first priority into today’s focus, Sensei?"
        : "Would you like me to help plan a new task for this week, Sensei?",
  };
}

module.exports = {
  generateWeeklyPlan,
};