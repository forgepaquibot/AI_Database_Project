function normalizeDomain(domain) {
  const value = String(domain || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');

  return value ? `https://${value}` : '';
}

const domain = normalizeDomain(process.env.AUTH0_DOMAIN);
const clientID = process.env.AUTH0_CLIENT_ID || '';
const clientSecret = process.env.AUTH0_CLIENT_SECRET || '';

const secret =
  process.env.AUTH0_SECRET ||
  process.env.SESSION_SECRET ||
  '';

const baseURL =
  process.env.APP_BASE_URL ||
  `http://localhost:${process.env.PORT || 3005}`;

const hasPlaceholder = [
  domain,
  clientID,
  clientSecret,
  secret
].some(value =>
  /your-tenant|your_auth0|replace_with|example\.com/i.test(
    String(value || '')
  )
);

const isConfigured =
  Boolean(domain && clientID && clientSecret && secret && baseURL) &&
  !hasPlaceholder;

const auth0Config = isConfigured
  ? {
      authRequired: false,
      auth0Logout: true,
      idpLogout: true,
      issuerBaseURL: domain,
      baseURL,
      clientID,
      clientSecret,
      secret,
      authorizationParams: {
        response_type: 'code',
        scope: 'openid profile email'
      }
    }
  : null;

module.exports = {
  auth0Config,
  isConfigured
};