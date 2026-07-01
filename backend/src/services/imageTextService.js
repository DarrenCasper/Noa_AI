const fs = require("fs/promises");
const path = require("path");
const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getMimeTypeFromExtension(filePath) {
  const extension = path.extname(filePath || "").toLowerCase();

  const map = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };

  return map[extension] || "";
}

function normalizeText(text) {
  if (!text) return "";

  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function imageFileToDataUrl(file) {
  const mimeType =
    file.mimetype && file.mimetype.startsWith("image/")
      ? file.mimetype
      : getMimeTypeFromExtension(file.path || file.originalname || "");

  if (!mimeType || !mimeType.startsWith("image/")) {
    throw new Error("Unsupported image type. Use JPG, JPEG, PNG, or WEBP.");
  }

  const buffer = await fs.readFile(file.path);
  const base64 = buffer.toString("base64");

  return `data:${mimeType};base64,${base64}`;
}

async function extractTextFromImage(file) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set in .env");
  }

  const model =
    process.env.OPENAI_VISION_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4.1-mini";

  const imageDataUrl = await imageFileToDataUrl(file);

  const prompt = `
You are Noa, a calm assistant for Sensei.

Always respond in English.
Analyze this image as part of Noa's document reader.

Your job:
1. Read visible text from the image as accurately as possible.
2. Summarize what the image is about.
3. Detect if it contains an assignment, homework, project task, announcement, schedule, deadline, or action item.
4. If the image is only lecture notes or study material, say that clearly.
5. If the image is blurry, cropped, rotated, handwritten, or unclear, mention uncertainty.
6. Do not invent deadlines.
7. Do not create a task. Only extract information.

Return plain text in this exact structure:

Image analysis:

Visible text:
[transcribe visible text here. If none is readable, write "No clearly readable text found."]

Image summary:
[short summary]

Detected dates or deadlines:
[list dates/deadlines if clearly visible. If none, write "No clear deadline found."]

Possible action items:
[list possible tasks/actions if visible. If none, write "No clear action item found."]

Uncertainty:
[mention if text is blurry/cropped/unclear, otherwise write "No major uncertainty."]
`;

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt,
          },
          {
            type: "input_image",
            image_url: imageDataUrl,
          },
        ],
      },
    ],
  });

  return normalizeText(response.output_text || "");
}

module.exports = {
  extractTextFromImage,
};