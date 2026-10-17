const express = require('express');
const requireUser = require('../middleware/requireUser');

const {
  getTrainingBase,
  getTrainingBases
} = require('./catalog');

function createTrainingApiRouter() {
  const router = express.Router();

  router.get('/compatibility', requireUser, (req, res) => {
    const modelRef = String(
      req.query.model_ref || ''
    ).trim();

    if (!modelRef) {
      return res.status(400).json({
        supported: false,
        message: 'A model reference is required.'
      });
    }

    try {
      const trainingBase = getTrainingBase(modelRef);

      if (!trainingBase) {
        return res.json({
          supported: false,
          message:
            'This model is not currently enabled for fine-tuning.'
        });
      }

      return res.json({
        supported: true,
        modelRef:
          trainingBase.ollamaModelRef ||
          trainingBase.modelRef,
        displayName: trainingBase.displayName,
        checkpointId: trainingBase.checkpointId,
        method: trainingBase.method
      });
    } catch (err) {
      console.error(
        'Training compatibility check failed:',
        err
      );

      return res.status(500).json({
        supported: false,
        message: 'Unable to check model compatibility.'
      });
    }
  });

  return router;
}

function createTrainingPageRouter() {
  const router = express.Router();

  router.get('/', requireUser, (req, res) => {
    const message = req.session.message || null;
    req.session.message = null;

    res.render('training', {
      bases: getTrainingBases({
        includeDisabled: true
      }),
      message
    });
  });

  return router;
}

module.exports = {
  createTrainingApiRouter,
  createTrainingPageRouter
};