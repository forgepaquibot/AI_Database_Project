document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.querySelector('form[action="/login"]');
    const signupForm = document.querySelector('form[action="/signup"]');

    function getCredentials(form) {
        return {
            username: form.querySelector('[name="username"]')?.value ?? "",
            password: form.querySelector('[name="password"]')?.value ?? ""
        };
    }

    function validateCredentials(username, password, isSignup) {
        if (!username.trim() || !password.trim()) {
            alert("Please enter a username and password.");
            return false;
        }

        if (username.includes(" ") || password.includes(" ")) {
            alert("Spaces are not allowed in usernames or passwords.");
            return false;
        }

        if (isSignup && password.length < 8) {
            alert("Your password must be at least 8 characters long.");
            return false;
        }

        return true;
    }

    // -------------------- Login --------------------

    loginForm?.addEventListener("submit", (event) => {
        const { username, password } = getCredentials(loginForm);

        if (!validateCredentials(username, password, false)) {
            event.preventDefault();
        }
    });

    // -------------------- Signup --------------------

    signupForm?.addEventListener("submit", (event) => {
        const { username, password } = getCredentials(signupForm);

        if (!validateCredentials(username, password, true)) {
            event.preventDefault();
        }
    });
});
