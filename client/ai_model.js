
document.addEventListener("DOMContentLoaded", () => {
    const registerForm = document.querySelector(
        'form[action="/register_ollama_model"]'
    );

    const evaluateForm = document.querySelector(
        'form[action="/evaluate_model"]'
    );

    // -------------------- Register Ollama Model --------------------

    registerForm?.addEventListener("submit", (event) => {
        const modelRef = registerForm
            .querySelector('[name="model_ref"]')
            ?.value.trim();

        const name = registerForm
            .querySelector('[name="name"]')
            ?.value.trim();

        if (!modelRef) {
            event.preventDefault();
            alert("Please select an installed Ollama model.");
            return;
        }

        // The name is optional in the backend, but reject
        // excessively long names if one was provided.
        if (name && name.length > 150) {
            event.preventDefault();
            alert("The model name must be 150 characters or fewer.");
            return;
        }

        // Prevent accidental double submissions.
        const submitButton = registerForm.querySelector(
            'button[type="submit"], button:not([type])'
        );

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Registering Model...";
        }
    });

    // -------------------- Evaluate Model --------------------

    evaluateForm?.addEventListener("submit", (event) => {
        const modelId = evaluateForm
            .querySelector('[name="ai_id"]')
            ?.value;

        const resourceId = evaluateForm
            .querySelector('[name="resource_id"]')
            ?.value;

        if (!modelId || !resourceId) {
            event.preventDefault();
            alert("Please select both a model and a PDF resource.");
            return;
        }

        // Evaluation can take time while Ollama generates answers.
        const submitButton = evaluateForm.querySelector(
            'button[type="submit"], button:not([type])'
        );

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Evaluation Running...";
        }
    });
});