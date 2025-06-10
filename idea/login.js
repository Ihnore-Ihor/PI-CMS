const BASE_API_URL = 'http://localhost:8888';
function isUserLoggedIn() {
    const token = sessionStorage.getItem('auth_token');
    const user = sessionStorage.getItem('user');
    return token !== null && user !== null;
}

async function loginUser(username, password) {
    try {
        const response = await fetch('http://localhost:8888/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        console.log('Login response:', data);

        if (data.message === "Login successful" && data.token) {
            // Store auth token and user data
            sessionStorage.setItem('auth_token', data.token);
            sessionStorage.setItem('user', JSON.stringify(data.user));

            // Update user status to online
            try {
                await fetch('http://localhost:8888/students/update-status', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${data.token}`
                    },
                    body: JSON.stringify({ status: true })
                });
            } catch (statusError) {
                console.error('Error updating status:', statusError);
            }

            return { success: true };
        } else {
            return { success: false, error: data.message || 'Login failed' };
        }
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: 'Network error occurred' };
    }
}

document.addEventListener("DOMContentLoaded", () => {
    console.log("Login loaded");
    // Check if user is already logged in
    if (isUserLoggedIn()) {
        window.location.href = "Students.html";
        return;
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

    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (e.submitter !== document.getElementById("confirm")) return;

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