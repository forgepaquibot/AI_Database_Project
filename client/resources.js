document.addEventListener("DOMContentLoaded", () => {
  const uploadForm = document.querySelector('form[action="/upload"]');

  if (uploadForm) {
    // Get DOM elements
    const authorSelect = uploadForm.querySelector('[name="author_id"]');
    const authorInput = uploadForm.querySelector('[name="author_name"]');

    const subjectSelect = uploadForm.querySelector('[name="subject_id"]');
    const subjectInput = uploadForm.querySelector('[name="subject_name"]');

    const sourceSelect = uploadForm.querySelector('[name="source_id"]');
    const sourceName = uploadForm.querySelector('[name="source_name"]');
    const sourceUrl = uploadForm.querySelector('[name="source_url"]');

    // Empty inputs if selected dropdown
    const clearIfSelected = (select, inputs) => {
      select.addEventListener("change", () => {
        if (select.value) inputs.forEach(i => i.value = "");
      });
    };

    clearIfSelected(authorSelect, [authorInput]);
    clearIfSelected(subjectSelect, [subjectInput]);
    clearIfSelected(sourceSelect, [sourceName, sourceUrl]);

    uploadForm.addEventListener("submit", e => {
      if (!authorSelect.value && !authorInput.value.trim()) {
        alert("Author required");
        return e.preventDefault();
      }

      if (!subjectSelect.value && !subjectInput.value.trim()) {
        alert("Subject required");
        return e.preventDefault();
      }

      if (!sourceSelect.value) {
        const name = sourceName.value.trim();
        const url = sourceUrl.value.trim();

        if (!name || !url) {
          alert("Source name + URL required");
          return e.preventDefault();
        }

        if (!isValidUrl(url)) {
          alert("Please enter a valid URL (must start with http:// or https://)");
          return e.preventDefault();
        }
      }
    });
  }

  // Support entering for searching
  const searchForm = document.querySelector('form[action="/search"]');
  const searchInput = searchForm?.querySelector('[name="query"]');

  if (searchInput && searchForm) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        searchForm.submit();
      }
    });
  }

  // Stay on results
  const resultsSection = document.querySelector(".results");
  if (resultsSection) {
    resultsSection.scrollIntoView({ behavior: "smooth" });
  }
});