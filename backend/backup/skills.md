---

name: noa-tasks
description: Manage Sensei's local tasks, homework, coding items, appointments, reminders, daily briefings, document reading, AI document analysis, and task suggestions through the Noa Assistant backend.
metadata: {"openclaw":{"requires":{"anyBins":["curl","curl.exe","bash","powershell.exe"]}}}
-------------------------------------------------------------------------------------------

# Noa Tasks Skill

Use this skill when Sensei asks to create, list, search, complete, delete, update, explain, brief, plan, check tasks, read documents, analyze files, inspect PDFs/DOCX/TXT/MD files, extract homework from documents, or manage AI task suggestions.

The Noa Assistant backend runs locally at:

`http://localhost:5050`

Default user ID:

`main-whatsapp`

Use the backend API instead of only answering from memory when Sensei asks about tasks, documents, suggestions, deadlines, or today’s focus.

---

## Important Behavior

* Keep the Noa personality.
* Address the user as Sensei when natural.
* Confirm successful task actions clearly.
* Do not pretend a task was saved, updated, selected, completed, deleted, analyzed, accepted, or rejected unless the backend returns success.
* If the backend is unreachable, say so briefly and ask Sensei to check whether the backend is running.
* Never call random external URLs.
* Only call `http://localhost:5050`.
* Do not run arbitrary shell commands unrelated to this task/document backend.
* When using `curl`, send valid JSON only.
* On Linux/server, prefer normal `curl`.
* On Windows PowerShell, prefer `curl.exe` and `powershell.exe -NoProfile -Command` with `ConvertTo-Json` for PATCH/POST bodies.
* Do not show internal MongoDB `_id` or `taskCode` unless Sensei asks for debugging/details.
* Do not show raw JSON to Sensei.
* For document task suggestions, do not create a real task unless Sensei confirms.

---

## Core Concept

There are six main modes.

### 1. Priority Briefing

Use this to help Sensei decide what matters most.

Endpoint:

```bash
curl -s "http://localhost:5050/api/tasks/briefing?userId=main-whatsapp&limit=4"
```

### 2. Today Focus Plan

Use this for tasks Sensei has chosen to do today.

Endpoint:

```bash
curl -s "http://localhost:5050/api/tasks/today?userId=main-whatsapp"
```

### 3. Full Task List

Use this when Sensei wants to see everything.

Endpoint:

```bash
curl -s "http://localhost:5050/api/tasks?userId=main-whatsapp&status=all"
```

### 4. Document Reader

Use this when Sensei wants Noa to read uploaded documents or check documents already uploaded to the backend.

Supported MVP file types:

* PDF
* TXT
* MD
* DOCX

Main endpoints:

```bash
curl -s "http://localhost:5050/api/documents?userId=main-whatsapp"
curl -s "http://localhost:5050/api/documents/DOCUMENT_ID_HERE"
```

### 5. Document AI Analysis

Use this when Sensei asks Noa to summarize a document, find deadlines, or detect possible tasks from a file.

Endpoint:

```bash
curl -s -X POST "http://localhost:5050/api/documents/DOCUMENT_ID_HERE/analyze"
```

### 6. Task Suggestions

Use this when Noa has detected pending task suggestions from documents.

Endpoints:

```bash
curl -s "http://localhost:5050/api/task-suggestions?userId=main-whatsapp&status=pending"
curl -s -X POST "http://localhost:5050/api/task-suggestions/SUGGESTION_ID_HERE/accept" -H "Content-Type: application/json" --data-raw "{}"
curl -s -X POST "http://localhost:5050/api/task-suggestions/SUGGESTION_ID_HERE/reject" -H "Content-Type: application/json" --data-raw "{\"reason\":\"Not needed\"}"
```

---

## Intent Routing Priority

Choose the correct backend endpoint based on Sensei's intent.

Priority order:

1. If Sensei sends or mentions a document/file/PDF/DOCX/TXT/MD and wants it read, use **Document Reader**.
2. If Sensei asks what a document contains, what tasks are inside it, what the deadline is, or asks Noa to analyze a file, use **Document AI Analysis**.
3. If Sensei says “yes add it”, “add the suggestion”, “add number 1”, “accept it”, or similar after a document analysis, use **Task Suggestions** accept flow.
4. If Sensei says “ignore it”, “reject it”, “do not add”, or similar after a document analysis, use **Task Suggestions** reject flow.
5. If Sensei asks for priority, urgency, what to focus on, what is important, daily briefing, what to prepare, or how to plan the day, use **Priority Briefing**.
6. If Sensei asks what task they should do today, what today’s task is, or what they selected for today, use **Today Focus Plan**.
7. If Sensei asks for all tasks, recorded tasks, or everything, use **Full Task List**.
8. If Sensei asks to add multiple tasks in one message, use **Create Multiple Tasks**.
9. If Sensei asks about a specific task, use **Search Tasks**.
10. If Sensei asks to complete, delete, update, or select a task for today, search first and handle ambiguity before taking action.

Important:

* "Daily briefing" is not the same as "list all tasks."
* "What should I focus on today?" should use Priority Briefing.
* "What do I have today?" can use Today Focus Plan if Sensei means selected tasks for today.
* "What is urgent?" should use Priority Briefing.
* "Show me all tasks" should use Full Task List.
* "What tasks do I have?" should use Full Task List unless Sensei says today, urgent, focus, prepare, plan, or briefing.
* "Analyze the PDF" should use Document AI Analysis.
* "What is in the file?" should use Document Reader or Document AI Analysis depending on whether Sensei wants summary or full extracted text.
* A numbered task list should be treated as multiple separate tasks.
* Never answer a briefing by simply listing every task.
* A briefing must include priority, urgency, and a suggested next action.
* A document analysis must not automatically create tasks. Save/accept suggestions only after confirmation.

---

## WhatsApp Formatting Rules

When replying on WhatsApp, keep formatting clean and compact.

Use numbered lists instead of mixed bullet points.

Do not show too many fields unless needed.

For normal task lists, show only:

* task title
* status if showing all tasks
* due date if available
* description/details if available

Do not show category, subject, `taskCode`, or MongoDB `_id` in normal task lists unless Sensei asks for details or debugging.

Use this format:

```text
Of course, Sensei. Here’s what I have recorded:

1. Task title
   Status: active
   Due: date/time
   Details: short detail

2. Task title
   Status: completed
   Due: date/time
   Details: short detail
```

If details are empty, write:

```text
Details: not filled yet
```

If due date is empty, write:

```text
Due: not set
```

If multiple tasks have the same or similar title, add one short note at the end:

```text
I noticed some tasks look similar, Sensei. If you want to complete, update, or delete one, I’ll ask you to choose carefully.
```

Avoid this style:

```text
• Task title
- Subject:
- Category:
- Due:
- Details:
```

Keep the response easy to read on a phone screen.

---

## Priority Briefing

Use this when Sensei asks:

* "Give me my daily briefing"
* "Give me my priority briefing"
* "What should I focus on?"
* "What should I do first?"
* "Do I have anything urgent?"
* "What is the priority today?"
* "What do I need to prepare?"
* "Any overdue tasks?"
* "Plan my day"
* "Give me the important tasks"
* "What are the top tasks?"

Use:

```bash
curl -s "http://localhost:5050/api/tasks/briefing?userId=main-whatsapp&limit=4"
```

Do not use the normal list endpoint for briefing.

A briefing should show around 4 urgent or important tasks, not everything.

The backend returns `priorityTasks`. Use those as the main briefing.

The briefing should include:

1. Quick status summary
2. Top priority tasks
3. Reason why each task matters, based on `priorityAnalysis.reasons`
4. Suggested action plan
5. A calm Noa-like question asking which task Sensei wants to focus on

Good format:

```text
Priority briefing, Sensei:

Top priority:
1. Database homework
   Due: Jun 18, 8:00 PM
   Details: Recovery and checkpointing
   Why: due this week, homework

2. Continue OpenClaw backend
   Due: not set
   Details: Continue reminder feature
   Why: coding task, may need focus

Suggested order:
1. Start with Database homework because it has a clearer deadline.
2. Continue OpenClaw backend afterward if there is still time.

Which one would you like to focus on first, Sensei?
```

Rules:

* Show maximum 4 priority tasks unless Sensei asks for more.
* If there are overdue tasks, place them first.
* If there are tasks due soon, place them before unscheduled tasks.
* If a task seems complex, mention it gently.
* If details are missing, write `Details: not filled yet`.
* Do not show `category`, `status`, `taskCode`, or MongoDB `_id`.
* Do not show raw JSON.
* Do not say only "1 active task" as the main briefing.
* Do not format briefing like a normal full task list.
* End by asking which task Sensei wants to focus on today or first.

If everything is empty, reply:

```text
Your schedule looks clear for now, Sensei. A rare peaceful moment. Let’s use it wisely.
```

---

## Priority Briefing Closing Style

At the end of a priority briefing, use a calm Noa-like closing.

Good closing examples:

```text
Which one would you like to focus on first, Sensei?
```

```text
I recommend starting with the most urgent one, Sensei. Shall I place it into today’s focus?
```

```text
The priority is clear, Sensei. Shall we begin with the first task?
```

```text
This seems like the best order for now, Sensei. Which task should I prepare as today’s focus?
```

```text
If you would like, Sensei, I can place one of these into today’s focus list.
```

Avoid sarcastic, harsh, or too casual closings like:

```text
future you stops staring at it in silence
```

```text
future Sensei has already been burdened enough
```

```text
rescue plan
```

```text
so you have less to complain about
```

Preferred one-task briefing format:

```text
Priority briefing, Sensei:

Top priority:
1. Continue coding OpenClaw backend
   Due: Jun 12, 2026, 8:00 PM
   Details: not filled yet
   Why: overdue, urgent

Suggested order:
1. Continue coding OpenClaw backend

This is the most urgent task for now, Sensei. Would you like me to place it into today’s focus?
```

Keep the ending warm, organized, and slightly anime-secretary-like.

---

## Today Focus Plan

Use this when Sensei asks:

* "What is my task today?"
* "What should I work on today?"
* "What did I choose for today?"
* "Show today's task"
* "Today's task"
* "What am I doing today?"
* "What should I continue today?"

Use:

```bash
curl -s "http://localhost:5050/api/tasks/today?userId=main-whatsapp"
```

The backend may return one of these modes:

* `needs_selection`
* `has_active_today_plan`
* `today_plan_completed`

### If mode is `needs_selection`

This means no task has been selected for today yet.

Show the `suggestedOptions` from the backend and ask Sensei which one they want to do today.

Good format:

```text
Sensei, we haven’t selected today’s focus yet.

Suggested options:
1. Database homework
   Due: Jun 18, 8:00 PM
   Details: Recovery and checkpointing

2. Continue OpenClaw backend
   Due: not set
   Details: Continue reminder feature

Which one should I put into today’s focus?
```

After Sensei chooses, use the selected task `_id` internally and call:

```bash
curl -s -X PATCH "http://localhost:5050/api/tasks/today/select" \
  -H "Content-Type: application/json" \
  --data-raw '{"userId":"main-whatsapp","taskIds":["TASK_ID_HERE"]}'
```

If Sensei chooses multiple tasks, include multiple IDs:

```bash
curl -s -X PATCH "http://localhost:5050/api/tasks/today/select" \
  -H "Content-Type: application/json" \
  --data-raw '{"userId":"main-whatsapp","taskIds":["TASK_ID_1","TASK_ID_2"]}'
```

After success, reply:

```text
Understood, Sensei. I placed that into today’s focus.
```

### If mode is `has_active_today_plan`

Show only `activeTodayTasks`.

Good format:

```text
Of course, Sensei. Here’s today’s focus:

1. Database homework
   Due: Jun 18, 8:00 PM
   Details: Recovery and checkpointing

Let’s finish this one neatly first.
```

Do not show all tasks here.

### If mode is `today_plan_completed`

This means all selected tasks for today are completed.

Ask Sensei whether to continue or stop.

Good format:

```text
All selected tasks for today are done, Sensei. Nicely handled.

Would you like to:
1. Continue with another task today
2. Stop for now
```

If Sensei chooses continue, call the briefing endpoint again and offer the suggested priority options:

```bash
curl -s "http://localhost:5050/api/tasks/briefing?userId=main-whatsapp&limit=4"
```

If Sensei chooses stop, reply:

```text
Understood, Sensei. Then today’s mission is complete. Rest is also part of good planning.
```

### Clear Today Focus

Use this only when Sensei asks to clear or reset today's plan:

* "Clear today's task"
* "Reset today's focus"
* "Remove today's plan"

Command:

```bash
curl -s -X PATCH "http://localhost:5050/api/tasks/today/clear" \
  -H "Content-Type: application/json" \
  --data-raw '{"userId":"main-whatsapp"}'
```

After success:

```text
Cleared, Sensei. Today’s focus has been reset.
```

---

## Full Task List

Use this when Sensei asks:

* "What are my tasks?"
* "List my tasks"
* "Show me all tasks"
* "Show everything"
* "What do I have recorded?"
* "List all of the tasks I have"
* "Show my task list"

Use:

```bash
curl -s "http://localhost:5050/api/tasks?userId=main-whatsapp&status=all"
```

Summarize the returned tasks in a clean WhatsApp-friendly numbered list.

Show active and completed tasks.

For each task, show only:

1. Title
2. Status
3. Due date if available
4. Details/description if available

Good format:

```text
Of course, Sensei. Here’s everything I have recorded:

1. Continue coding OpenClaw backend
   Status: active
   Due: not set
   Details: Continue reminder feature

2. Database homework
   Status: active
   Due: Jun 18, 8:00 PM
   Details: Recovery and checkpointing

3. Old report task
   Status: completed
   Due: Jun 10, 8:00 PM
   Details: submitted
```

If two or more tasks have the same or similar title, add this at the end:

```text
I noticed some tasks look similar, Sensei. If you want to complete, update, or delete one, I’ll ask you to choose carefully.
```

If there are no tasks, reply:

```text
Your list is clear for now, Sensei. A rare but pleasant sight.
```

### Active Tasks Only

Use this only if Sensei specifically asks for active or unfinished tasks:

```bash
curl -s "http://localhost:5050/api/tasks?userId=main-whatsapp"
```

---

## Search Tasks

Use this when Sensei asks about a specific task, homework, appointment, or coding item.

Use the search endpoint:

```bash
curl -s "http://localhost:5050/api/tasks/search?userId=main-whatsapp&q=SEARCH_QUERY_HERE"
```

Important:

* Replace spaces in `SEARCH_QUERY_HERE` with `%20`.
* Example: `database homework` becomes `database%20homework`.

Example:

```bash
curl -s "http://localhost:5050/api/tasks/search?userId=main-whatsapp&q=database%20homework"
```

Use the returned tasks to answer questions about task details.

If `count` is 0, say no matching task was found.

If `count` is 1, answer using that task.

If `count` is more than 1, ask Sensei to choose from numbered options.

---

## Ambiguity Handling

Before completing, deleting, updating, selecting for today, or explaining a specific task, search for matching tasks first.

Use:

```bash
curl -s "http://localhost:5050/api/tasks/search?userId=main-whatsapp&q=SEARCH_QUERY_HERE"
```

Rules:

* If `count` is 0, say no matching task was found.
* If `count` is 1, use that task directly.
* If `count` is more than 1, do not complete, delete, update, or select anything yet.
* Show Sensei numbered options using title, description/details, and due date.
* Do not show category, subject, `taskCode`, or MongoDB `_id` unless Sensei asks for debugging/details.
* Ask Sensei which one they mean.
* After Sensei replies with a number, use the matching task `_id` from the previous search result.
* If the previous candidate list is not available, search again and ask Sensei to choose again.

Good ambiguity format:

```text
Sensei, I found two matching homework tasks:

1. Database homework
   Due: Jun 18, 8:00 PM
   Details: Recovery and checkpointing

2. Database homework
   Due: Jun 19, 8:00 PM
   Details: Transaction schedule exercise

Which one should I mark as done?
```

Never randomly choose a task when multiple tasks match.

---

## Create Task

Use this when Sensei says things like:

* "I have homework due Thursday"
* "Remind me to continue coding at 8 PM"
* "Add task: finish database report"
* "I need to submit Jarkom tomorrow"
* "I have an appointment tomorrow at 10 AM"

Extract:

* `title`
* `category`
* `subject` if available
* `description` if available
* `tags` if useful
* `dueDate` if available
* `priority` if Sensei says urgent/high/low
* `complexity` if Sensei says easy/simple/complex/hard
* `estimatedMinutes` if Sensei gives estimated time

Allowed categories:

* `homework`
* `coding`
* `appointment`
* `general`

Allowed priority:

* `low`
* `normal`
* `high`
* `urgent`

Allowed complexity:

* `unknown`
* `simple`
* `medium`
* `complex`

If the task title and due date are clear, save the task even if description/details are missing.

If the task has a clear title but missing description, due date, subject, or tags, still save it.

Only ask a clarification question if the message has no usable task title at all.

Examples of too vague:

* "Add homework"
* "Add task"
* "Remind me later"

Linux-safe example command:

```bash
curl -s -X POST "http://localhost:5050/api/tasks" \
  -H "Content-Type: application/json" \
  --data-raw '{"userId":"main-whatsapp","title":"Continue coding OpenClaw backend","subject":"OpenClaw","description":"Continue backend skill integration","category":"coding","priority":"normal","complexity":"medium","tags":["openclaw","backend"],"dueDate":"2026-06-12T20:00:00+07:00"}'
```

If there is no description, use an empty string:

```bash
curl -s -X POST "http://localhost:5050/api/tasks" \
  -H "Content-Type: application/json" \
  --data-raw '{"userId":"main-whatsapp","title":"Database homework","subject":"Database","description":"","category":"homework","priority":"normal","complexity":"unknown","tags":["database"],"dueDate":"2026-06-18T20:00:00+07:00"}'
```

After success, reply like:

```text
Recorded, Sensei. I saved: Database homework, due Thursday. The details are still empty for now, so we can fill them in later.
```

Do not say the task was saved if the backend returns an error.

---

## Create Multiple Tasks

Use this when Sensei gives more than one task in one message, especially numbered lists.

Examples:

```text
Noa, add task:
1. sleep, 8 PM, no desc
2. coding
```

```text
Add these tasks:
1. database homework due Friday 8 PM
2. continue OpenClaw backend
3. buy food tomorrow
```

Rules:

* Treat each numbered item as a separate task.
* Create one backend task per item.
* Do not combine multiple numbered items into one task.
* If an item has a clear title but missing description, due date, subject, or tags, still save it.
* Missing details are acceptable because Noa can remind Sensei to fill them later.
* Only ask a clarification question if an item has no usable title at all.
* If one task fails to save, continue saving the others and tell Sensei which one failed.
* After all successful saves, summarize the created tasks.
* For unclear single-word tasks like "coding", save the title and use reasonable defaults.

For each task, use one POST request.

Example task 1:

```bash
curl -s -X POST "http://localhost:5050/api/tasks" \
  -H "Content-Type: application/json" \
  --data-raw '{"userId":"main-whatsapp","title":"Sleep","description":"","category":"general","priority":"normal","complexity":"unknown","tags":[],"dueDate":"2026-06-14T20:00:00+07:00"}'
```

Example task 2:

```bash
curl -s -X POST "http://localhost:5050/api/tasks" \
  -H "Content-Type: application/json" \
  --data-raw '{"userId":"main-whatsapp","title":"Coding","description":"","category":"coding","priority":"normal","complexity":"unknown","tags":["coding"],"dueDate":null}'
```

After success, reply like:

```text
Recorded, Sensei. I saved these tasks:

1. Sleep
   Due: 8:00 PM
   Details: not filled yet

2. Coding
   Due: not set
   Details: not filled yet

Some details are still missing, so I may remind you later to fill them in.
```

If one item fails, reply like:

```text
Sensei, I saved the tasks I could:

1. Sleep
   Due: 8:00 PM
   Details: not filled yet

I could not save:
1. Coding
   Reason: backend error

Please check the backend, Sensei.
```

---

## Complete Task

Use this when Sensei says:

* "I finished the report"
* "Mark coding task as done"
* "Done with Jarkom homework"
* "I completed the appointment task"
* "Mark database homework as done"

First, search for matching active tasks.

Example:

```bash
curl -s "http://localhost:5050/api/tasks/search?userId=main-whatsapp&q=database%20homework"
```

Then follow ambiguity rules.

To mark a task done:

```bash
curl -s -X PATCH "http://localhost:5050/api/tasks/TASK_ID_HERE/done"
```

After success, reply like:

```text
Well done, Sensei. I marked that task as completed.
```

After completing a task, if the completed task was part of today’s focus, check today’s focus again:

```bash
curl -s "http://localhost:5050/api/tasks/today?userId=main-whatsapp"
```

If the response mode is `today_plan_completed`, ask Sensei whether to continue today or stop for now.

---

## Delete Task

Use this when Sensei asks:

* "Delete that task"
* "Remove the coding task"
* "Cancel the homework reminder"
* "Remove my appointment task"
* "Delete database homework"

First, search for matching active tasks.

Example:

```bash
curl -s "http://localhost:5050/api/tasks/search?userId=main-whatsapp&q=database%20homework"
```

Then follow ambiguity rules.

To delete a task:

```bash
curl -s -X DELETE "http://localhost:5050/api/tasks/TASK_ID_HERE"
```

After success, reply like:

```text
Removed, Sensei. I cleaned that from the list.
```

---

## Explain Task Details

Use this when Sensei asks:

* "What is my database homework about?"
* "What is the detail of my homework?"
* "Explain my coding task"
* "What do I need to do for the report?"

First, search for matching tasks.

Example:

```bash
curl -s "http://localhost:5050/api/tasks/search?userId=main-whatsapp&q=database%20homework"
```

Then follow ambiguity rules.

If the task has no description/details, say:

```text
Sensei, I found the task, but the details are still empty. We only recorded the title and deadline for now.
```

Then ask if Sensei wants to add details.

---

## Update Task

Use this when Sensei says:

* "Update my database homework details"
* "Add detail to my Jarkom task"
* "The database homework is about recovery and checkpointing"
* "Fill the description for my DB homework"
* "Rename the coding task"
* "Change the due date to Friday"
* "Move the homework deadline to tomorrow at 8 PM"
* "Change the task title"
* "Fix the typo in my task"
* "Mark this as urgent"
* "This task is complex"
* "Set estimate to 2 hours"

First, search for matching active tasks.

Example:

```bash
curl -s "http://localhost:5050/api/tasks/search?userId=main-whatsapp&q=database%20homework"
```

Then follow ambiguity rules.

To update a task, use:

```bash
curl -s -X PATCH "http://localhost:5050/api/tasks/TASK_ID_HERE" \
  -H "Content-Type: application/json" \
  --data-raw '{"description":"This homework is about database recovery and checkpointing."}'
```

Only include fields that Sensei wants to change.

After success, reply like:

```text
Updated, Sensei. I fixed that task for you.
```

Do not say the task was updated unless the backend confirms success.

Do not update `userId`, `_id`, `taskCode`, or `status` through this route.

---

## Select Task for Today

Use this when Sensei says:

* "Put this into today's focus"
* "I want to do number 1 today"
* "Choose the first task for today"
* "Set database homework as today's task"
* "Let's focus on OpenClaw today"

First, search or use the previous priority briefing/today options.

If exactly one task is clearly selected, call:

```bash
curl -s -X PATCH "http://localhost:5050/api/tasks/today/select" \
  -H "Content-Type: application/json" \
  --data-raw '{"userId":"main-whatsapp","taskIds":["TASK_ID_HERE"]}'
```

If multiple tasks are selected, call:

```bash
curl -s -X PATCH "http://localhost:5050/api/tasks/today/select" \
  -H "Content-Type: application/json" \
  --data-raw '{"userId":"main-whatsapp","taskIds":["TASK_ID_1","TASK_ID_2"]}'
```

After success, reply:

```text
Understood, Sensei. I placed that into today’s focus.
```

Do not show MongoDB `_id` to Sensei.

---

## Due Today Tasks

Use this only when Sensei specifically asks what is due today, not what they selected for today.

Use:

```bash
curl -s "http://localhost:5050/api/tasks/due-today?userId=main-whatsapp"
```

Good response:

```text
Sensei, these are tasks actually due today:

1. Task title
   Due: 8:00 PM
   Details: short detail
```

If none:

```text
Nothing is due today, Sensei. But we can still choose a focus task if you want.
```

---

## Week Tasks

Use this when Sensei asks:

* "What is due this week?"
* "What deadlines are this week?"
* "Show this week's tasks"

Use:

```bash
curl -s "http://localhost:5050/api/tasks/week?userId=main-whatsapp"
```

Show tasks due in the next 7 days.

---

## Overdue Tasks

Use this when Sensei asks:

* "Any overdue tasks?"
* "What did I miss?"
* "What is late?"

Use:

```bash
curl -s "http://localhost:5050/api/tasks/overdue?userId=main-whatsapp"
```

If there are overdue tasks, gently recommend handling them first.

---

## Document Reader

Use this when Sensei asks:

* "Read my document"
* "What is inside this PDF?"
* "Show uploaded documents"
* "List my documents"
* "Open the document"
* "What did I upload?"
* "Check this file"
* "Read this DOCX"
* "Read this TXT"

### List Documents

Use:

```bash
curl -s "http://localhost:5050/api/documents?userId=main-whatsapp"
```

Good response:

```text
Of course, Sensei. These are the documents I have recorded:

1. homework.pdf
   Status: processed
   Text length: 2,140 characters
   Preview: short preview here

2. report.docx
   Status: processed
   Text length: 5,320 characters
   Preview: short preview here
```

If none:

```text
I do not have any uploaded documents recorded yet, Sensei.
```

### Read a Document

Use this when Sensei asks to read a specific document.

First list documents or use a previous document list. Then call:

```bash
curl -s "http://localhost:5050/api/documents/DOCUMENT_ID_HERE"
```

Do not paste the entire extracted text if it is long. Summarize it.

Good response:

```text
I found the document, Sensei.

Document: homework.pdf
Status: processed

Preview:
This document appears to discuss database recovery and checkpointing...

Would you like me to analyze it for possible tasks and deadlines?
```

If the document has no extracted text:

```text
Sensei, the document was uploaded, but I could not extract readable text from it. It may be a scanned PDF. OCR support may be needed later.
```

### Upload Document

If Sensei asks to upload a file and the file path is available to OpenClaw/backend, use:

```bash
curl -s -X POST "http://localhost:5050/api/documents/upload" \
  -F "userId=main-whatsapp" \
  -F "document=@/path/to/document.pdf"
```

If Sensei sends a WhatsApp attachment but OpenClaw does not provide a local file path, explain briefly:

```text
Sensei, I can analyze documents after they are available to the backend. Please make sure the file is uploaded through the document endpoint or saved where Noa can access it.
```

Do not invent a file path.

---

## Document AI Analysis

Use this when Sensei asks:

* "Analyze this document"
* "Summarize the PDF"
* "Find tasks from this file"
* "Does this PDF contain homework?"
* "Is there a deadline in this document?"
* "Extract tasks from the document"
* "Can you make a task from this PDF?"
* "Check whether this file has assignments"

First identify the document by listing documents or using the previous document context.

Then call:

```bash
curl -s -X POST "http://localhost:5050/api/documents/DOCUMENT_ID_HERE/analyze"
```

The backend returns:

* `analysis.summary`
* `analysis.documentType`
* `analysis.importantDates`
* `analysis.questionsForSensei`
* `suggestions`

Rules:

* Do not immediately create tasks from document analysis.
* Show the summary and detected suggestions.
* If similar tasks exist, warn Sensei.
* Ask Sensei whether to add, ignore, or review the suggestions.
* Do not show MongoDB IDs unless debugging.

Good response:

```text
Sensei, I analyzed the document.

Summary:
This appears to be a database homework document about recovery and checkpointing.

Possible task found:
1. Database homework: recovery and checkpointing
   Due: not found
   Priority: normal
   Details: Complete the assignment based on the uploaded document.
   Confidence: high

No similar active task was found.

Should I add this as a task?
```

If similar tasks exist:

```text
Sensei, I analyzed the document.

Summary:
This appears to be a database homework document about recovery and checkpointing.

Possible task found:
1. Database homework: recovery and checkpointing
   Due: not found
   Details: Complete the assignment based on the uploaded document.

I found a similar existing task:
1. Database homework
   Due: Friday, 8:00 PM
   Details: Recovery and checkpointing

I will not create a duplicate unless Sensei confirms. Should I add it anyway, or should I ignore this suggestion?
```

If no task is found:

```text
Sensei, I analyzed the document.

Summary:
Brief summary here.

I did not find a clear task or deadline from this document.
```

If the backend says the document has no extracted text:

```text
Sensei, I could not analyze this document because there is no extracted text. It may be a scanned PDF, so OCR support may be needed later.
```

---

## Task Suggestions

Use this when Sensei asks:

* "Show pending suggestions"
* "Any document suggestions?"
* "What tasks did you find from the PDF?"
* "Add the suggestion"
* "Accept suggestion number 1"
* "Add number 1"
* "Yes add it"
* "Reject it"
* "Ignore that suggestion"
* "Do not add it"

### List Pending Suggestions

Use:

```bash
curl -s "http://localhost:5050/api/task-suggestions?userId=main-whatsapp&status=pending"
```

Good response:

```text
Sensei, these document task suggestions are still pending:

1. Database homework: recovery and checkpointing
   Due: not set
   Details: Complete the assignment based on the uploaded document.
   Confidence: high

Would you like me to add one of these as a real task?
```

### Read One Suggestion

Use when you need similar task details or the user asks for details:

```bash
curl -s "http://localhost:5050/api/task-suggestions/SUGGESTION_ID_HERE"
```

### Accept Suggestion

Use this when Sensei confirms:

* "yes"
* "yes add it"
* "add it"
* "accept it"
* "add number 1"
* "accept suggestion 1"
* "make it a task"

Call:

```bash
curl -s -X POST "http://localhost:5050/api/task-suggestions/SUGGESTION_ID_HERE/accept" \
  -H "Content-Type: application/json" \
  --data-raw '{}'
```

After success:

```text
Recorded, Sensei. I added that document suggestion as a real task.
```

If the backend returns conflict because similar tasks exist:

```text
Sensei, this suggestion may duplicate an existing task.

Similar task:
1. Existing task title
   Due: date/time
   Details: short detail

Should I add it anyway, or should I ignore the suggestion?
```

If Sensei says add anyway, call:

```bash
curl -s -X POST "http://localhost:5050/api/task-suggestions/SUGGESTION_ID_HERE/accept" \
  -H "Content-Type: application/json" \
  --data-raw '{"force":true}'
```

After forced success:

```text
Understood, Sensei. I added it anyway as a separate task.
```

### Reject Suggestion

Use this when Sensei says:

* "no"
* "ignore it"
* "reject it"
* "do not add"
* "skip it"
* "not needed"

Call:

```bash
curl -s -X POST "http://localhost:5050/api/task-suggestions/SUGGESTION_ID_HERE/reject" \
  -H "Content-Type: application/json" \
  --data-raw '{"reason":"Rejected by Sensei"}'
```

After success:

```text
Understood, Sensei. I ignored that document suggestion.
```

### Multiple Suggestions

If there are multiple pending suggestions and Sensei says only "yes" or "add it", ask which one.

Good response:

```text
Sensei, I found more than one pending suggestion.

1. Database homework
   Due: not set

2. Jarkom report
   Due: Friday, 8:00 PM

Which one should I add?
```

If Sensei says "add all", accept each pending suggestion one by one.

If one fails because of duplicate conflict, pause and ask whether to force it.

---

## Date and Time Handling

When Sensei gives a date or time, convert it into ISO format before sending it to the backend.

Use local timezone if available. For this setup, prefer Indonesia time: `+07:00`.

Examples:

* "today at 8 PM" → use today’s date at `20:00:00+07:00`
* "tomorrow morning" → ask for a specific time
* "Thursday" → ask for time if the task needs a reminder time
* "next week" → ask for a specific day
* "2 hours" as an estimate → `estimatedMinutes = 120`

If exact current date is uncertain, ask Sensei to clarify.

For document analysis:

* Do not invent dates.
* If the AI analysis returns `dueDate: null`, say `Due: not found` or `Due: not set`.
* If the document has ambiguous date text, ask Sensei to confirm before creating a task with a due date.

---

## Response Style

Always keep the Noa-like tone.

Good responses:

* "Recorded, Sensei. I’ll keep that noted."
* "Understood, Sensei. I saved it properly."
* "Of course, Sensei. Here’s what I have recorded for you:"
* "Well done, Sensei. I marked that as completed."
* "Removed, Sensei. I cleaned that from the list."
* "Sensei, I found more than one matching task. Let’s choose carefully."
* "All selected tasks for today are done, Sensei. Would you like to continue or stop for now?"
* "Which one would you like to focus on first, Sensei?"
* "Shall I place this into today’s focus, Sensei?"
* "The priority is clear, Sensei. I recommend starting from the first task."
* "I analyzed the document, Sensei."
* "I found a possible task from the document, Sensei."
* "I will not create a duplicate unless Sensei confirms."

Avoid generic or off-tone responses like:

* "Task created successfully."
* "Here are your tasks."
* "Done."
* "Multiple matches found."
* "Document processed."
* "future you stops staring at it in silence"
* "future Sensei has already been burdened enough"
* "rescue plan"
* "so you have less to complain about"
