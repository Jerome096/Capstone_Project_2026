function initNavigation() {
  document.querySelectorAll(".nav-item[data-screen]").forEach((button) => {
    button.addEventListener("click", () => {
      showScreen(button.dataset.screen);
    });
  });

  document.querySelectorAll(".nav-item[data-admin-screen]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetScreen = button.dataset.adminScreen;

      const openAdminScreen = () => {
        showScreen(targetScreen);
        addSystemRecord("Admin module opened", `${screenText[targetScreen].title} opened`, "Admin");
        renderRecords();
      };

      openAdminGate(openAdminScreen);
    });
  });
}

function showScreen(screen) {
  const allowedScreens = window.QUVO_CONFIG?.allowedScreens || [];
  if (!allowedScreens.includes(screen)) return;
  document.querySelectorAll(".nav-item").forEach((item) => {
    const itemScreen = item.dataset.screen || item.dataset.adminScreen;
    item.classList.toggle("active", itemScreen === screen);
  });

  document.querySelectorAll(".screen").forEach((section) => {
    section.classList.toggle("active-screen", section.id === screen);
  });

  const meta = screenText[screen];
  if (!meta) return;

  document.getElementById("screenEyebrow").textContent = meta.eyebrow;
  document.getElementById("screenTitle").textContent = meta.title;

  const runtimeSub =
    screen === "dashboard"
      ? getShiftSummary()
      : screen === "reports"
        ? `${new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })} · Current shift performance`
        : meta.sub;

  document.getElementById("screenSub").textContent = runtimeSub;
  // Returning to Sessions refreshes decisions made on other staff devices.
  if (screen === "sessions") loadSessions();

  if (screen === "accounts") {
    renderAccountForm();
  }

  if (screen === "salesHistory") {
    renderSalesHistory();
  }

  if (screen === "barista") {
    renderBaristaTickets();
  }

  lucide.createIcons();
}

function initClock() {
  const clock = document.getElementById("liveClock");

  function tick() {
    const now = new Date();
    clock.textContent = now.toLocaleTimeString("en-PH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  tick();
  setInterval(tick, 1000);
}
