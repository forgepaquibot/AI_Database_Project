function errorHandler(err, req, res, next) {
  console.error('Unhandled application error:', err);

  if (res.headersSent) {
    return next(err);
  }

  const status = Number.isInteger(err.status)
    ? err.status
    : 500;

  if (req.accepts('html')) {
    return res.status(status).render('errors/500', {
      message: status >= 500
        ? 'Something went wrong. Check the server console.'
        : err.message
    });
  }

  return res.status(status).json({
    error: status >= 500
      ? 'Internal server error.'
      : err.message
  });
}

module.exports = errorHandler;