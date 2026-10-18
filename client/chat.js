'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#chat-form');
  const modelSelect = document.querySelector('#ai_id');
  const sessionSelect = document.querySelector('#session_id');
  const prompt = document.querySelector('#prompt');
  const status = document.querySelector('#chat-status');
  const responseBox = document.querySelector('#chat-response');
  const emptyState = document.querySelector('#chat-empty');
  const answerNode = document.querySelector('#answer-text');
  const sourcesNode = document.querySelector('#sources-text');
  const welcomePanel = document.querySelector('#welcome-panel');
  const welcomeText = document.querySelector('#welcome-text');
  const sendButton = document.querySelector('#send-message');;

  function showWelcome() {
    const option = modelSelect?.selectedOptions?.[0];
    const message = option?.dataset.welcomeMessage || '';

    if (welcomeText) welcomeText.textContent = message;
    if (welcomePanel) welcomePanel.hidden = !message;
  }

  function pickSession(sessionId, aiId) {
    if (sessionSelect) {
      sessionSelect.value = String(sessionId || '');
    }

    if (modelSelect && aiId) {
      modelSelect.value = String(aiId);
    }

    showWelcome();
  }

  modelSelect?.addEventListener('change', showWelcome);

  sessionSelect?.addEventListener('change', () => {
    const selected = sessionSelect.selectedOptions?.[0];

    if (selected?.dataset.aiId && modelSelect) {
      modelSelect.value = selected.dataset.aiId;
    }

    showWelcome();
  });

  document.querySelectorAll('[data-load-session]').forEach(button => {
    button.addEventListener('click', () => {
      pickSession(button.dataset.loadSession, button.dataset.aiId);

      if (prompt) prompt.focus();

      if (status) {
        status.textContent =
          'Conversation selected. The next message will continue it.';
      }
    });
  });

  showWelcome();

  form?.addEventListener('submit', async event => {
    event.preventDefault();

    const payload = {
      ai_id: modelSelect?.value,
      session_id: sessionSelect?.value,
      prompt: prompt?.value.trim()
    };

    if (!payload.ai_id || !payload.prompt) return;

    if (sendButton) {
      sendButton.disabled = true;
      sendButton.textContent = 'Generating…';
      sendButton.setAttribute('aria-busy', 'true');
    }

    if (status) { 
      status.textContent = 'Generating response…';
      status.classList.add('is-generating');
    }

    if (responseBox) responseBox.hidden = true;

    try {
      const response = await fetch('/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Chat request failed.');
      }

      if (answerNode) {
        answerNode.textContent = data.answer || '(Empty response)';
      }

      if (sourcesNode) {
        sourcesNode.textContent = data.sources?.length
          ? data.sources.join(', ')
          : 'No resource excerpts were retrieved for this answer.';
      }

      if (responseBox) responseBox.hidden = false;
      if (emptyState) emptyState.hidden = true;

      if (data.session_id && sessionSelect) {
        let option = [...sessionSelect.options].find(
          item => item.value === String(data.session_id)
        );

        if (!option) {
          option = document.createElement('option');
          option.value = String(data.session_id);
          option.textContent = `Conversation ${data.session_id}`;
          option.dataset.aiId = String(payload.ai_id);
          sessionSelect.appendChild(option);
        }

        option.dataset.aiId = String(payload.ai_id);
        option.selected = true;
      }

      if (prompt) prompt.value = '';
      if (status) { 
        status.textContent = 'Response complete.';
        status.classList.remove('is-generating');
      }
    } catch (error) {
      if (status) status.textContent = error.message;
    } finally {
      if (sendButton) {
        sendButton.disabled = false;
        sendButton.textContent = 'Send message';
        sendButton.setAttribute('aria-busy', 'false');
      }
    }
  });
});