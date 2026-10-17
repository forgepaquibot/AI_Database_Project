const express = require('express');
const requireUser = require('../middleware/requireUser');

const { sqlGet, sqlAll, sqlRun } = require('../db/database');

const {
  EMBEDDING_MODEL,
  getOllamaModels
} = require('../services/ollama.service');

const {
  mapResourceForTemplate,
  createResourceItems,
  saveResourceIndex
} = require('../services/resource-processing.service');

const {
  getAccessibleModel,
  getAccessibleResource
} = require('../services/model-registry.service');

const router = express.Router();

router.get('/ai_model', requireUser, async (req, res) => {
  const userId = req.session.user.id;

  let message = req.session.message || null;
  req.session.message = null;

  let ollamaModels = [];

  try {
    const installedModels = await getOllamaModels();

    ollamaModels = installedModels.filter(
      model => (model.name || model.model) !== EMBEDDING_MODEL
    );
  } catch (err) {
    console.error('Ollama connection error:', err.message);

    message = message ||
      'Could not connect to Ollama. Check that Ollama is running.';
  }

  try {
    const models = await sqlAll(
      `SELECT ai.*, u.username AS owner_username
         FROM ai_llms ai
         JOIN users u ON u.user_id = ai.user_id
        WHERE ai.user_id = ? OR ai.is_public = 1
        ORDER BY CASE WHEN ai.user_id = ? THEN 0 ELSE 1 END,
                 ai.ai_id DESC`,
      [userId, userId]
    );

    const rawResources = await sqlAll(
      `SELECT dr.*, u.username AS owner_username
         FROM data_resources dr
         JOIN users u ON u.user_id = dr.user_id
        WHERE dr.user_id = ? OR dr.is_public = 1
        ORDER BY CASE WHEN dr.user_id = ? THEN 0 ELSE 1 END,
                 dr.resource_id DESC`,
      [userId, userId]
    );

    const resources = rawResources.map(mapResourceForTemplate);

    const ownedResources = resources.filter(
      resource => resource.user_id === userId
    );

    const readyResources = resources.filter(
      resource => resource.processing_status === 'ready'
    );

    const processingJobs = await sqlAll(
      `SELECT rpj.*, dr.title AS resource_title,
              dr.resource_type
         FROM resource_processing_jobs rpj
         JOIN data_resources dr
           ON dr.resource_id = rpj.resource_id
        WHERE rpj.requested_by = ?
        ORDER BY rpj.processing_job_id DESC
        LIMIT 20`,
      [userId]
    );

    return res.render('ai_model', {
      models,
      ollamaModels,
      resources,
      ownedResources,
      readyResources,
      processingJobs,
      jobs: [],
      message
    });
  } catch (err) {
    console.error('AI Model Hub error:', err);

    return res.status(500).send(
      'Could not load the AI Model Hub. Check that the database matches your generalized schema.'
    );
  }
});

router.post('/register_ollama_model', requireUser, async (req, res) => {
  const userId = req.session.user.id;

  const modelRef = String(req.body.model_ref || '').trim();
  const name = String(req.body.name || modelRef).trim();
  const description = String(req.body.description || '').trim();

  const isPublic = req.body.is_public === '1' ? 1 : 0;

  if (!modelRef || !name) {
    req.session.message =
      'Choose an installed model and provide a name.';

    return res.redirect('/ai_model');
  }

  if (modelRef === EMBEDDING_MODEL) {
    req.session.message =
      'The system embedding model cannot be registered as a chat model.';

    return res.redirect('/ai_model');
  }

  try {
    const installedModels = await getOllamaModels();

    const found = installedModels.find(
      model => (model.name || model.model) === modelRef
    );

    if (!found) {
      throw new Error(
        'That model is not installed in Ollama. Pull it first.'
      );
    }

    await sqlRun(
      `INSERT INTO ai_llms
         (name, description, provider, model_ref, model_format,
          model_digest, model_origin, is_public, user_id)
       VALUES (?, ?, 'ollama', ?, ?, ?, 'registered', ?, ?)`,
      [
        name,
        description || null,
        modelRef,
        found.details?.format || null,
        found.digest || null,
        isPublic,
        userId
      ]
    );

    req.session.message = isPublic
      ? 'Ollama model registered as public. Other users can use it through this Ollama server.'
      : 'Ollama model registered as private.';
  } catch (err) {
    console.error('Model registration error:', err.message);

    req.session.message = err.message.includes('UNIQUE')
      ? 'You have already registered that model.'
      : err.message === 'That model is not installed in Ollama. Pull it first.'
        ? err.message
        : 'Model registration failed. Check Ollama and your database schema.';
  }

  return res.redirect('/ai_model');
});

router.post('/process_resource', requireUser, async (req, res) => {
  const userId = req.session.user.id;

  const aiId = Number(req.body.ai_id);
  const resourceId = Number(req.body.resource_id);

  let jobId = null;

  try {
    if (
      !Number.isInteger(aiId) ||
      aiId <= 0 ||
      !Number.isInteger(resourceId) ||
      resourceId <= 0
    ) {
      throw new Error('Select a valid model and resource.');
    }

    const model = await getAccessibleModel(aiId, userId);

    if (!model || model.provider !== 'ollama') {
      throw new Error('Model not found or access denied.');
    }

    const resource = await getAccessibleResource(resourceId, userId);

    if (!resource) {
      throw new Error('Resource not found or access denied.');
    }

    if (resource.user_id !== userId) {
      throw new Error(
        'Only the resource owner can process or re-index this resource.'
      );
    }

    const job = await sqlRun(
      `INSERT INTO resource_processing_jobs
         (resource_id, requested_by, operation, status, progress_percent)
       VALUES (?, ?, 'index', 'running', 0)`,
      [resourceId, userId]
    );

    jobId = job.lastID;

    await sqlRun(
      "UPDATE data_resources SET processing_status = 'processing' WHERE resource_id = ?",
      [resourceId]
    );

    await sqlRun(
      'UPDATE resource_processing_jobs SET started_at = CURRENT_TIMESTAMP WHERE processing_job_id = ?',
      [jobId]
    );

    const items = await createResourceItems(resource);

    const embedTextItems = items.filter(
      item => item.content_text &&
        item.content_text.trim() &&
        !item.imported_vector
    );

    await sqlRun(
      'UPDATE resource_processing_jobs SET progress_percent = 40 WHERE processing_job_id = ?',
      [jobId]
    );

    await saveResourceIndex(resource, items);

    await sqlRun(
      `INSERT INTO model_resource_links
         (ai_id, resource_id, user_id, is_enabled)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(ai_id, resource_id, user_id)
       DO UPDATE SET is_enabled = 1`,
      [aiId, resourceId, userId]
    );

    await sqlRun(
      `UPDATE resource_processing_jobs
          SET status = 'done',
              progress_percent = 100,
              completed_at = CURRENT_TIMESTAMP
        WHERE processing_job_id = ?`,
      [jobId]
    );

    req.session.message =
      `Resource indexed successfully (${items.length} records; ` +
      `${embedTextItems.length} text items prepared) and linked to ${model.name}.`;
  } catch (err) {
    console.error('Resource processing error:', err);

    if (jobId !== null) {
      try {
        await sqlRun(
          `UPDATE resource_processing_jobs
              SET status = 'failed',
                  completed_at = CURRENT_TIMESTAMP,
                  error_message = ?
            WHERE processing_job_id = ?`,
          [String(err.message).slice(0, 1000), jobId]
        );
      } catch (updateErr) {
        console.error(
          'Could not update processing job:',
          updateErr
        );
      }
    }

    if (Number.isInteger(resourceId) && resourceId > 0) {
      try {
        const ownerResource = await sqlGet(
          'SELECT resource_id, user_id FROM data_resources WHERE resource_id = ?',
          [resourceId]
        );

        if (
          ownerResource &&
          ownerResource.user_id === userId
        ) {
          await sqlRun(
            "UPDATE data_resources SET processing_status = 'failed' WHERE resource_id = ?",
            [resourceId]
          );
        }
      } catch {
        // Preserve the original processing error.
      }
    }

    req.session.message =
      `Resource processing failed: ${err.message}`;
  }

  return res.redirect('/ai_model');
});

router.post('/link_resource', requireUser, async (req, res) => {
  const userId = req.session.user.id;

  const aiId = Number(req.body.ai_id);
  const resourceId = Number(req.body.resource_id);

  try {
    const model = await getAccessibleModel(aiId, userId);
    const resource = await getAccessibleResource(resourceId, userId);

    if (!model || model.provider !== 'ollama' || !resource) {
      throw new Error(
        'Model or resource not found, or access denied.'
      );
    }

    if (resource.processing_status !== 'ready') {
      throw new Error(
        'Process the resource before linking it to a model.'
      );
    }

    await sqlRun(
      `INSERT INTO model_resource_links
         (ai_id, resource_id, user_id, is_enabled)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(ai_id, resource_id, user_id)
       DO UPDATE SET is_enabled = 1`,
      [aiId, resourceId, userId]
    );

    req.session.message =
      'Resource linked to the selected model.';
  } catch (err) {
    req.session.message =
      `Could not link resource: ${err.message}`;
  }

  return res.redirect('/ai_model');
});

// -------------------- Individual model settings --------------------

// Display a model's details, personality settings, and available resources.
router.get('/models/:id', requireUser, async (req, res) => {
  const aiId = Number(req.params.id);
  const userId = req.session.user.id;

  if (!Number.isInteger(aiId) || aiId <= 0) {
    return res.status(404).render('errors/404', {
      message: 'Model not found.'
    });
  }

  try {
    const model = await getAccessibleModel(aiId, userId);

    if (!model) {
      return res.status(404).render('errors/404', {
        message: 'Model not found or access denied.'
      });
    }

    const isOwner = Number(model.user_id) === Number(userId);

    // Each user sees only resources they own or that are public.
    // Only indexed resources are offered for linking.
    const availableResources = await sqlAll(
      `SELECT
          dr.resource_id,
          dr.title,
          dr.resource_type,
          dr.is_public,
          CASE WHEN mrl.link_id IS NULL THEN 0 ELSE 1 END AS linked
       FROM data_resources dr
       LEFT JOIN model_resource_links mrl
         ON mrl.resource_id = dr.resource_id
        AND mrl.ai_id = ?
        AND mrl.user_id = ?
        AND mrl.is_enabled = 1
       WHERE (dr.user_id = ? OR dr.is_public = 1)
         AND dr.processing_status = 'ready'
       ORDER BY
         CASE WHEN dr.user_id = ? THEN 0 ELSE 1 END,
         dr.title COLLATE NOCASE`,
      [aiId, userId, userId, userId]
    );

    const linkedResources = availableResources.filter(
      resource => Number(resource.linked) === 1
    );

    const message = req.session.message || null;
    req.session.message = null;

    return res.render('model_detail', {
      title: 'Model Settings',
      model,
      isOwner,
      availableResources,
      linkedResources,
      message
    });
  } catch (err) {
    console.error('Model detail error:', err);

    return res.status(500).render('errors/500', {
      message: 'Could not load model settings.'
    });
  }
});


// Save model display name, description, personality, welcome message,
// and visibility. Only the owner can edit these settings.
router.post(
  '/models/:id/settings',
  requireUser,
  async (req, res) => {
    const aiId = Number(req.params.id);
    const userId = req.session.user.id;

    if (!Number.isInteger(aiId) || aiId <= 0) {
      return res.status(404).send('Model not found.');
    }

    try {
      const model = await getAccessibleModel(aiId, userId);

      if (!model) {
        return res.status(404).send(
          'Model not found or access denied.'
        );
      }

      if (Number(model.user_id) !== Number(userId)) {
        return res.status(403).send(
          'Only the model owner can change its settings.'
        );
      }

      const name = String(req.body.name || '').trim();
      const description = String(
        req.body.description || ''
      ).trim();

      const personality = String(
        req.body.personality_prompt || ''
      ).trim();

      const welcome = String(
        req.body.welcome_message || ''
      ).trim();

      const isPublic = req.body.is_public === '1' ? 1 : 0;

      if (!name) {
        req.session.message = 'The model name is required.';
        return res.redirect(`/models/${aiId}`);
      }

      if (
        name.length > 200 ||
        description.length > 2000 ||
        personality.length > 12000 ||
        welcome.length > 2000
      ) {
        req.session.message =
          'One or more fields exceed their allowed length.';

        return res.redirect(`/models/${aiId}`);
      }

      await sqlRun(
        `UPDATE ai_llms
            SET name = ?,
                description = ?,
                is_public = ?,
                personality_prompt = ?,
                welcome_message = ?
          WHERE ai_id = ?
            AND user_id = ?`,
        [
          name,
          description || null,
          isPublic,
          personality || null,
          welcome || null,
          aiId,
          userId
        ]
      );

      req.session.message = 'Model settings saved successfully.';

      return res.redirect(`/models/${aiId}`);
    } catch (err) {
      console.error('Model settings update error:', err);

      req.session.message =
        'Could not save model settings. Check the server logs.';

      return res.redirect(`/models/${aiId}`);
    }
  }
);


// Save the resources linked to this model for the current user.
// Resource links are user-specific, including when the model is public.
router.post(
  '/models/:id/resources',
  requireUser,
  async (req, res) => {
    const aiId = Number(req.params.id);
    const userId = req.session.user.id;

    if (!Number.isInteger(aiId) || aiId <= 0) {
      return res.status(404).send('Model not found.');
    }

    const rawIds = req.body.resource_ids;

    const resourceIds = [
      ...new Set(
        (Array.isArray(rawIds)
          ? rawIds
          : rawIds
            ? [rawIds]
            : []
        ).map(value => Number(value))
      )
    ];

    if (
      resourceIds.length > 500 ||
      resourceIds.some(
        id => !Number.isInteger(id) || id <= 0
      )
    ) {
      req.session.message = 'The resource selection is invalid.';
      return res.redirect(`/models/${aiId}`);
    }

    try {
      const model = await getAccessibleModel(aiId, userId);

      if (!model) {
        return res.status(404).send(
          'Model not found or access denied.'
        );
      }

      // Validate all selections before changing existing links.
      for (const resourceId of resourceIds) {
        const resource = await getAccessibleResource(
          resourceId,
          userId
        );

        if (
          !resource ||
          resource.processing_status !== 'ready'
        ) {
          req.session.message =
            'Every selected resource must be ready and accessible to you.';

          return res.redirect(`/models/${aiId}`);
        }
      }

      await sqlRun('BEGIN IMMEDIATE TRANSACTION');

      try {
        await sqlRun(
          `DELETE FROM model_resource_links
            WHERE ai_id = ?
              AND user_id = ?`,
          [aiId, userId]
        );

        for (const resourceId of resourceIds) {
          await sqlRun(
            `INSERT INTO model_resource_links
               (ai_id, resource_id, user_id, is_enabled)
             VALUES (?, ?, ?, 1)`,
            [aiId, resourceId, userId]
          );
        }

        await sqlRun('COMMIT');
      } catch (err) {
        try {
          await sqlRun('ROLLBACK');
        } catch {
          // Preserve the original database error.
        }

        throw err;
      }

      req.session.message = 'Your model resource links were saved.';

      return res.redirect(`/models/${aiId}`);
    } catch (err) {
      console.error('Model resource-link update error:', err);

      req.session.message =
        'Could not save resource links. Check the server logs.';

      return res.redirect(`/models/${aiId}`);
    }
  }
);

module.exports = router;