'use strict';

// Authentication is handled by Auth0.
// This script is for non-sensitive landing-page interactions.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-auth-redirect]').forEach(link => {
    link.addEventListener('click', () => {
      link.setAttribute('aria-busy', 'true');
    });
  });
});