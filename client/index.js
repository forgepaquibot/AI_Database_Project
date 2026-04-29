document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.querySelector('form[action="/login"]');
  const signupForm = document.querySelector('form[action="/signup"]');

  // Current naming rules
  const validate = (username, password) => {
    if (!username.trim() || !password.trim()) {
      alert("Please enter a valid username and password (cannot be empty or spaces only).");
      return false;
    }
    return true;
  };

  // Form submissions
  loginForm?.addEventListener("submit", (e) => {
    const username = loginForm.username.value;
    const password = loginForm.password.value;

    if (!validate(username, password)) {
      e.preventDefault();
    }
  });

  signupForm?.addEventListener("submit", (e) => {
    const username = signupForm.username.value;
    const password = signupForm.password.value;

    if (!validate(username, password)) {
      e.preventDefault();
    }
  });
});