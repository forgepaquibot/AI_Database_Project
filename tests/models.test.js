const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getTrainingBases,
  getTrainingBase
} = require('../training/catalog');

test('unverified fine-tuning models remain disabled', () => {
  const bases = getTrainingBases({
    includeDisabled: true
  });

  assert.ok(bases.length > 0);

  assert.ok(
    bases.every(base => base.enabled === false)
  );

  assert.equal(
    getTrainingBase(bases[0].ollamaModelRef),
    null
  );
});