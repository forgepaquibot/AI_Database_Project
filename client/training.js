'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector('#check-compatibility');
  const input = document.querySelector('#model-ref');
  const result = document.querySelector('#compatibility-result');

  button?.addEventListener('click', async () => {
    const modelRef = input?.value.trim();

    if (!modelRef) {
      if (result) {
        result.textContent =
          'Enter the exact Ollama model reference first.';
      }

      input?.focus();
      return;
    }

    button.disabled = true;

    if (result) result.textContent = 'Checking catalog…';

    try {
      const response = await fetch(
        `/api/training/compatibility?model_ref=${encodeURIComponent(modelRef)}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || 'Could not check compatibility.'
        );
      }

      if (result) {
        result.textContent = data.supported
          ? `Allowlisted: ${data.displayName} · ${data.method} · ${data.checkpointId}. This does not verify that training/export is operational.`
          : (
              data.message ||
              'This model is not enabled for fine-tuning.'
            );
      }
    } catch (error) {
      if (result) result.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
});