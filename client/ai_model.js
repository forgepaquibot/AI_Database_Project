document.addEventListener("DOMContentLoaded", () => {
  const uploadForm = document.querySelector('form[action="/upload_model"]');
  const searchForm = document.querySelector('form[action="/search_models"]');
  const searchInput = searchForm?.querySelector('input[name="query"]');

  // Validate upload
  uploadForm?.addEventListener("submit", (e) => {
    const name = uploadForm.name.value.trim();
    const file = uploadForm.model_file.files[0];

    if (!name || !file) {
      e.preventDefault();
      alert("Please provide a name and select a model file (.pt or .bin).");
      return;
    }

    const allowedExtensions = /(\.pt|\.bin)$/i;
    if (!allowedExtensions.exec(file.name)) {
      e.preventDefault();
      alert("Only .pt or .bin model files are allowed.");
    }
  });

  // Suport entering for searching
  if (searchInput && searchForm) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        searchForm.submit();
      }
    });
  }
});