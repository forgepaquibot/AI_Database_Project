const {
  ensureEmbeddingModel,
  EMBEDDING_MODEL,
  OLLAMA_BASE_URL
} = require('./ollama.service');

async function getEmbeddings(texts) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }

  await ensureEmbeddingModel();

  const response = await fetch(
    `${OLLAMA_BASE_URL}/api/embed`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts
      })
    }
  );

  if (!response.ok) {
    throw new Error(
      `Ollama embedding request failed: HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (
    !Array.isArray(data.embeddings) ||
    data.embeddings.length !== texts.length
  ) {
    throw new Error(
      'Ollama returned an unexpected embedding response.'
    );
  }

  return data.embeddings;
}

function cosineSimilarity(a, b) {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    !a.length ||
    a.length !== b.length
  ) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (!normA || !normB) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = {
  getEmbeddings,
  cosineSimilarity,
  EMBEDDING_MODEL
};