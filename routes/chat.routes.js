const express = require('express');
const requireUser = require('../middleware/requireUser');
const { sendChatMessage } = require('../services/chat.service');
const { sqlAll } = require('../db/database');

const router = express.Router();

// -------------------- Chat page --------------------

router.get('/chat', requireUser, async (req, res, next) => {
  try {
    const userId = req.session.user.id;

    const models = await sqlAll(
      `SELECT
          ai.ai_id,
          ai.name,
          ai.model_ref,
          ai.welcome_message,
          ai.is_public,
          u.username AS owner_username
       FROM ai_llms ai
       JOIN users u ON u.user_id = ai.user_id
       WHERE (ai.user_id = ? OR ai.is_public = 1)
         AND ai.provider = 'ollama'
       ORDER BY
          CASE WHEN ai.user_id = ? THEN 0 ELSE 1 END,
          ai.name`,
      [userId, userId]
    );

    const sessions = await sqlAll(
      `SELECT session_id, ai_id, title, updated_at
       FROM chat_sessions
       WHERE user_id = ?
       ORDER BY updated_at DESC
       LIMIT 30`,
      [userId]
    );

    return res.render('chat', {
      models,
      sessions,
      message: req.session.message || null
    });
  } catch (err) {
    return next(err);
  }
});

// -------------------- Send a chat message --------------------

router.post('/chat', requireUser, async (req, res) => {
  const aiId = Number(req.body.ai_id);
  const prompt = String(req.body.prompt || '').trim();

  const requestedSessionId =
    Number(req.body.session_id) || null;

  if (!Number.isInteger(aiId) || aiId <= 0 || !prompt) {
    return res.status(400).json({
      error: 'Select a model and enter a prompt.'
    });
  }

  if (prompt.length > 10000) {
    return res.status(400).json({
      error: 'Prompt must be 10,000 characters or fewer.'
    });
  }

  try {
    const result = await sendChatMessage({
      userId: req.session.user.id,
      aiId,
      prompt,
      requestedSessionId
    });

    return res.json(result);
  } catch (err) {
    console.error('Chat error:', err);

    return res.status(err.status || 500).json({
      error: err.status && err.status < 500
        ? err.message
        : 'Could not generate a response. Check Ollama and the server logs.'
    });
  }
});

module.exports = router;