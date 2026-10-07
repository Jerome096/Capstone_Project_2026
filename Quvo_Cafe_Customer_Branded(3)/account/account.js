const accountAvatar = document.getElementById("accountAvatar");

const accountDisplayName = document.getElementById("accountDisplayName");

const accountDisplayEmail = document.getElementById("accountDisplayEmail");

const profileForm = document.getElementById("profileForm");

const profileName = document.getElementById("profileName");

const profileEmail = document.getElementById("profileEmail");

const profileContact = document.getElementById("profileContact");

const profileAddress = document.getElementById("profileAddress");

const profileError = document.getElementById("profileError");

const profileSuccess = document.getElementById("profileSuccess");

const passwordForm = document.getElementById("passwordForm");

const currentPassword = document.getElementById("currentPassword");

const newPassword = document.getElementById("newPassword");

const confirmNewPassword = document.getElementById("confirmNewPassword");

const passwordError = document.getElementById("passwordError");

const passwordSuccess = document.getElementById("passwordSuccess");

const accountOrdersBtn = document.getElementById("accountOrdersBtn");

const logoutBtn = document.getElementById("logoutBtn");

function renderAccount() {
  if (state.accessMode !== "online" || !state.onlineCustomer) {
    return;
  }

  const customer = state.onlineCustomer;
  const initials =
    String(customer.name || "Quvo Customer")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "QC";

  accountAvatar.textContent = initials;
  accountDisplayName.textContent = customer.name || "Customer";
  accountDisplayEmail.textContent = customer.email || "";
  profileName.value = customer.name || "";
  profileEmail.value = customer.email || "";
  profileContact.value = customer.contact || "";
  profileAddress.value = customer.address || "";

  profileError.textContent = "";
  profileSuccess.textContent = "";
  passwordError.textContent = "";
  passwordSuccess.textContent = "";
}

function handleProfileUpdate(event) {
  event.preventDefault();

  if (!state.onlineCustomer) return;

  const name = profileName.value.trim();
  const email = profileEmail.value.trim().toLowerCase();
  const contact = profileContact.value.trim();
  const address = profileAddress.value.trim();
  const previousEmail = state.onlineCustomer.email;

  profileError.textContent = "";
  profileSuccess.textContent = "";

  if (!name || !email || !contact) {
    profileError.textContent = "Name, email, and contact number are required.";
    return;
  }

  if (!email.includes("@")) {
    profileError.textContent = "Please enter a valid email address.";
    return;
  }

  const duplicate = state.accounts.some(
    (entry) =>
      entry.email.toLowerCase() === email &&
      entry.email.toLowerCase() !== previousEmail.toLowerCase(),
  );
  if (duplicate) {
    profileError.textContent = "Another account is already using this email address.";
    return;
  }

  const accountIndex = state.accounts.findIndex(
    (entry) => entry.email.toLowerCase() === previousEmail.toLowerCase(),
  );
  if (accountIndex === -1) {
    profileError.textContent = "Your account could not be updated.";
    return;
  }

  const updatedAccount = {
    ...state.accounts[accountIndex],
    name,
    email,
    contact,
    address,
  };

  state.accounts[accountIndex] = updatedAccount;
  state.onlineCustomer = { ...updatedAccount };
  state.customerName = name;

  if (email !== previousEmail.toLowerCase()) {
    state.onlineOrders = state.onlineOrders.map((order) => {
      if (String(order.accountEmail || "").toLowerCase() !== previousEmail.toLowerCase())
        return order;
      return { ...order, accountEmail: email };
    });

    if (
      state.order &&
      state.order.accessMode === "online" &&
      String(state.order.accountEmail || "").toLowerCase() === previousEmail.toLowerCase()
    ) {
      state.order.accountEmail = email;
    }

    saveOnlineOrders();
  }

  saveAccounts();
  persistActiveOnlineSession();
  configureMenuHeader();
  renderHistory();
  renderAccount();
  prefillDeliveryDetails(true);
  profileSuccess.textContent = "Profile changes saved.";
  showToast("Account profile updated.");
}

function handlePasswordUpdate(event) {
  event.preventDefault();

  if (!state.onlineCustomer) return;

  const current = currentPassword.value;
  const next = newPassword.value;
  const confirm = confirmNewPassword.value;

  passwordError.textContent = "";
  passwordSuccess.textContent = "";

  if (!current || !next || !confirm) {
    passwordError.textContent = "Please complete all password fields.";
    return;
  }

  if (current !== state.onlineCustomer.password) {
    passwordError.textContent = "Current password is incorrect.";
    return;
  }

  if (next.length < 6) {
    passwordError.textContent = "New password must be at least 6 characters.";
    return;
  }

  if (next !== confirm) {
    passwordError.textContent = "New passwords do not match.";
    return;
  }

  const accountIndex = state.accounts.findIndex(
    (entry) => entry.email.toLowerCase() === state.onlineCustomer.email.toLowerCase(),
  );
  if (accountIndex === -1) return;

  state.accounts[accountIndex] = { ...state.accounts[accountIndex], password: next };
  state.onlineCustomer = { ...state.onlineCustomer, password: next };
  saveAccounts();

  passwordForm.reset();
  passwordSuccess.textContent = "Password updated successfully.";
  showToast("Password updated.");
}

function logoutOnlineCustomer() {
  clearActiveOnlineSession();
  clearOrderStatusTimers();
  clearSessionApprovalTimer();

  state.accessMode = "online";
  state.customerName = "";
  state.onlineCustomer = null;
  state.order = null;
  state.orderStatusIndex = 0;
  state.cart = [];
  state.searchTerm = "";
  state.selectedCategory = "All";

  loginForm.reset();
  registerForm.reset();
  profileForm.reset();
  passwordForm.reset();
  switchAuthTab("login");
  renderCart();
  renderTracking();
  renderHistory();
  showScreen("screenOnlineAuth");
  showToast("You have been logged out.");
}

function bindAccountEvents() {
  profileForm.addEventListener("submit", handleProfileUpdate);
  passwordForm.addEventListener("submit", handlePasswordUpdate);
  accountOrdersBtn.addEventListener("click", () => showScreen("screenHistory"));
  logoutBtn.addEventListener("click", logoutOnlineCustomer);
}
