function requireUser(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }

  if (req.accepts('html')) {
    return res.redirect('/');
  }

  return res.status(401).json({
    error: 'Authentication required.'
  });
}

module.exports = requireUser;