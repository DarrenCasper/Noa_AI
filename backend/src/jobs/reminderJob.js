const cron = require("node-cron");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

const Task = require("../models/Task");
const ReminderLog = require("../models/ReminderLog");
const { sendWhatsAppMessage } = require("../services/whatsappService");

dayjs.extend(utc);
dayjs.extend(timezone);

const APP_TZ = process.env.APP_TZ || "Asia/Jakarta";
const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID || "main-whatsapp";

function parseHourList(value, fallback) {
  if (!value) return fallback;

  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23);
}

const MORNING_BRIEFING_HOUR = Number(process.env.MORNING_BRIEFING_HOUR || 7);
const MORNING_BRIEFING_MINUTE = Number(process.env.MORNING_BRIEFING_MINUTE || 0);

const DEADLINE_PREP_HOUR = Number(process.env.DEADLINE_PREP_HOUR || 9);
const DEADLINE_PREP_MINUTE = Number(process.env.DEADLINE_PREP_MINUTE || 0);

const MISSING_DETAILS_HOURS = parseHourList(
  process.env.MISSING_DETAILS_HOURS,
  [9, 15, 21]
);
const MISSING_DETAILS_MINUTE = Number(process.env.MISSING_DETAILS_MINUTE || 0);
const MISSING_DETAILS_GRACE_MINUTES = Number(
  process.env.MISSING_DETAILS_GRACE_MINUTES || 30
);

const PRIORITY_CHECK_HOURS = parseHourList(
  process.env.PRIORITY_CHECK_HOURS,
  [10, 16, 20]
);
const PRIORITY_CHECK_MINUTE = Number(process.env.PRIORITY_CHECK_MINUTE || 0);

const OVERDUE_NOON_HOUR = Number(process.env.OVERDUE_NOON_HOUR || 12);
const OVERDUE_EVENING_HOUR = Number(process.env.OVERDUE_EVENING_HOUR || 18);

function getDateKey(now = dayjs().tz(APP_TZ)) {
  return now.tz(APP_TZ).format("YYYY-MM-DD");
}

function getSlotDateKey(now = dayjs().tz(APP_TZ)) {
  return now.tz(APP_TZ).format("YYYY-MM-DD-HH");
}

function getDueDateKey(task) {
  if (!task.dueDate) return null;
  return dayjs(task.dueDate).tz(APP_TZ).format("YYYY-MM-DD");
}

function getDueText(task) {
  if (!task.dueDate) return "not set";
  return dayjs(task.dueDate).tz(APP_TZ).format("MMM D, YYYY, h:mm A");
}

function getDetailsText(task) {
  if (task.description && task.description.trim()) {
    return task.description.trim();
  }

  return "not filled yet";
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

function shouldRemindMissingDetails(task, now = dayjs().tz(APP_TZ)) {
  if (task.status !== "active") return false;

  const missing = getMissingFields(task);

  if (missing.length === 0) return false;

  // Avoid reminding immediately after a task is created.
  if (task.createdAt) {
    const ageMinutes = now.diff(dayjs(task.createdAt).tz(APP_TZ), "minute");
    if (ageMinutes < MISSING_DETAILS_GRACE_MINUTES) {
      return false;
    }
  }

  // Strongest case: task is basically only a title.
  if (missing.length >= 2) return true;

  // Also remind if due date or description is missing.
  return missing.includes("description") || missing.includes("due date");
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
  } else if (task.category === "homework" || task.category === "coding") {
    score += 8;
    reasons.push("may need focus");
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

  let label = "low";

  if (score >= 110) {
    label = "urgent";
  } else if (score >= 75) {
    label = "high";
  } else if (score >= 40) {
    label = "medium";
  }

  return {
    score: Math.round(score),
    label,
    reasons,
  };
}

function isPriorityProblem(task, now = dayjs().tz(APP_TZ)) {
  const priority = calculatePriority(task, now);

  if (priority.score >= 75) return true;
  if (task.priority === "urgent" || task.priority === "high") return true;
  if (task.complexity === "complex" && task.dueDate) return true;

  return false;
}

function sortByPriority(tasks, now = dayjs().tz(APP_TZ)) {
  return [...tasks].sort((a, b) => {
    const scoreA = calculatePriority(a, now).score;
    const scoreB = calculatePriority(b, now).score;

    if (scoreB !== scoreA) return scoreB - scoreA;

    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate) - new Date(b.dueDate);
    }

    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;

    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

async function hasSentReminder({ userId, taskId = null, type, dateKey }) {
  const existing = await ReminderLog.findOne({
    userId,
    taskId,
    type,
    dateKey,
    status: "sent",
  });

  return Boolean(existing);
}

async function saveReminderLog({
  userId,
  taskId = null,
  type,
  dateKey,
  status,
  message = "",
  error = "",
}) {
  try {
    await ReminderLog.findOneAndUpdate(
      {
        userId,
        taskId,
        type,
        dateKey,
      },
      {
        $set: {
          status,
          message,
          error,
          sentAt: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );
  } catch (err) {
    console.error("Failed to save reminder log:", err.message);
  }
}

async function sendLoggedReminder({
  userId,
  taskId = null,
  type,
  dateKey,
  message,
}) {
  const alreadySent = await hasSentReminder({
    userId,
    taskId,
    type,
    dateKey,
  });

  if (alreadySent) {
    return false;
  }

  try {
    await sendWhatsAppMessage(message);

    await saveReminderLog({
      userId,
      taskId,
      type,
      dateKey,
      status: "sent",
      message,
    });

    console.log(`${type} sent.`);
    return true;
  } catch (error) {
    await saveReminderLog({
      userId,
      taskId,
      type,
      dateKey,
      status: "failed",
      message,
      error: error.message,
    });

    console.error(`${type} failed:`, error.message);
    return false;
  }
}

function formatMorningBriefingMessage(tasks) {
  const topTasks = sortByPriority(tasks).slice(0, 4);

  if (topTasks.length === 0) {
    return [
      "Good morning, Sensei.",
      "",
      "Your schedule looks clear for now. A rare peaceful morning.",
      "Let’s use it wisely.",
    ].join("\n");
  }

  const lines = [
    "Good morning, Sensei.",
    "",
    "Here’s your morning priority briefing:",
    "",
    "Top priority:",
  ];

  topTasks.forEach((task, index) => {
    const priority = calculatePriority(task);
    const reasons = priority.reasons.slice(0, 3).join(", ");

    lines.push(`${index + 1}. ${task.title}`);
    lines.push(`   Due: ${getDueText(task)}`);
    lines.push(`   Details: ${getDetailsText(task)}`);
    lines.push(`   Why: ${reasons || "worth reviewing"}`);
    lines.push("");
  });

  lines.push("Which one would you like to focus on first, Sensei?");

  return lines.join("\n");
}

async function sendMorningBriefing() {
  const now = dayjs().tz(APP_TZ);
  const userId = DEFAULT_USER_ID;
  const dateKey = getDateKey(now);
  const type = "morning_briefing";

  const tasks = await Task.find({
    userId,
    status: "active",
  }).sort({ dueDate: 1, createdAt: -1 });

  const message = formatMorningBriefingMessage(tasks);

  await sendLoggedReminder({
    userId,
    type,
    dateKey,
    message,
  });
}

function formatDeadlineReminderMessage(task, type) {
  if (type === "deadline_3h") {
    return [
      "Sensei, a deadline is approaching.",
      "",
      `${task.title}`,
      `Due: ${getDueText(task)}`,
      `Details: ${getDetailsText(task)}`,
      "",
      "There are about 3 hours left. Shall I place this into today’s focus?",
    ].join("\n");
  }

  if (type === "deadline_1h") {
    return [
      "Sensei, this is becoming urgent.",
      "",
      `${task.title}`,
      `Due: ${getDueText(task)}`,
      `Details: ${getDetailsText(task)}`,
      "",
      "There is about 1 hour left. I recommend handling this now.",
    ].join("\n");
  }

  return [
    "Reminder, Sensei.",
    "",
    `${task.title}`,
    `Due: ${getDueText(task)}`,
    `Details: ${getDetailsText(task)}`,
  ].join("\n");
}

function getDeadlineReminderType(task, now) {
  if (!task.dueDate) return null;

  const due = dayjs(task.dueDate).tz(APP_TZ);
  const minutesUntilDue = due.diff(now, "minute", true);

  if (minutesUntilDue <= 0) {
    return null;
  }

  if (minutesUntilDue <= 180 && minutesUntilDue > 120) {
    return "deadline_3h";
  }

  if (minutesUntilDue <= 60 && minutesUntilDue > 0) {
    return "deadline_1h";
  }

  return null;
}

async function sendDeadlineHourReminders() {
  const now = dayjs().tz(APP_TZ);

  const lookAheadEnd = now.add(3, "hour").add(5, "minute").toDate();

  const tasks = await Task.find({
    status: "active",
    reminderEnabled: true,
    dueDate: {
      $ne: null,
      $gt: now.toDate(),
      $lte: lookAheadEnd,
    },
  }).sort({ dueDate: 1 });

  for (const task of tasks) {
    const type = getDeadlineReminderType(task, now);

    if (!type) continue;

    const dateKey = getDueDateKey(task);
    const message = formatDeadlineReminderMessage(task, type);

    await sendLoggedReminder({
      userId: task.userId,
      taskId: task._id,
      type,
      dateKey,
      message,
    });
  }
}

function getDayReminderOffsetsForTask(task) {
  const offsets = new Set();

  // Normal tasks get 3-day and 1-day reminders.
  offsets.add(3);
  offsets.add(1);

  // Important or complex tasks get earlier preparation reminders too.
  if (
    task.priority === "urgent" ||
    task.priority === "high" ||
    task.complexity === "complex"
  ) {
    offsets.add(7);
    offsets.add(5);
  }

  return offsets;
}

function getDeadlineTypeFromOffset(offset) {
  if (offset === 7) return "deadline_7d";
  if (offset === 5) return "deadline_5d";
  if (offset === 3) return "deadline_3d";
  if (offset === 1) return "deadline_1d";
  return null;
}

function formatGroupedDeadlineMessage(tasks, offset) {
  const label =
    offset === 1
      ? "tomorrow"
      : `in about ${offset} days`;

  const lines = [
    `Sensei, I found ${tasks.length} deadline${tasks.length > 1 ? "s" : ""} coming ${label}.`,
    "",
  ];

  tasks.forEach((task, index) => {
    const priority = calculatePriority(task);
    const reasons = priority.reasons.slice(0, 2).join(", ");

    lines.push(`${index + 1}. ${task.title}`);
    lines.push(`   Due: ${getDueText(task)}`);
    lines.push(`   Details: ${getDetailsText(task)}`);
    lines.push(`   Why: ${reasons || "upcoming deadline"}`);
    lines.push("");
  });

  if (offset === 1) {
    lines.push(
      "I recommend placing the most important one into today’s focus, Sensei."
    );
  } else {
    lines.push(
      "It may be wise to prepare a little early. Which one should I watch more carefully, Sensei?"
    );
  }

  return lines.join("\n");
}

async function sendGroupedDeadlinePreparationReminders() {
  const now = dayjs().tz(APP_TZ);
  const userId = DEFAULT_USER_ID;
  const todayKey = getDateKey(now);

  const activeTasks = await Task.find({
    userId,
    status: "active",
    reminderEnabled: true,
    dueDate: { $ne: null },
  }).sort({ dueDate: 1 });

  const grouped = {
    7: [],
    5: [],
    3: [],
    1: [],
  };

  for (const task of activeTasks) {
    const due = dayjs(task.dueDate).tz(APP_TZ);
    const daysUntilDue = due.startOf("day").diff(now.startOf("day"), "day");

    const allowedOffsets = getDayReminderOffsetsForTask(task);

    if (allowedOffsets.has(daysUntilDue)) {
      grouped[daysUntilDue].push(task);
    }
  }

  for (const offset of [7, 5, 3, 1]) {
    const tasks = sortByPriority(grouped[offset] || now).slice(0, 8);
    const type = getDeadlineTypeFromOffset(offset);

    if (!type || tasks.length === 0) continue;

    const message = formatGroupedDeadlineMessage(tasks, offset);

    await sendLoggedReminder({
      userId,
      type,
      dateKey: todayKey,
      message,
    });
  }
}

function formatMissingDetailsMessage(tasks) {
  const lines = [
    "Sensei, a few tasks still need more details.",
    "",
  ];

  tasks.forEach((task, index) => {
    const missing = getMissingFields(task).join(", ");

    lines.push(`${index + 1}. ${task.title}`);
    lines.push(`   Missing: ${missing}`);
    lines.push(`   Due: ${getDueText(task)}`);
    lines.push("");
  });

  lines.push(
    "Would you like to fill one of these in now, Sensei?"
  );

  return lines.join("\n");
}

async function sendMissingDetailsReminder() {
  const now = dayjs().tz(APP_TZ);
  const userId = DEFAULT_USER_ID;
  const type = "missing_details_6h";
  const dateKey = getSlotDateKey(now);

  const tasks = await Task.find({
    userId,
    status: "active",
  }).sort({ dueDate: 1, createdAt: -1 });

  const incompleteTasks = sortByPriority(
    tasks.filter((task) => shouldRemindMissingDetails(task, now)),
    now
  ).slice(0, 6);

  if (incompleteTasks.length === 0) return;

  const message = formatMissingDetailsMessage(incompleteTasks);

  await sendLoggedReminder({
    userId,
    type,
    dateKey,
    message,
  });
}

function formatPriorityAttentionMessage(tasks) {
  const lines = [
    "Sensei, I noticed a priority issue that may need attention.",
    "",
    "Tasks to watch:",
  ];

  tasks.forEach((task, index) => {
    const priority = calculatePriority(task);
    const reasons = priority.reasons.slice(0, 3).join(", ");
    const missing = getMissingFields(task);

    lines.push(`${index + 1}. ${task.title}`);
    lines.push(`   Due: ${getDueText(task)}`);
    lines.push(`   Details: ${getDetailsText(task)}`);
    lines.push(`   Why: ${reasons || "high priority"}`);

    if (missing.length > 0) {
      lines.push(`   Missing: ${missing.join(", ")}`);
    }

    lines.push("");
  });

  lines.push(
    "I recommend choosing one of these for today’s focus, Sensei."
  );

  return lines.join("\n");
}

async function sendPriorityAttentionReminder() {
  const now = dayjs().tz(APP_TZ);
  const userId = DEFAULT_USER_ID;
  const type = "priority_attention_6h";
  const dateKey = getSlotDateKey(now);

  const tasks = await Task.find({
    userId,
    status: "active",
    reminderEnabled: true,
  }).sort({ dueDate: 1, createdAt: -1 });

  const priorityTasks = sortByPriority(
    tasks.filter((task) => isPriorityProblem(task, now)),
    now
  ).slice(0, 4);

  if (priorityTasks.length === 0) return;

  const message = formatPriorityAttentionMessage(priorityTasks);

  await sendLoggedReminder({
    userId,
    type,
    dateKey,
    message,
  });
}

function formatOverdueMessage(tasks, type) {
  const lines = [
    type === "overdue_noon"
      ? "Sensei, a quick midday check: some tasks are overdue."
      : "Sensei, an evening reminder: these tasks are still overdue.",
    "",
  ];

  tasks.forEach((task, index) => {
    lines.push(`${index + 1}. ${task.title}`);
    lines.push(`   Due: ${getDueText(task)}`);
    lines.push(`   Details: ${getDetailsText(task)}`);
    lines.push("");
  });

  lines.push(
    "I recommend handling the first one before taking on anything new, Sensei."
  );

  return lines.join("\n");
}

async function sendGroupedOverdueReminder(type) {
  const now = dayjs().tz(APP_TZ);
  const userId = DEFAULT_USER_ID;
  const dateKey = getDateKey(now);

  const tasks = await Task.find({
    userId,
    status: "active",
    reminderEnabled: true,
    dueDate: {
      $ne: null,
      $lt: now.toDate(),
    },
  }).sort({ dueDate: 1 });

  const overdueTasks = sortByPriority(tasks, now).slice(0, 6);

  if (overdueTasks.length === 0) return;

  const message = formatOverdueMessage(overdueTasks, type);

  await sendLoggedReminder({
    userId,
    type,
    dateKey,
    message,
  });
}

function shouldRunAt(now, hour, minute) {
  return now.hour() === hour && now.minute() === minute;
}

function shouldRunAtAnyHour(now, hours, minute) {
  return hours.includes(now.hour()) && now.minute() === minute;
}

function startReminderJob() {
  console.log("Reminder job started.");
  console.log(
    `Morning briefing time: ${MORNING_BRIEFING_HOUR}:${String(
      MORNING_BRIEFING_MINUTE
    ).padStart(2, "0")} ${APP_TZ}`
  );
  console.log(
    `Deadline prep reminder time: ${DEADLINE_PREP_HOUR}:${String(
      DEADLINE_PREP_MINUTE
    ).padStart(2, "0")} ${APP_TZ}`
  );
  console.log(`Missing details hours: ${MISSING_DETAILS_HOURS.join(", ")}`);
  console.log(`Priority check hours: ${PRIORITY_CHECK_HOURS.join(", ")}`);
  console.log("Urgent deadline reminders enabled: 3h and 1h before.");

  cron.schedule("* * * * *", async () => {
    try {
      const now = dayjs().tz(APP_TZ);

      if (shouldRunAt(now, MORNING_BRIEFING_HOUR, MORNING_BRIEFING_MINUTE)) {
        await sendMorningBriefing();
      }

      if (shouldRunAt(now, DEADLINE_PREP_HOUR, DEADLINE_PREP_MINUTE)) {
        await sendGroupedDeadlinePreparationReminders();
      }

      if (shouldRunAtAnyHour(now, MISSING_DETAILS_HOURS, MISSING_DETAILS_MINUTE)) {
        await sendMissingDetailsReminder();
      }

      if (shouldRunAtAnyHour(now, PRIORITY_CHECK_HOURS, PRIORITY_CHECK_MINUTE)) {
        await sendPriorityAttentionReminder();
      }

      if (shouldRunAt(now, OVERDUE_NOON_HOUR, 0)) {
        await sendGroupedOverdueReminder("overdue_noon");
      }

      if (shouldRunAt(now, OVERDUE_EVENING_HOUR, 0)) {
        await sendGroupedOverdueReminder("overdue_evening");
      }

      await sendDeadlineHourReminders();
    } catch (error) {
      console.error("Reminder job error:", error.message);
    }
  });
}

module.exports = {
  startReminderJob,
  sendMorningBriefing,
  sendDeadlineHourReminders,
  sendGroupedDeadlinePreparationReminders,
  sendMissingDetailsReminder,
  sendPriorityAttentionReminder,
  sendGroupedOverdueReminder,
};