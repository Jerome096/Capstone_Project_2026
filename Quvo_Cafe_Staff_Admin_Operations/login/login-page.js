(function () {
  "use strict";
  const username = document.getElementById("loginUsername");
  const password = document.getElementById("loginPassword");
  const button = document.getElementById("loginBtn");
  const buttonLabel = button.querySelector("span");
  const error = document.getElementById("loginError");
  const description = document.getElementById("loginDescription");
  const options = Array.from(document.querySelectorAll(".login-role-option"));
  let selectedAccess = "staff";

  function selectAccess(access) {
    if (button.disabled) return;
    selectedAccess = access === "admin" ? "admin" : "staff";
    options.forEach((option) => {
      const selected = option.dataset.access === selectedAccess;
      option.classList.toggle("active", selected);
      option.setAttribute("aria-checked", String(selected));
      option.tabIndex = selected ? 0 : -1;
    });
    const isAdmin = selectedAccess === "admin";
    description.textContent = isAdmin
      ? "Sign in with an administrator account to open the Admin workspace."
      : "Sign in with a staff account to open your operations workspace.";
    username.placeholder = isAdmin ? "Enter admin username" : "Enter staff username";
    buttonLabel.textContent = isAdmin ? "Sign in as Admin" : "Sign in as Staff";
    password.value = "";
    error.textContent = "";
    error.classList.add("hidden");
  }

  async function submitLogin() {
    if (button.disabled) return;
    error.classList.add("hidden");
    if (!username.value.trim() || !password.value) {
      error.textContent = "Enter your username and password.";
      error.classList.remove("hidden");
      (!username.value.trim() ? username : password).focus();
      return;
    }
    button.disabled = true;
    options.forEach((option) => {
      option.disabled = true;
    });
    button.setAttribute("aria-busy", "true");
    try {
      // PHP validates the selected access type before it creates the session.
      const result = await QUVO_AUTH.login(
        username.value.trim(),
        password.value,
        selectedAccess,
      );
      password.value = "";
      window.location.replace(result.redirect);
    } catch (failure) {
      error.textContent =
        failure instanceof SyntaxError || failure instanceof TypeError
          ? "Unable to reach the login service. Make sure the PHP server is running."
          : failure.message;
      error.classList.remove("hidden");
      password.value = "";
      password.focus();
    } finally {
      button.disabled = false;
      options.forEach((option) => {
        option.disabled = false;
      });
      button.removeAttribute("aria-busy");
    }
  }

  options.forEach((option, index) => {
    option.addEventListener("click", () => selectAccess(option.dataset.access));
    option.addEventListener("keydown", (event) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(
          event.key,
        )
      )
        return;
      event.preventDefault();
      if (button.disabled) return;
      const target =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : (index +
                (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1) +
                options.length) %
              options.length;
      selectAccess(options[target].dataset.access);
      options[target].focus();
    });
  });
  button.addEventListener("click", submitLogin);
  [username, password].forEach((input) =>
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitLogin();
      }
    }),
  );
  selectAccess("staff");
  if (window.lucide) lucide.createIcons();
})();
