function getStaffInitials(name) {
  const value = String(name || "Staff").trim();
  const parts = value.split(/\s+/).filter(Boolean);
  if (!parts.length) return "FP";
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function updateStaffIdentity() {
  const displayName = state.currentUser || "Staff";
  const initials = getStaffInitials(displayName);
  const roleLabel = QUVO_AUTH.getSession()?.role_label || "Staff";

  [
    document.getElementById("staffSessionName"),
    document.getElementById("topbarUserName"),
  ].forEach((target) => {
    if (target) target.textContent = displayName;
  });

  [
    document.getElementById("staffAvatar"),
    document.getElementById("topbarUserAvatar"),
  ].forEach((target) => {
    if (target) target.textContent = initials;
  });

  [
    document.getElementById("staffSessionRole"),
    document.getElementById("topbarUserRole"),
  ].forEach((target) => {
    if (target) target.textContent = roleLabel;
  });
}

function restoreStaffSession() {
  const config = window.QUVO_CONFIG || {};

  const session = QUVO_AUTH.requireAuth({ allowedRoles: config.allowedRoles });
  if (!session) return false;
  state.currentUser = session.full_name;
  document.body.classList.add("logged-in");
  state.adminUnlocked = session.role === "admin";
  updateAdminAccessVisual();
  renderAccountForm();
  updateStaffIdentity();

  const params = new URLSearchParams(window.location.search);
  const requested = params.get("screen");
  const allowedScreens = Array.isArray(config.allowedScreens)
    ? config.allowedScreens
    : [];
  const initialScreen =
    requested && allowedScreens.includes(requested)
      ? requested
      : config.initialScreen || "dashboard";

  showScreen(initialScreen);
  return true;
}

function getShiftSummary() {
  const now = new Date();
  const dateText = now.toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${dateText} · Current shift`;
}

async function logoutToLogin() {
  const button = document.getElementById("logoutBtn");
  if (button) button.disabled = true;
  try {
    await QUVO_AUTH.logout();
  } catch (error) {
    window.alert("Logout could not be completed. Refresh the page and try again.");
    if (button) button.disabled = false;
    return;
  }
  state.currentUser = null;
  state.adminUnlocked = false;

  const config = window.QUVO_CONFIG || {};
  if (config.standaloneWorkspace) {
    window.location.replace(config.loginUrl || "../login/login.php");
    return;
  }
}

function updateAdminAccessVisual() {
  document.body.classList.toggle("admin-mode", state.adminUnlocked);

  const indicator = document.getElementById("adminModeIndicator");
  if (indicator) {
    indicator.textContent = state.adminUnlocked
      ? "Admin access active"
      : "Staff access active";
    indicator.classList.toggle("relock-note", state.adminUnlocked);
  }

  const accountLabel = document.getElementById("accountAdminModeLabel");
  if (accountLabel) {
    accountLabel.textContent = state.adminUnlocked
      ? "Admin access active"
      : "Staff access";
  }

  if (window.lucide) lucide.createIcons();
}
