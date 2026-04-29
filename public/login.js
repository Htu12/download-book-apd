const TOKEN_KEY = "auth_token";

const loginForm = document.getElementById("loginForm");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");

if (localStorage.getItem(TOKEN_KEY)) {
  window.location.replace("/");
}

function showError(message) {
  loginError.textContent = message;
  loginError.classList.remove("hidden");
}

function hideError() {
  loginError.classList.add("hidden");
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const password = passwordInput.value.trim();
  if (!password) return;

  loginBtn.disabled = true;
  loginBtn.textContent = "Đang đăng nhập...";
  hideError();

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Đăng nhập thất bại");
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    window.location.replace("/");
  } catch (error) {
    showError(error.message || "Đăng nhập thất bại");
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Đăng nhập";
  }
});

passwordInput.focus();
