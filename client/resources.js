document.addEventListener("DOMContentLoaded", () => {
    // Support both upload routes in the generalized server.
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

    // -------------------- Resource Upload --------------------

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

            // Author and subject are optional in the generalized
            // backend, but partially entered source information
            // should be completed.
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

            if (sourceSelect?.value) {
                if (sourceName) sourceName.value = "";
                if (sourceUrl) sourceUrl.value = "";
            } else {
                const name = sourceName?.value.trim() || "";
                const url = sourceUrl?.value.trim() || "";

                // Source metadata is optional. If one part is
                // supplied, require the other part as well.
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

    const searchInput = searchForm?.querySelector(
        '[name="query"]'
    );

    // Normal HTML forms already submit when Enter is pressed.
    // No custom Enter handler is necessary.

    // -------------------- Scroll to Search Results --------------------

    const resultsSection = document.querySelector(".results");

    if (resultsSection) {
        resultsSection.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
});