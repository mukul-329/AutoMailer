const apiBaseUrl = window.APP_CONFIG?.apiBaseUrl?.replace(/\/$/, "");

const templateSelect = document.getElementById("template");
const templatePreview = document.getElementById("templatePreview");
const payloadPreview = document.getElementById("payloadPreview");
const statusPill = document.getElementById("statusPill");
const authState = document.getElementById("authState");
const authMessage = document.getElementById("authMessage");
const emailForm = document.getElementById("emailForm");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const previewBtn = document.getElementById("previewBtn");
const appPasswordInput = document.getElementById("appPassword");

let templates = {};
let session = null;

function setStatus(mode, text) {
  statusPill.className = `pill ${mode}`;
  statusPill.textContent = text;
}

function setAuth(mode, text, message) {
  authState.className = `pill ${mode}`;
  authState.textContent = text;
  authMessage.textContent = message;
}

function getPayload() {
  return {
    name: document.getElementById("companyName").value.trim(),
    email: document.getElementById("email").value.trim(),
    template: templateSelect.value.trim(),
    subject: document.getElementById("subject").value.trim(),
    requestId: crypto.randomUUID()
  };
}

function renderPayloadPreview() {
  const payload = getPayload();
  payload.requestId = "generated-on-submit";
  payloadPreview.textContent = JSON.stringify(payload, null, 2);
}

function renderPreview() {
  const companyName = document.getElementById("companyName").value.trim() || "Company Name";
  const selectedTemplate = templateSelect.value;
  const templateBody = templates[selectedTemplate] || "";
  templatePreview.textContent = templateBody.replaceAll("{name}", companyName);
  renderPayloadPreview();
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }

  if (!response.ok) {
    throw new Error(body?.message || `Request failed with ${response.status}`);
  }

  return body;
}

async function loadTemplates() {
  const response = await fetch("./templates.json");
  if (!response.ok) {
    throw new Error("Unable to load template catalog.");
  }

  templates = await response.json();
  templateSelect.innerHTML = Object.keys(templates)
    .map((key) => `<option value="${key}">${key}</option>`)
    .join("");

  renderPreview();
}

async function refreshSession() {
  try {
    const result = await api("/api/session", { method: "GET" });
    session = result;
    setAuth("success", "Unlocked", "Password verified. You can submit requests.");
  } catch {
    session = null;
    setAuth("idle", "Locked", "Enter the app password before submitting requests.");
  }
}

async function submitRequest(event) {
  event.preventDefault();

  if (!session) {
    setStatus("error", "Blocked");
    payloadPreview.textContent = "Authentication required before submit.";
    return;
  }

  const payload = getPayload();
  if (!payload.name || !payload.email || !payload.template) {
    setStatus("error", "Error");
    payloadPreview.textContent = "Please fill in name, email, and template.";
    return;
  }

  setStatus("working", "Sending");
  emailForm.querySelector('button[type="submit"]').disabled = true;

  try {
    const result = await api("/api/email-requests", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setStatus("success", "Queued");
    payloadPreview.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    setStatus("error", "Error");
    payloadPreview.textContent = error.message;
  } finally {
    emailForm.querySelector('button[type="submit"]').disabled = false;
  }
}

loginBtn.addEventListener("click", async () => {
  try {
    await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: appPasswordInput.value })
    });
    appPasswordInput.value = "";
    await refreshSession();
  } catch (error) {
    setAuth("error", "Denied", error.message);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch {
    // Ignore logout failures and refresh state anyway.
  }
  await refreshSession();
});

emailForm.addEventListener("submit", submitRequest);
templateSelect.addEventListener("change", renderPreview);
document.getElementById("companyName").addEventListener("input", renderPreview);
document.getElementById("email").addEventListener("input", renderPayloadPreview);
document.getElementById("subject").addEventListener("input", renderPayloadPreview);
previewBtn.addEventListener("click", renderPreview);

Promise.all([loadTemplates(), refreshSession()])
  .then(() => {
    setStatus("idle", "Ready");
  })
  .catch((error) => {
    setStatus("error", "Error");
    payloadPreview.textContent = error.message;
  });
