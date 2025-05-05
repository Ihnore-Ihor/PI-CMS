const BASE_API_URL = 'http://localhost:8888';
function isUserLoggedIn() {
    const token = sessionStorage.getItem("auth_token");
    return token !== null;
}

async function loginUser(username, password) {
    try {
        const response = await fetch(`${BASE_API_URL}/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ username: username, password: password }),
        });

        const data = await response.json();

        if (response.ok) {
            sessionStorage.setItem("auth_token", data.token);
            sessionStorage.setItem("user", JSON.stringify(data.user));
            return { success: true, data };
        } else {
            return { success: false, error: data.message || "Login failed" };
        }
    } catch (error) {
        console.error("Login error:", error);
        return { success: false, error: "Network error" };
    }
}

document.addEventListener("DOMContentLoaded", () => {
    console.log("Login loaded");
    // Check if user is already logged in
    if (isUserLoggedIn()) {
        window.location.href = "Students.html";
    }

    // Modal open/close handlers
    const loginBtn = document.getElementById("login_btn");
    const cancelBtn = document.getElementById("cancel");
    const closeLoginBtn = document.getElementById("closeLogin");
    const loginModal = document.getElementById("login-modal");

    if (loginBtn) {
        loginBtn.addEventListener("click", (e) => {
            e.preventDefault();
            loginModal.style.display = "block";
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener("click", (e) => {
            e.preventDefault();
            loginModal.style.display = "none";
        });
    }

    if (closeLoginBtn) {
        closeLoginBtn.addEventListener("click", (e) => {
            e.preventDefault();
            loginModal.style.display = "none";
        });
    }

    // Form submission handler
    const form = document.getElementById("form");
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    console.log("jjjj");
    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (e.submitter !== document.getElementById("confirm")) return;
            console.log("Hhh");

            const username = usernameInput.value;
            const password = passwordInput.value;

            const result = await loginUser(username, password);

            if (result.success) {
                loginModal.style.display = "none";
                window.location.href = "Students.html";
            } else {
                alert(result.error || "Login failed. Please try again.");
            }
        });
    }
});