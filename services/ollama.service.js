const {
  OLLAMA_BASE_URL,
  EMBEDDING_MODEL
} = require('../config/app-config');

async function getOllamaModels() {
  const response = await fetch(
    `${OLLAMA_BASE_URL}/api/tags`
  );

  if (!response.ok) {
    throw new Error(
      `Ollama returned HTTP ${response.status}`
    );
  }

  const data = await response.json();
  return data.models || [];
}

let embeddingModelReady = false;
let embeddingModelSetupPromise = null;

async function ensureEmbeddingModel() {
  if (embeddingModelReady) return;

  if (!embeddingModelSetupPromise) {
    embeddingModelSetupPromise = (async () => {
      let models = await getOllamaModels();

      const isInstalled = () => models.some(
        model => (model.name || model.model) === EMBEDDING_MODEL
      );

      if (!isInstalled()) {
        console.log(
          `Installing app-managed embedding model: ${EMBEDDING_MODEL}`
        );

        const response = await fetch(
          `${OLLAMA_BASE_URL}/api/pull`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: EMBEDDING_MODEL,
              stream: false
            })
          }
        );

        if (!response.ok) {
          const details = await response.text();

          throw new Error(
            `Could not install embedding model: HTTP ${response.status}. ${details}`
          );
        }

        const result = await response.json();

        if (result.status && result.status !== 'success') {
          throw new Error(
            `Embedding model installation did not complete: ${result.status}`
          );
        }

        models = await getOllamaModels();

        if (!isInstalled()) {
          throw new Error(
            'Embedding model installation could not be verified.'
          );
        }

        console.log(
          `Embedding model ready: ${EMBEDDING_MODEL}`
        );
      }

      embeddingModelReady = true;
    })();
  }

  try {
    await embeddingModelSetupPromise;
  } finally {
    embeddingModelSetupPromise = null;
  }
}

async function createChatCompletion({ model, messages, options }) {
  const response = await fetch(
    `${OLLAMA_BASE_URL}/api/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages,
        ...(options ? { options } : {})
      })
    }
  );

  if (!response.ok) {
    const details = await response.text();

    throw new Error(
      `Ollama chat request failed: HTTP ${response.status}. ` +
      details.slice(0, 400)
    );
  }

  const result = await response.json();
  return String(result.message?.content || '');
}

module.exports = {
  getOllamaModels,
  ensureEmbeddingModel,
  createChatCompletion,
  OLLAMA_BASE_URL,
  EMBEDDING_MODEL
};