'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#model-settings-form');
  const personality = document.querySelector('#personality-prompt');
  const welcome = document.querySelector('#welcome-prompt');
  const personalityCount = document.querySelector('#personality-count');
  const welcomeCount = document.querySelector('#welcome-count');

  function updateCount(input, output) {
    if (input && output) {
      output.textContent = `${input.value.length} characters`;
    }
  }

  personality?.addEventListener('input', () => {
    updateCount(personality, personalityCount);
  });

  welcome?.addEventListener('input', () => {
    updateCount(welcome, welcomeCount);
  });

  updateCount(personality, personalityCount);
  updateCount(welcome, welcomeCount);

  form?.addEventListener('submit', () => {
    const button = form.querySelector('button[type="submit"]');

    if (button) {
      button.disabled = true;
      button.textContent = 'Saving…';
    }
  });
});