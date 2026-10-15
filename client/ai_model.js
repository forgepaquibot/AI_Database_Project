document.addEventListener("DOMContentLoaded", () => {
    // -------------------- Preserve Scroll Position --------------------

    const scrollStorageKey = "aiModelScrollPosition";

    function saveScrollPosition() {
        sessionStorage.setItem(
            scrollStorageKey,
            JSON.stringify({
                x: window.scrollX,
                y: window.scrollY
            })
        );
    }

    // Stop the browser from automatically restoring a different position.
    if ("scrollRestoration" in history) {
        history.scrollRestoration = "manual";
    }

    // Restore the saved position after the server redirects back.
    const savedPosition = sessionStorage.getItem(scrollStorageKey);

    if (savedPosition !== null) {
        sessionStorage.removeItem(scrollStorageKey);

        try {
            const position = JSON.parse(savedPosition);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    window.scrollTo({
                        left: position.x || 0,
                        top: position.y || 0,
                        behavior: "auto"
                    });
                });
            });
        } catch (error) {
            console.error(
                "Could not restore scroll position:",
                error
            );
        }
    }

    // -------------------- Form References --------------------

    const registerForm = document.querySelector(
        'form[action="/register_ollama_model"]'
    );

    const processForm = document.querySelector(
        "#process-resource-form"
    );

    const linkForm = document.querySelector(
        'form[action="/link_resource"]'
    );

    const chatForm = document.querySelector("#chat-form");

    // -------------------- Shared Helpers --------------------

    function disableAfterSubmit(form, buttonSelector, label) {
        const button = form?.querySelector(buttonSelector);

        if (button) {
            button.disabled = true;
            button.textContent = label;
        }
    }

    // -------------------- Register an Ollama Model --------------------

    registerForm?.addEventListener("submit", event => {
        const modelRef = registerForm
            .querySelector('[name="model_ref"]')
            ?.value.trim();

        const name = registerForm
            .querySelector('[name="name"]')
            ?.value.trim();

        if (!modelRef || !name) {
            event.preventDefault();

            alert(
                "Choose an installed Ollama model and enter a display name."
            );

            return;
        }

        // Save position only after validation succeeds.
        saveScrollPosition();

        disableAfterSubmit(
            registerForm,
            'button[type="submit"]',
            "Registering..."
        );
    });

    // -------------------- Process a Resource --------------------

    processForm?.addEventListener("submit", event => {
        const aiId = processForm
            .querySelector('[name="ai_id"]')
            ?.value;

        const resourceId = processForm
            .querySelector('[name="resource_id"]')
            ?.value;

        if (!aiId || !resourceId) {
            event.preventDefault();

            alert("Select both a model and a resource.");

            return;
        }

        saveScrollPosition();

        disableAfterSubmit(
            processForm,
            'button[type="submit"]',
            "Processing resource..."
        );
    });

    // -------------------- Link a Processed Resource --------------------

    linkForm?.addEventListener("submit", event => {
        const aiId = linkForm
            .querySelector('[name="ai_id"]')
            ?.value;

        const resourceId = linkForm
            .querySelector('[name="resource_id"]')
            ?.value;

        if (!aiId || !resourceId) {
            event.preventDefault();

            alert("Select both a model and a ready resource.");

            return;
        }

        saveScrollPosition();

        disableAfterSubmit(
            linkForm,
            'button[type="submit"]',
            "Connecting..."
        );
    });

    // -------------------- Chat with a Model --------------------

    chatForm?.addEventListener("submit", async event => {
        // Chat uses fetch(), so it does not reload the page.
        event.preventDefault();

        const aiId = chatForm
            .querySelector('[name="ai_id"]')
            ?.value;

        const promptElement = chatForm
            .querySelector('[name="prompt"]');

        const prompt = promptElement?.value.trim();

        const sessionElement = chatForm
            .querySelector('[name="session_id"]');

        const button = document.querySelector("#chat-submit");
        const status = document.querySelector("#chat-status");
        const output = document.querySelector("#chat-response");
        const sources = document.querySelector("#chat-sources");

        if (!aiId || !prompt) {
            if (status) {
                status.textContent =
                    "Select a model and enter a message.";
            }

            return;
        }

        if (!button || !status || !output || !sources) {
            console.error("One or more chat interface elements are missing.");

            return;
        }

        button.disabled = true;
        button.textContent = "Generating...";

        status.textContent = "Waiting for the model...";
        output.textContent = "";
        sources.replaceChildren();

        try {
            const payload = {
                ai_id: Number(aiId),
                prompt
            };

            if (sessionElement?.value) {
                payload.session_id = Number(sessionElement.value);
            }

            const response = await fetch("/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "The chat request failed."
                );
            }

            output.textContent =
                data.answer || "No response was returned.";

            status.textContent = "Response complete.";

            if (sessionElement && data.session_id) {
                sessionElement.value = String(data.session_id);
            }

            for (const sourceTitle of (data.sources || [])) {
                const item = document.createElement("li");

                item.textContent = sourceTitle;

                sources.appendChild(item);
            }

            if (!data.sources?.length) {
                const item = document.createElement("li");

                item.textContent =
                    "No indexed resource passages were used.";

                sources.appendChild(item);
            }
        } catch (error) {
            status.textContent = `Error: ${error.message}`;
        } finally {
            button.disabled = false;
            button.textContent = "Send Message";
        }
    });
});