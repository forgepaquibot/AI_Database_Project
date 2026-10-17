const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const { DB_PATH } = require('../config/app-config');

// Ensure the parent directory exists before opening the database.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Queries must wait for the database to open and initialize.
let markDatabaseReady;

const ready = new Promise(resolve => {
  markDatabaseReady = resolve;
});

const db = new sqlite3.Database(DB_PATH, err => {
  if (err) {
    console.error('Could not open SQLite database:', err.message);
    process.exit(1);
    return;
  }

  db.run('PRAGMA foreign_keys = ON', pragmaErr => {
    if (pragmaErr) {
      console.error(
        'Could not enable foreign keys:',
        pragmaErr.message
      );

      process.exit(1);
      return;
    }

    db.get('PRAGMA foreign_keys', (verifyErr, row) => {
      if (verifyErr || Number(row?.foreign_keys) !== 1) {
        console.error(
          'SQLite foreign-key enforcement could not be verified:',
          verifyErr?.message || 'Foreign keys are disabled.'
        );

        process.exit(1);
        return;
      }

      console.log('SQLite database ready:', DB_PATH);
      markDatabaseReady();
    });
  });
});

function sqlGet(sql, params = []) {
  return ready.then(() => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  }));
}

function sqlAll(sql, params = []) {
  return ready.then(() => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  }));
}

function sqlRun(sql, params = []) {
  return ready.then(() => new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);

      resolve({
        lastID: this.lastID,
        changes: this.changes
      });
    });
  }));
}

module.exports = {
  db,
  DB_PATH,
  ready,
  sqlGet,
  sqlAll,
  sqlRun
};