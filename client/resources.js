'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#resource-upload-form');
  const fileInput = document.querySelector('#resource-file');
  const pagesInput = document.querySelector('#resource-pages');
  const submitButton = document.querySelector('#upload-submit-button');
  const status = document.querySelector('#upload-status');

  const maxBytes = 50 * 1024 * 1024;
  const allowed = new Set([
    '.pdf', '.txt', '.md', '.csv', '.json', '.jsonl'
  ]);

  function extensionOf(name) {
    const dot = name.lastIndexOf('.');
    return dot < 0 ? '' : name.slice(dot).toLowerCase();
  }

  function selectedPdf() {
    return extensionOf(fileInput?.files?.[0]?.name || '') === '.pdf';
  }

  function updatePages() {
    if (!pagesInput) return;

    pagesInput.disabled = !selectedPdf();

    if (!selectedPdf()) {
      pagesInput.value = '';
    }

    pagesInput.placeholder = selectedPdf()
      ? 'Optional'
      : 'PDF only';
  }

  function showStatus(message) {
    if (status) status.textContent = message;
  }

  fileInput?.addEventListener('change', () => {
    updatePages();
    showStatus('');

    const file = fileInput.files?.[0];
    if (!file) return;

    if (!allowed.has(extensionOf(file.name))) {
      showStatus(
        'Unsupported format. Choose PDF, TXT, MD, CSV, JSON, or JSONL.'
      );
      fileInput.value = '';
      updatePages();
      return;
    }

    if (file.size > maxBytes) {
      showStatus('The selected file exceeds the 50 MB limit.');
      fileInput.value = '';
      updatePages();
      return;
    }

    showStatus(
      `${file.name} selected (${(file.size / (1024 * 1024)).toFixed(2)} MB).`
    );
  });

  updatePages();

  form?.addEventListener('submit', event => {
    const file = fileInput?.files?.[0];

    if (
      !file ||
      !allowed.has(extensionOf(file.name)) ||
      file.size > maxBytes
    ) {
      event.preventDefault();
      showStatus('Choose a supported file smaller than 50 MB.');
      return;
    }

    if (
      pagesInput &&
      !pagesInput.disabled &&
      pagesInput.value &&
      (
        !Number.isInteger(Number(pagesInput.value)) ||
        Number(pagesInput.value) < 1
      )
    ) {
      event.preventDefault();
      showStatus('Enter a positive whole number of pages.');
      pagesInput.focus();
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Uploading…';
    }

    showStatus('Uploading resource. Please keep this page open.');
  });

  // Keep existing metadata selections and free-text alternatives distinct.
  for (const [selectSelector, textSelector] of [
    ['#author_id', '#author_name'],
    ['#subject_id', '#subject_name'],
    ['#source_id', '#source_name']
  ]) {
    const select = document.querySelector(selectSelector);
    const text = document.querySelector(textSelector);

    if (!select || !text) continue;

    select.addEventListener('change', () => {
      if (select.value) text.value = '';
    });

    text.addEventListener('input', () => {
      if (text.value.trim()) select.value = '';
    });
  }
});