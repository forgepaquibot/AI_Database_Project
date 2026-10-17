const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(
  __dirname,
  'training_bases.json'
);

function readCatalog() {
  const parsed = JSON.parse(
    fs.readFileSync(CATALOG_PATH, 'utf8')
  );

  if (!Array.isArray(parsed)) {
    throw new Error(
      'training_bases.json must contain a JSON array.'
    );
  }

  return parsed;
}

function getTrainingBases({ includeDisabled = false } = {}) {
  const bases = readCatalog();

  return includeDisabled
    ? bases
    : bases.filter(base => base.enabled === true);
}

function getTrainingBase(ollamaModelRef) {
  const modelRef = String(ollamaModelRef || '').trim();

  if (!modelRef) return null;

  return getTrainingBases().find(
    base =>
      base.ollamaModelRef === modelRef ||
      base.modelRef === modelRef
  ) || null;
}

module.exports = {
  getTrainingBases,
  getTrainingBase
};