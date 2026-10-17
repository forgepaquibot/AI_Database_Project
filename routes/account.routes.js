const express = require('express');
const { isConfigured } = require('../config/auth0');
const requireUser = require('../middleware/requireUser');

const router = express.Router();

router.get('/', (req, res) => {
  const message = req.session?.message || (
    !isConfigured
      ? 'Auth0 is not configured yet. Fill in the AUTH0_* values in .env to enable sign-in.'
      : null
  );

  if (req.session) {
    req.session.message = null;
  }

  res.render('index', {
    message,
    isAuthenticated: Boolean(req.session?.user),
    currentUser: req.session?.user || null,
    auth0Configured: isConfigured
  });
});

// Auth0 Universal Login handles password entry and signup.
router.get('/signup', (req, res, next) => {
  if (!isConfigured) {
    req.session.message =
      'Configure Auth0 in .env before creating an account.';

    return res.redirect('/');
  }

  if (!res.oidc?.login) {
    return res.status(503).send(
      'Auth0 login is not available.'
    );
  }

  return res.oidc.login({
    authorizationParams: {
      screen_hint: 'signup'
    }
  }).catch(next);
});

// Redirect legacy POST signup forms to Auth0.
router.post('/signup', (_req, res) => {
  res.redirect('/signup');
});

router.get('/account', requireUser, (_req, res) => {
  res.redirect('/profile');
});

module.exports = router;