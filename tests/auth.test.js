const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

process.env.DB_PATH = path.join(
  os.tmpdir(),
  `ai-hub-test-${process.pid}-auth.sqlite`
);

const test = require('node:test');
const assert = require('node:assert/strict');

const { db, DB_PATH } = require('../db/database');
const {
  makeUsername
} = require('../services/auth0-user.service');

test('makeUsername returns a URL/database-friendly username', () => {
  const username = makeUsername({
    email: 'Example.User+test@example.com'
  });

  assert.match(username, /^[a-z0-9_-]+$/);
  assert.equal(username, 'example_user_test');
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