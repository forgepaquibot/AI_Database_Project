const { sqlAll } = require('../db/database');

const {
  getEmbeddings,
  cosineSimilarity,
  EMBEDDING_MODEL
} = require('./embeddings.service');

async function retrieveRelevantItems({
  aiId,
  userId,
  prompt,
  limit = 5
}) {
  const candidates = await sqlAll(
    `SELECT DISTINCT
            ri.item_id,
            ri.content_text,
            re.embedding_json,
            re.dimensions,
            dr.title AS resource_title,
            re.embedding_model
       FROM model_resource_links mrl
       JOIN data_resources dr
         ON dr.resource_id = mrl.resource_id
       JOIN resource_items ri
         ON ri.resource_id = dr.resource_id
       JOIN resource_embeddings re
         ON re.item_id = ri.item_id
      WHERE mrl.ai_id = ?
        AND mrl.user_id = ?
        AND mrl.is_enabled = 1
        AND dr.processing_status = 'ready'
        AND ri.content_text IS NOT NULL
        AND re.embedding_model = ?
        AND (dr.user_id = ? OR dr.is_public = 1)`,
    [aiId, userId, EMBEDDING_MODEL, userId]
  );

  if (!candidates.length) return [];

  const [questionVector] = await getEmbeddings([prompt]);

  return candidates
    .map(row => {
      let vector;

      try {
        vector = JSON.parse(row.embedding_json);
      } catch {
        vector = [];
      }

      return {
        ...row,
        score: cosineSimilarity(questionVector, vector)
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function buildResourceContext(items) {
  return items
    .map(
      (item, index) =>
        `[Source ${index + 1}: ${item.resource_title}]\n${item.content_text}`
    )
    .join('\n\n');
}

module.exports = {
  retrieveRelevantItems,
  buildResourceContext
};