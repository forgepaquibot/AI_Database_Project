const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getTrainingBase
} = require('../training/catalog');

test('blank model references are rejected', () => {
  assert.equal(getTrainingBase(''), null);
});

test('disabled models cannot be selected for training', () => {
  assert.equal(
    getTrainingBase('qwen2.5:7b-instruct'),
    null
  );
});

test('unknown models cannot be selected for training', () => {
  assert.equal(
    getTrainingBase('not-a-real-model'),
    null
  );
});