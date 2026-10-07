const screens = document.querySelectorAll(".screen");

const bottomNav = document.querySelector(".bottom-nav");

function canNavigateTo(screenId) {
  if (screenId === "screenDineInStart" || screenId === "screenOnlineAuth") {
    return true;
  }

  if (!state.accessMode) {
    showToast("Choose an ordering access mode first.");
    return false;
  }

  if (state.accessMode === "dineIn" && !state.sessionApproved) {
    showToast("Your table session must be approved before ordering.");
    return false;
  }

  if (state.accessMode === "online" && !state.onlineCustomer) {
    showToast("Please log in or register first.");
    return false;
  }

  if (
    (screenId === "screenHistory" || screenId === "screenAccount") &&
    state.accessMode !== "online"
  ) {
    showToast("This section is available to online customer accounts only.");
    return false;
  }

  return true;
}

function showScreen(screenId) {
  // Direct navigation also respects approval, while the API protects the underlying data.
  if (
    state.accessMode === "dineIn" &&
    !state.sessionApproved &&
    ["screenMenu", "screenCart", "screenTracking", "screenHistory", "screenAccount"].includes(
      screenId,
    )
  ) {
    screenId = guestSessionStatus === "pending" ? "screenWaiting" : "screenDineInStart";
  }

  // Blur controls before their screen slides away so mobile browsers do not scroll the app sideways.
  if (state.currentScreen !== screenId && document.activeElement?.closest(".screen")) {
    document.activeElement.blur();
  }
  document.querySelector(".app-frame").scrollLeft = 0;
  state.currentScreen = screenId;

  screens.forEach((screen) => {
    screen.classList.toggle("screen-active", screen.id === screenId);
  });

  const appScreens = [
    "screenMenu",
    "screenCart",
    "screenTracking",
    "screenHistory",
    "screenAccount",
  ];
  const shouldShowNav = appScreens.includes(screenId);

  bottomNav.style.display = shouldShowNav ? "grid" : "none";
  bottomNav.classList.toggle(
    "online-mode",
    state.accessMode === "online" && Boolean(state.onlineCustomer),
  );
  configureMenuHeader();
  updateNavState(screenId);
  updateFloatingCart();

  if (screenId === "screenHistory") {
    renderHistory();
  }

  if (screenId === "screenAccount") {
    renderAccount();
  }
}

function updateNavState(screenId) {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.nav === screenId);
  });
}

function bindNavigationEvents() {
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextScreen = button.dataset.nav;

      if (!canNavigateTo(nextScreen)) {
        return;
      }

      showScreen(nextScreen);
    });
  });
}
