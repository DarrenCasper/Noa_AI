function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTokens(value) {
  const normalized = normalizeText(value);

  if (!normalized) return [];

  return normalized
    .split(" ")
    .filter((token) => token.length >= 3);
}

function jaccardSimilarity(a, b) {
  const tokensA = new Set(getTokens(a));
  const tokensB = new Set(getTokens(b));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;

  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }

  const union = new Set([...tokensA, ...tokensB]).size;

  return intersection / union;
}

function isSameDueDay(dateA, dateB) {
  if (!dateA || !dateB) return false;

  const a = new Date(dateA);
  const b = new Date(dateB);

  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getTaskSimilarityScore(suggestion, task) {
  let score = 0;

  const titleScore = jaccardSimilarity(suggestion.title, task.title);
  const descScore = jaccardSimilarity(
    suggestion.description,
    task.description
  );

  score += titleScore * 0.65;
  score += descScore * 0.2;

  if (
    suggestion.subject &&
    task.subject &&
    normalizeText(suggestion.subject) === normalizeText(task.subject)
  ) {
    score += 0.1;
  }

  if (suggestion.dueDate && task.dueDate && isSameDueDay(suggestion.dueDate, task.dueDate)) {
    score += 0.15;
  }

  return Math.min(score, 1);
}

function findSimilarTasks(suggestion, existingTasks, threshold = 0.45) {
  return existingTasks
    .map((task) => ({
      task,
      score: getTaskSimilarityScore(suggestion, task),
    }))
    .filter((item) => item.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  findSimilarTasks,
  getTaskSimilarityScore,
};