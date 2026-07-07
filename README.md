# Noa AI

Noa AI is a self-hosted WhatsApp assistant backend designed to help manage tasks, reminders, uploaded documents, assignment checklists, and weekly planning.  
Noa is intended to behave like a calm personal secretary: it can record tasks, analyze files, extract possible assignments, create checklist-based workflows, and send reminders through OpenClaw/WhatsApp.

> Noa is inspired by the idea of a personal academic assistant. The backend is built to run locally or on a home server.

---

## Features

### Task Management

- Create, list, search, update, complete, and delete tasks.
- Store task metadata such as title, description, subject, tags, category, priority, complexity, due date, and planned focus date.
- Supports daily focus planning.
- Supports priority briefing based on urgency, deadline, priority, complexity, and checklist progress.

### Document and Image Reader

Noa can upload and process:

- PDF
- TXT
- MD
- DOCX
- JPG
- JPEG
- PNG
- WEBP

Uploaded files are stored as `Document` records and processed into extracted text or image-derived text/context.

### AI Document Analysis

Noa can analyze uploaded documents/images to detect:

- assignment instructions
- homework
- project requirements
- important dates
- possible deadlines
- study material
- suggested tasks

Detected tasks are stored first as pending suggestions, so Noa does not create real tasks until the user confirms.

### Pending Actions

Noa supports confirmation workflows such as:

- accept detected task
- reject detected task
- create study task
- create assignment checklist
- resolve checklist confirmation

This helps avoid accidental task creation from AI analysis.

### Study Task Mode

If a document looks like lecture notes or study material rather than an assignment, Noa can suggest a study task instead of creating a normal homework task.

### Document/Image Q&A

Noa can answer questions about uploaded documents/images, such as:

- “Explain this PDF.”
- “What should I study from this?”
- “What are the requirements?”
- “Where is the deadline mentioned?”
- “Make this easier to understand.”

### Auto Assignment Checklist

Noa can turn an uploaded assignment document/image into a checklist.

Example:

```text
Main task:
Submit Transaction Recovery Case Study

Checklist:
1. Read the assignment instructions
2. Identify the required concepts
3. Prepare the explanation section
4. Add examples
5. Review formatting
6. Submit the report
```

The checklist is saved directly inside the related task.

### Checklist Progress Management

Tasks can contain checklist items.

Supported actions include:

- show checklist
- add checklist item
- mark checklist item as done
- mark checklist item as pending again
- delete checklist item

### Checklist-Aware Reminders

Noa reminders can consider checklist progress.

Example reminder:

```text
Sensei, this task is due soon.

Database Recovery Assignment
Due: Friday, 20:00
Checklist: 2/7 done

Next checklist items:
1. Write the explanation section
2. Add the required example
3. Review formatting
```

### Weekly Planning Report

Noa can generate a weekly planning report based on:

- overdue tasks
- tasks due this week
- checklist risk
- missing task details
- unscheduled tasks
- suggested daily breakdown

### Browse/Search Endpoint

Noa has a backend browse/search endpoint that can call a web search provider such as Tavily. This is intended for current information, references, documentation lookup, or online research.

---

## Tech Stack

- Node.js
- Express
- MongoDB
- Mongoose
- OpenAI API
- Multer
- pdf-parse
- Mammoth
- node-cron
- dayjs
- OpenClaw for WhatsApp integration

---

## Project Structure

```text
Noa_AI/
└── backend/
    ├── src/
    │   ├── jobs/
    │   │   └── reminderJob.js
    │   ├── models/
    │   │   ├── Document.js
    │   │   ├── PendingAction.js
    │   │   ├── ReminderLog.js
    │   │   ├── Task.js
    │   │   └── TaskSuggestion.js
    │   ├── routes/
    │   │   ├── browseRoutes.js
    │   │   ├── documentRoutes.js
    │   │   ├── pendingActionRoutes.js
    │   │   ├── taskRoutes.js
    │   │   └── taskSuggestionRoutes.js
    │   ├── services/
    │   │   ├── assignmentChecklistService.js
    │   │   ├── browseSearchService.js
    │   │   ├── documentAiService.js
    │   │   ├── documentQaService.js
    │   │   ├── documentTextService.js
    │   │   ├── imageTextService.js
    │   │   ├── pendingActionService.js
    │   │   ├── studyTaskService.js
    │   │   ├── taskSimilarityService.js
    │   │   ├── weeklyPlanService.js
    │   │   └── whatsappService.js
    │   ├── db.js
    │   └── server.js
    ├── uploads/
    ├── package.json
    └── .env
```

---

## Requirements

Install these before running the backend:

- Node.js 18 or newer
- MongoDB
- npm
- OpenAI API key
- Optional: OpenClaw if using WhatsApp integration
- Optional: Tavily API key if using browse/search

---

## Installation

Clone the repository:

```bash
git clone https://github.com/DarrenCasper/Noa_AI.git
cd Noa_AI/backend
```

Install dependencies:

```bash
npm install
```

Create a `.env` file:

```bash
nano .env
```

Example `.env`:

```env
PORT=5050

MONGODB_URI=mongodb://127.0.0.1:27017/noa_ai

OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4.1-mini
OPENAI_VISION_MODEL=gpt-4.1-mini

APP_TZ=Asia/Jakarta
DEFAULT_USER_ID=main-whatsapp

ENABLE_REMINDER_JOB=false
ENABLE_WHATSAPP_SEND=false

WHATSAPP_TARGET=your_whatsapp_target_here
OPENCLAW_BIN=openclaw

ENABLE_BROWSE_SEARCH=false
BROWSE_SEARCH_PROVIDER=tavily
TAVILY_API_KEY=your_tavily_api_key_here
```

For local development, keep:

```env
ENABLE_REMINDER_JOB=false
ENABLE_WHATSAPP_SEND=false
```

For the production server, use:

```env
ENABLE_REMINDER_JOB=true
ENABLE_WHATSAPP_SEND=true
```

---

## Running the Backend

Development mode:

```bash
npm run dev
```

Production/simple mode:

```bash
npm start
```

The backend should run at:

```text
http://localhost:5050
```

Check health:

```bash
curl -s "http://localhost:5050/health"
```

Expected response:

```json
{
  "message": "Noa backend is running"
}
```

---

## Running with PM2

Install PM2 if needed:

```bash
sudo npm install -g pm2
```

Start the backend:

```bash
cd ~/Noa_AI/backend
pm2 start src/server.js --name noa-backend
pm2 save
```

Useful commands:

```bash
pm2 list
pm2 logs noa-backend
pm2 restart noa-backend --update-env
pm2 stop noa-backend
pm2 delete noa-backend
```

---

## API Overview

### Health

```http
GET /health
```

---

## Task API

### List Tasks

```http
GET /api/tasks?userId=main-whatsapp&status=all
```

### Search Tasks

```http
GET /api/tasks/search?userId=main-whatsapp&q=database%20homework
```

### Create Task

```http
POST /api/tasks
```

Example:

```bash
curl -s -X POST "http://localhost:5050/api/tasks" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "userId": "main-whatsapp",
    "title": "Database homework",
    "description": "Finish transaction recovery assignment",
    "category": "homework",
    "priority": "normal",
    "complexity": "medium",
    "dueDate": "2026-07-12T20:00:00+07:00"
  }'
```

### Update Task

```http
PATCH /api/tasks/:id
```

### Mark Task as Done

```http
PATCH /api/tasks/:id/done
```

### Delete Task

```http
DELETE /api/tasks/:id
```

### Priority Briefing

```http
GET /api/tasks/briefing?userId=main-whatsapp&limit=4
```

### Today Focus

```http
GET /api/tasks/today?userId=main-whatsapp
PATCH /api/tasks/today/select
PATCH /api/tasks/today/clear
```

### Due Today

```http
GET /api/tasks/due-today?userId=main-whatsapp
```

### This Week

```http
GET /api/tasks/week?userId=main-whatsapp
```

### Overdue

```http
GET /api/tasks/overdue?userId=main-whatsapp
```

### Weekly Plan

```http
GET /api/tasks/weekly-plan?userId=main-whatsapp
```

---

## Checklist API

### Show Checklist

```http
GET /api/tasks/:id/checklist?userId=main-whatsapp
```

### Add Checklist Item

```http
POST /api/tasks/:id/checklist
```

Example:

```bash
curl -s -X POST "http://localhost:5050/api/tasks/TASK_ID/checklist" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "userId": "main-whatsapp",
    "title": "Review formatting",
    "description": "Check final report formatting before submission"
  }'
```

### Mark Checklist Item Done

```http
PATCH /api/tasks/:id/checklist/:itemId/done
```

### Mark Checklist Item Pending

```http
PATCH /api/tasks/:id/checklist/:itemId/undone
```

### Delete Checklist Item

```http
DELETE /api/tasks/:id/checklist/:itemId
```

---

## Document API

### Upload Document or Image

```http
POST /api/documents/upload
```

Example:

```bash
curl -s -X POST "http://localhost:5050/api/documents/upload" \
  -F "userId=main-whatsapp" \
  -F "source=manual" \
  -F "document=@/path/to/assignment.pdf"
```

### List Documents

```http
GET /api/documents?userId=main-whatsapp
```

### Read Document

```http
GET /api/documents/:id
```

### Analyze Document

```http
POST /api/documents/:id/analyze
```

### Ask Question About Document

```http
POST /api/documents/:id/ask
```

Example:

```bash
curl -s -X POST "http://localhost:5050/api/documents/DOCUMENT_ID/ask" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "userId": "main-whatsapp",
    "question": "What are the important points from this PDF?"
  }'
```

### Generate Assignment Checklist

```http
POST /api/documents/:id/checklist
```

Example:

```bash
curl -s -X POST "http://localhost:5050/api/documents/DOCUMENT_ID/checklist" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "userId": "main-whatsapp"
  }'
```

---

## Pending Action API

### Get Current Pending Action

```http
GET /api/pending-actions/current?userId=main-whatsapp
```

### Resolve Pending Action

```http
POST /api/pending-actions/current/resolve
```

Accept:

```bash
curl -s -X POST "http://localhost:5050/api/pending-actions/current/resolve" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "userId": "main-whatsapp",
    "action": "accept"
  }'
```

Reject:

```bash
curl -s -X POST "http://localhost:5050/api/pending-actions/current/resolve" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "userId": "main-whatsapp",
    "action": "reject",
    "reason": "Rejected by user"
  }'
```

---

## Task Suggestion API

### List Pending Suggestions

```http
GET /api/task-suggestions?userId=main-whatsapp&status=pending
```

### Read Suggestion

```http
GET /api/task-suggestions/:id
```

### Accept Suggestion

```http
POST /api/task-suggestions/:id/accept
```

### Reject Suggestion

```http
POST /api/task-suggestions/:id/reject
```

---

## Browse/Search API

### Search the Web

```http
GET /api/browse/search?q=latest%20AI%20news&userId=main-whatsapp
```

or:

```http
POST /api/browse/search
```

Example:

```bash
curl -s -X POST "http://localhost:5050/api/browse/search" \
  -H "Content-Type: application/json" \
  --data-raw '{
    "userId": "main-whatsapp",
    "query": "latest AI news",
    "maxResults": 5
  }'
```

Requires:

```env
ENABLE_BROWSE_SEARCH=true
TAVILY_API_KEY=your_tavily_api_key_here
```

---

## WhatsApp and OpenClaw Integration

Noa is designed to be used from WhatsApp through OpenClaw.

Recommended production architecture:

```text
Ubuntu Server
├── OpenClaw / WhatsApp Gateway
├── Noa Backend on localhost:5050
├── MongoDB
└── uploads/documents
```

The assistant skill should call the local backend endpoints instead of answering task/document questions only from memory.

Common commands:

```bash
openclaw config validate
openclaw daemon restart
openclaw gateway restart
```

---

## Reminder System

Noa includes scheduled reminders using `node-cron`.

Reminder features include:

- morning briefing
- deadline preparation reminders
- urgent deadline reminders
- missing detail reminders
- priority attention reminders
- overdue reminders
- checklist-aware reminder messages
- weekly planning reminder, if configured in the job

To prevent accidental WhatsApp messages during development, use:

```env
ENABLE_REMINDER_JOB=false
ENABLE_WHATSAPP_SEND=false
```

---

## Example Workflow

### 1. Upload an Assignment

```bash
curl -s -X POST "http://localhost:5050/api/documents/upload" \
  -F "userId=main-whatsapp" \
  -F "source=manual" \
  -F "document=@assignment.pdf"
```

### 2. Generate Checklist

```bash
curl -s -X POST "http://localhost:5050/api/documents/DOCUMENT_ID/checklist" \
  -H "Content-Type: application/json" \
  --data-raw '{"userId":"main-whatsapp"}'
```

### 3. Accept Pending Checklist

```bash
curl -s -X POST "http://localhost:5050/api/pending-actions/current/resolve" \
  -H "Content-Type: application/json" \
  --data-raw '{"userId":"main-whatsapp","action":"accept"}'
```

### 4. Check Weekly Plan

```bash
curl -s "http://localhost:5050/api/tasks/weekly-plan?userId=main-whatsapp"
```

---

## Notes

- Do not commit `.env`.
- Do not commit `node_modules`.
- Do not commit uploaded user files in `uploads/`.
- Keep `ENABLE_WHATSAPP_SEND=false` during local development.
- Use `ENABLE_REMINDER_JOB=false` on development machines unless you intentionally want scheduled reminders.
- The WhatsApp call alarm experiment was skipped because OpenClaw call support may depend on version-specific or experimental configuration.

---

## Future Improvements

Possible next upgrades:

- Deterministic backend chat router
- Better browse/search routing
- Places/location endpoint
- Calendar integration
- Web dashboard
- Better document RAG using OpenAI file search/vector stores
- Multi-user support
- Authentication layer
- Docker Compose deployment
- More robust test suite

---

## License

This project currently uses the ISC license from the backend package configuration.
