const loginForm = document.getElementById("loginForm");

const loginError = document.getElementById("loginError");

function startOnlineFlow() {
  state.accessMode = "online";
  state.customerName = "";
  state.onlineCustomer = null;
  state.order = null;
  state.orderStatusIndex = 0;
  state.cart = [];
  clearSessionApprovalTimer();
  clearOrderStatusTimers();
  renderCart();
  renderTracking();
  renderHistory();
  showScreen("screenOnlineAuth");
}

function switchAuthTab(tab) {
  state.authMode = tab;
  document.querySelectorAll(".auth-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.authTab === tab);
  });
  loginForm.classList.toggle("active", tab === "login");
  registerForm.classList.toggle("active", tab === "register");
  loginError.textContent = "";
  registerError.textContent = "";
}

function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    loginError.textContent = "Please enter your email and password.";
    return;
  }

  const account = state.accounts.find(
    (entry) => entry.email.toLowerCase() === email && entry.password === password,
  );

  if (!account) {
    loginError.textContent = "Invalid email or password.";
    return;
  }

  state.onlineCustomer = { ...account };
  state.customerName = account.name;
  persistActiveOnlineSession();
  loginError.textContent = "";
  configureMenuHeader();
  renderHistory();
  renderAccount();
  prefillDeliveryDetails();
  showToast(`Welcome back, ${account.name.split(" ")[0]}.`);
  showScreen("screenMenu");
}

function bindLoginEvents() {
  loginForm.addEventListener("submit", handleLogin);
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => switchAuthTab(button.dataset.authTab));
  });
}
