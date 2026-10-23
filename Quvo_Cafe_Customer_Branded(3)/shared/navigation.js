const screens = document.querySelectorAll(".screen");

const bottomNav = document.querySelector(".bottom-nav");

function canNavigateTo(screenId) {
  if (!["screenDineInStart", "screenWaiting", "screenMenu", "screenCart", "screenTracking"].includes(screenId)) return false;
  if (screenId === "screenDineInStart") return true;
  if (!state.sessionApproved) {
    showToast("Wait for cashier approval to open the menu.");
    return false;
  }
  return true;
}

function showScreen(screenId) {
  // Direct navigation also respects approval, while the API protects the underlying data.
  if (
    state.accessMode === "dineIn" &&
    !state.sessionApproved &&
    ["screenMenu", "screenCart", "screenTracking"].includes(
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
  ];
  const shouldShowNav = appScreens.includes(screenId);

  bottomNav.style.display = shouldShowNav ? "grid" : "none";
  configureMenuHeader();
  updateNavState(screenId);
  updateFloatingCart();
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
