const registerForm = document.getElementById("registerForm");

const registerError = document.getElementById("registerError");

function handleRegister(event) {
  event.preventDefault();

  const name = document.getElementById("registerName").value.trim();
  const contact = document.getElementById("registerContact").value.trim();
  const email = document.getElementById("registerEmail").value.trim().toLowerCase();
  const address = document.getElementById("registerAddress").value.trim();
  const password = document.getElementById("registerPassword").value;
  const confirmPassword = document.getElementById("registerPasswordConfirm").value;

  if (!name || !contact || !email || !password || !confirmPassword) {
    registerError.textContent = "Please complete all required fields.";
    return;
  }

  if (!email.includes("@")) {
    registerError.textContent = "Please enter a valid email address.";
    return;
  }

  if (password.length < 6) {
    registerError.textContent = "Password must be at least 6 characters.";
    return;
  }

  if (password !== confirmPassword) {
    registerError.textContent = "Passwords do not match.";
    return;
  }

  if (state.accounts.some((entry) => entry.email.toLowerCase() === email)) {
    registerError.textContent = "An account with this email already exists.";
    return;
  }

  const account = { name, contact, email, address, password };
  state.accounts.push(account);
  saveAccounts();

  state.onlineCustomer = { ...account };
  state.customerName = name;
  persistActiveOnlineSession();
  registerError.textContent = "";
  configureMenuHeader();
  renderHistory();
  renderAccount();
  prefillDeliveryDetails();
  showToast("Account created successfully.");
  showScreen("screenMenu");
}

function bindRegisterEvents() {
  registerForm.addEventListener("submit", handleRegister);
}
