const crypto = require('crypto');
const { sqlGet, sqlAll, sqlRun } = require('../db/database');

function makeUsername(profile) {
  const source =
    profile.nickname ||
    profile.preferred_username ||
    profile.email ||
    profile.name ||
    'user';

  const normalized = String(source)
    .split('@')[0]
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 40);

  return normalized ||
    `user_${crypto.randomBytes(4).toString('hex')}`;
}

async function createUniqueUsername(profile) {
  const base = makeUsername(profile);

  let username = base;
  let suffix = 1;

  while (
    await sqlGet(
      'SELECT user_id FROM users WHERE username = ?',
      [username]
    )
  ) {
    username = `${base.slice(0, 34)}_${suffix++}`;
  }

  return username;
}

async function getOrCreateLocalUser(profile) {
  if (!profile || !profile.sub) {
    throw new Error(
      'Auth0 did not provide a user subject identifier.'
    );
  }

  let columns;

  try {
    columns = await sqlAll('PRAGMA table_info(users)');
  } catch (err) {
    throw new Error(
      `Could not inspect the users table: ${err.message}`
    );
  }

  const hasAuth0Sub = columns.some(
    column => column.name === 'auth0_sub'
  );

  if (!hasAuth0Sub) {
    throw new Error(
      'The users table is missing auth0_sub. Back up the database ' +
      'and apply db/migrations/002_add_auth0_sub.sql.'
    );
  }

  const existing = await sqlGet(
    'SELECT user_id, username, auth0_sub FROM users WHERE auth0_sub = ?',
    [profile.sub]
  );

  if (existing) return existing;

  const username = await createUniqueUsername(profile);

  const passwordColumn = columns.find(
    column => column.name === 'password_hash'
  );

  // Support an existing schema where password_hash is NOT NULL.
  // This random marker is never used for password authentication.
  if (passwordColumn && passwordColumn.notnull) {
    const placeholder = `AUTH0_ONLY:${crypto.randomUUID()}`;

    const result = await sqlRun(
      `INSERT INTO users (username, password_hash, auth0_sub)
       VALUES (?, ?, ?)`,
      [username, placeholder, profile.sub]
    );

    return {
      user_id: result.lastID,
      username,
      auth0_sub: profile.sub
    };
  }

  const result = await sqlRun(
    'INSERT INTO users (username, auth0_sub) VALUES (?, ?)',
    [username, profile.sub]
  );

  return {
    user_id: result.lastID,
    username,
    auth0_sub: profile.sub
  };
}

async function syncAuth0User(req, res, next) {
  try {
    if (req.oidc?.isAuthenticated?.() && req.oidc.user) {
      const user = await getOrCreateLocalUser(req.oidc.user);

      req.session.user = {
        id: user.user_id,
        username: user.username,
        auth0_sub: user.auth0_sub
      };
    } else if (req.session?.user?.auth0_sub) {
      delete req.session.user;
    }

    return next();
  } catch (err) {
    console.error(
      'Could not synchronize Auth0 identity with SQLite:',
      err.message
    );

    return next(err);
  }
}

module.exports = {
  makeUsername,
  getOrCreateLocalUser,
  syncAuth0User
};