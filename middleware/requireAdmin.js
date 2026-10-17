function requireAdmin(req, res, next) {
  if (req.session?.user?.role === 'admin') {
    return next();
  }

  return res.status(403).render('errors/403', {
    message: 'Administrator access is required.'
  });
}

module.exports = requireAdmin;