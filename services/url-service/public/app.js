const ANALYTICS_BASE = window.ANALYTICS_URL || window.location.origin;

let mode = "login";
let token = localStorage.getItem("token");

let emailInput = document.getElementById("email");
let passwordInput = document.getElementById("password");
let authBtn = document.getElementById("authBtn");
let authTitle = document.getElementById("authTitle");
let toggleBtn = document.getElementById("toggleBtn");
let authSection = document.getElementById("authSection");
let logoutBtn = document.getElementById("logoutBtn");
let shortenSection = document.getElementById("shortenSection");
let longUrlInput = document.getElementById("longUrl");
let shortbtn = document.getElementById("shortenBtn");
let resultDiv = document.getElementById("result");
let shortLink = document.getElementById("shortLink");
let errorDiv = document.getElementById("error");
let copyBtn = document.getElementById("copyBtn");

function showError(message) {
  errorDiv.textContent = message;
  errorDiv.style.display = "block";
}

function hideError() {
  errorDiv.style.display = "none";
}

function setLoggedIn(isLoggedIn) {
  authSection.style.display = isLoggedIn ? "none" : "block";
  logoutBtn.style.display = isLoggedIn ? "block" : "none";
  resultDiv.style.display = "none";
  if (isLoggedIn) {
    emailInput.value = "";
    passwordInput.value = "";
  }
}

toggleBtn.addEventListener("click", () => {
  mode = mode === "login" ? "signup" : "login";
  authTitle.textContent = mode === "login" ? "Log In" : "Sign Up";
  authBtn.textContent = mode === "login" ? "Log In" : "Sign Up";
  toggleBtn.textContent =
    mode === "login" ? "Need an account? Sign Up" : "Already have an account? Log In";
});

authBtn.addEventListener("click", async () => {
  let email = emailInput.value.trim();
  let password = passwordInput.value;
  hideError();

  if (!email || !password) {
    showError("Please enter email and password.");
    return;
  }

  authBtn.disabled = true;
  authBtn.textContent = mode === "login" ? "Logging in..." : "Signing up...";

  try {
    let res = await fetch(`/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    let data = await res.json();
    if (!res.ok) {
      showError(data.error || "Authentication failed.");
      return;
    }

    if (mode === "signup") {
      mode = "login";
      authTitle.textContent = "Log In";
      authBtn.textContent = "Log In";
      toggleBtn.textContent = "Need an account? Sign Up";
      passwordInput.value = "";
      showError("Account created. Please log in.");
      return;
    }

    token = data.token;
    localStorage.setItem("token", token);
    setLoggedIn(true);
  } catch (err) {
    showError("Network error. Is the server running?");
  } finally {
    authBtn.disabled = false;
    authBtn.textContent = mode === "login" ? "Log In" : "Sign Up";
  }
});

logoutBtn.addEventListener("click", () => {
  token = null;
  localStorage.removeItem("token");
  setLoggedIn(false);
});

shortbtn.addEventListener("click", async () => {
  let longUrl = longUrlInput.value.trim();
  hideError();
  resultDiv.style.display = "none";

  if (!longUrl) {
    showError("Please enter a URL.");
    return;
  }

  shortbtn.disabled = true;
  shortbtn.textContent = "Shortening...";

  try {
    let res = await fetch("/shorten", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url: longUrl }),
    });

    let data = await res.json();
    if (!res.ok) {
      showError(data.error || "Failed to shorten URL.");
      return;
    }

    shortLink.href = `/${data.shortCode}`;
    shortLink.textContent = `${window.location.origin}/${data.shortCode}`;
    resultDiv.style.display = "block";
  } catch (err) {
    showError("Network error. Is the server running?");
  } finally {
    shortbtn.disabled = false;
    shortbtn.textContent = "Shorten URL";
  }
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shortLink.href);
    copyBtn.textContent = "Copied!";
    setTimeout(() => {
      copyBtn.textContent = "Copy to Clipboard";
    }, 1500);
  } catch (err) {
    showError("Could not copy to clipboard.");
  }
});

let checkBtn = document.getElementById("checkBtn");
let codeInput = document.getElementById("codeInput");
let statsResult = document.getElementById("statsResult");
let totalClicksEl = document.getElementById("totalClicks");
let referrersList = document.getElementById("referrersList");

checkBtn.addEventListener("click", async () => {
  let code = codeInput.value.trim();
  if (!code) return;

  try {
    let res = await fetch(`${ANALYTICS_BASE}/analytics/${code}`);
    let data = await res.json();

    if (!res.ok) {
      alert(data.error || "Not found");
      return;
    }

    totalClicksEl.textContent = data.totalClicks;
    referrersList.innerHTML = "";

    if (data.topReferrers.length === 0) {
      referrersList.innerHTML = "<li>No referrer data yet</li>";
    } else {
      data.topReferrers.forEach((r) => {
        let li = document.createElement("li");
        li.textContent = `${r.referrer} — ${r.count} clicks`;
        referrersList.appendChild(li);
      });
    }

    statsResult.style.display = "block";
  } catch (err) {
    alert("Could not fetch analytics");
  }
});

setLoggedIn(Boolean(token));
