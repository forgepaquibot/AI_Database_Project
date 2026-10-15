document.addEventListener("DOMContentLoaded", () => {
    // -------------------- Preserve Scroll Position --------------------

    const scrollStorageKey = "resourcesScrollPosition";

    function saveScrollPosition() {
        sessionStorage.setItem(
            scrollStorageKey,
            JSON.stringify({
                x: window.scrollX,
                y: window.scrollY
            })
        );
    }

    // Prevent the browser from overriding our saved position.
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
            console.error("Could not restore scroll position:", error);
        }
    }

    // -------------------- Resource Upload --------------------

    const uploadForm = document.querySelector(
        'form[action="/upload"], form[action="/upload_resource"]'
    );

    const allowedExtensions = new Set([
        ".pdf",
        ".txt",
        ".md",
        ".csv",
        ".json",
        ".jsonl"
    ]);

    const maxFileSize = 50 * 1024 * 1024; // 50 MB

    if (uploadForm) {
        const fileInput = uploadForm.querySelector(
            '[name="pdf"], [name="resource_file"]'
        );

        const authorSelect = uploadForm.querySelector(
            '[name="author_id"]'
        );

        const authorInput = uploadForm.querySelector(
            '[name="author_name"]'
        );

        const subjectSelect = uploadForm.querySelector(
            '[name="subject_id"]'
        );

        const subjectInput = uploadForm.querySelector(
            '[name="subject_name"]'
        );

        const sourceSelect = uploadForm.querySelector(
            '[name="source_id"]'
        );

        const sourceName = uploadForm.querySelector(
            '[name="source_name"]'
        );

        const sourceUrl = uploadForm.querySelector(
            '[name="source_url"]'
        );

        // Clear manual fields when an existing option is selected.
        function clearIfSelected(select, inputs) {
            if (!select) return;

            select.addEventListener("change", () => {
                if (select.value) {
                    inputs.forEach(input => {
                        if (input) input.value = "";
                    });
                }
            });
        }

        clearIfSelected(authorSelect, [authorInput]);
        clearIfSelected(subjectSelect, [subjectInput]);
        clearIfSelected(sourceSelect, [sourceName, sourceUrl]);

        function isValidUrl(value) {
            try {
                const url = new URL(value);

                return (
                    url.protocol === "http:" ||
                    url.protocol === "https:"
                );
            } catch {
                return false;
            }
        }

        uploadForm.addEventListener("submit", event => {
            // Validate the selected resource file.
            const file = fileInput?.files?.[0];

            if (!file) {
                event.preventDefault();
                alert("Please select a resource file.");
                return;
            }

            const extension = file.name
                .slice(file.name.lastIndexOf("."))
                .toLowerCase();

            if (!allowedExtensions.has(extension)) {
                event.preventDefault();
                alert(
                    "Unsupported file type. Allowed formats: " +
                    "PDF, TXT, MD, CSV, JSON and JSONL."
                );
                return;
            }

            if (file.size > maxFileSize) {
                event.preventDefault();
                alert("The maximum upload size is 50 MB.");
                return;
            }

            if (file.size === 0) {
                event.preventDefault();
                alert("The selected file is empty.");
                return;
            }

            // Author and subject are optional.
            if (authorInput && authorSelect) {
                if (
                    authorSelect.value &&
                    authorInput.value.trim()
                ) {
                    authorInput.value = "";
                }
            }

            if (subjectInput && subjectSelect) {
                if (
                    subjectSelect.value &&
                    subjectInput.value.trim()
                ) {
                    subjectInput.value = "";
                }
            }

            // Source metadata is optional, but if one field is
            // supplied, require the other field as well.
            if (sourceSelect?.value) {
                if (sourceName) sourceName.value = "";
                if (sourceUrl) sourceUrl.value = "";
            } else {
                const name = sourceName?.value.trim() || "";
                const url = sourceUrl?.value.trim() || "";

                if ((name && !url) || (!name && url)) {
                    event.preventDefault();
                    alert(
                        "Enter both the source name and URL, " +
                        "or leave both empty."
                    );
                    return;
                }

                if (url && !isValidUrl(url)) {
                    event.preventDefault();
                    alert(
                        "Enter a valid source URL beginning " +
                        "with http:// or https://."
                    );
                    return;
                }
            }

            // Save the scroll position only after all validation passes.
            saveScrollPosition();

            const submitButton = uploadForm.querySelector(
                'button[type="submit"], button:not([type])'
            );

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = "Uploading...";
            }
        });
    }

    // -------------------- Resource Search --------------------

    const searchForm = document.querySelector(
        'form[action="/search"]'
    );

    if (searchForm) {
        // Handles clicking Search and pressing Enter.
        searchForm.addEventListener("submit", () => {
            saveScrollPosition();
        });
    }

    // Do not call resultsSection.scrollIntoView() here.
    // That would override the position restored after navigation.
});