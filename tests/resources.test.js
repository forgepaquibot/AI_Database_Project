const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

process.env.DB_PATH = path.join(
  os.tmpdir(),
  `ai-hub-test-${process.pid}-resources.sqlite`
);

const test = require('node:test');
const assert = require('node:assert/strict');

const { db, DB_PATH } = require('../db/database');

const {
  resourceTypeFromFilename,
  splitTextIntoChunks
} = require('../services/resource-processing.service');

test('resource extensions map to the correct resource types', () => {
  assert.equal(resourceTypeFromFilename('guide.PDF'), 'pdf');
  assert.equal(resourceTypeFromFilename('notes.md'), 'txt');
  assert.equal(resourceTypeFromFilename('rows.csv'), 'csv');
  assert.equal(resourceTypeFromFilename('records.jsonl'), 'jsonl');
  assert.equal(resourceTypeFromFilename('records.json'), 'json');
});

test('unsupported resource extensions are rejected', () => {
  assert.throws(
    () => resourceTypeFromFilename('program.exe'),
    /Unsupported file type/
  );
});

test('text chunking handles empty input and creates multiple chunks', () => {
  assert.deepEqual(
    splitTextIntoChunks('   '),
    []
  );

  const chunks = splitTextIntoChunks(
    'a '.repeat(1500),
    100,
    10
  );

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.length > 0));
});

test.after(() => new Promise(resolve => {
  db.close(() => {
    try {
      fs.rmSync(DB_PATH, { force: true });
    } catch {
      // Ignore cleanup errors.
    }

    resolve();
  });
}));