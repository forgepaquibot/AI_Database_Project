const { sqlGet } = require('../db/database');

async function getAccessibleModel(aiId, userId) {
  return sqlGet(
    `SELECT ai.*, u.username AS owner_username
       FROM ai_llms ai
       JOIN users u ON u.user_id = ai.user_id
      WHERE ai.ai_id = ?
        AND (ai.user_id = ? OR ai.is_public = 1)`,
    [aiId, userId]
  );
}

async function getAccessibleResource(resourceId, userId) {
  return sqlGet(
    `SELECT dr.*, u.username AS owner_username
       FROM data_resources dr
       JOIN users u ON u.user_id = dr.user_id
      WHERE dr.resource_id = ?
        AND (dr.user_id = ? OR dr.is_public = 1)`,
    [resourceId, userId]
  );
}

module.exports = {
  getAccessibleModel,
  getAccessibleResource
};