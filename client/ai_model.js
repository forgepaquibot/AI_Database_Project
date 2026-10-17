'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#process-resource-form');
  const button = form?.querySelector('button[type="submit"]');
  const status = document.querySelector('#processing-status');

  form?.addEventListener('submit', () => {
    if (button) {
      button.disabled = true;
      button.textContent = 'Indexing…';
    }

    if (status) {
      status.textContent =
        'Resource extraction and embedding are running. Please keep this page open.';
    }
  });
});