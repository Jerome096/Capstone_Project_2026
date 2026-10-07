// The server owns approval; polling only displays the session attached to this browser's cookie.
const nameForm = document.getElementById("nameForm");
const customerNameInput = document.getElementById("customerName");
const nameError = document.getElementById("nameError");
const sessionRequestCode = document.getElementById("sessionRequestCode");
const sessionRequestStatus = document.getElementById("sessionRequestStatus");
const cancelSessionRequestBtn = document.getElementById("cancelSessionRequestBtn");
let guestCsrf = "";
let guestTableCode = "";
let guestGeneration = 0;
let guestActionBusy = false;
let guestSessionStatus = null;
let guestActionError = "";
function applyTableContextFromUrl() {
  guestTableCode = new URLSearchParams(location.search).get("table") || "";
  return /^[A-Za-z0-9-]{1,20}$/.test(guestTableCode);
}
function setTableLabels() {
  document.getElementById("welcomeTableLabel").textContent =
    CUSTOMER_DATA.tableNumber || "Scan your table QR";
  document.getElementById("waitingTableLabel").textContent =
    CUSTOMER_DATA.tableNumber || "your table";
}
async function guestSessionApi(input, view = "") {
  const response = await fetch(
    "api/session.php?table=" + encodeURIComponent(guestTableCode) + (view ? "&view=" + view : ""),
    {
      method: input ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": guestCsrf },
      signal: AbortSignal.timeout(15000),
      ...(input ? { body: JSON.stringify(input) } : {}),
    },
  );
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Open this customer page through the PHP server to connect to sessions.");
  }
  if (!response.ok || !data.ok) throw new Error(data.error || "Could not contact the café.");
  if (data.csrf) guestCsrf = data.csrf;
  return data;
}
function clearSessionApprovalTimer() {
  clearTimeout(state.sessionApprovalTimer);
  state.sessionApprovalTimer = null;
}
function lockGuestMenu() {
  // Closing a session or losing verification clears protected menu and cart state immediately.
  state.sessionApproved = false;
  state.cart = [];
  state.selectedItem = null;
  CUSTOMER_DATA.menuItems = [];
  CUSTOMER_DATA.categories = ["All"];
  closeItemModal();
  renderCategories();
  renderMenu();
  renderCart();
}
async function applyGuestSession(data, generation) {
  if (generation !== guestGeneration) return;
  CUSTOMER_DATA.tableNumber = data.table.name;
  setTableLabels();
  guestSessionStatus = data.session?.status || null;
  nameForm.querySelector('button[type="submit"]').disabled = !data.table.active;
  if (data.table.active && guestSessionStatus === "active") {
    const wasApproved = state.sessionApproved;
    if (!wasApproved) {
      // Fetching menu data performs another server-side approval check before opening the menu.
      const menu = await guestSessionApi(null, "menu");
      if (generation !== guestGeneration) return;
      CUSTOMER_DATA.menuItems = menu.items;
      CUSTOMER_DATA.categories = ["All", ...new Set(menu.items.map((item) => item.category))];
      state.selectedCategory = "All";
      state.searchTerm = "";
      menuSearch.value = "";
    }
    state.customerName = data.session.guest_name;
    state.sessionApproved = true;
    renderCategories();
    renderMenu();
    configureMenuHeader();
    if (!wasApproved) showScreen("screenMenu");
  } else if (data.table.active && guestSessionStatus === "pending") {
    lockGuestMenu();
    state.customerName = data.session.guest_name;
    state.sessionRequestCode = "QVO-" + data.session.session_id;
    sessionRequestCode.textContent = state.sessionRequestCode;
    sessionRequestStatus.textContent =
      "Waiting for staff confirmation. This page updates automatically.";
    showScreen("screenWaiting");
  } else {
    lockGuestMenu();
    state.sessionRequestCode = "";
    state.customerName = "";
    showScreen("screenDineInStart");
    nameError.textContent =
      guestActionError ||
      (!data.table.active
        ? "This table is not accepting requests. Please ask staff."
        : guestSessionStatus === "rejected"
          ? "Your request was declined. Please speak to a staff member."
          : guestSessionStatus === "closed"
            ? "Your session has ended. A new visit needs a new approval."
            : guestSessionStatus === "cancelled"
              ? "Your request was cancelled."
              : "");
  }
}
function scheduleGuestCheck(generation) {
  if (generation !== guestGeneration || state.accessMode !== "dineIn") return;
  // An older response must not cancel the polling timer started by a newer request.
  clearSessionApprovalTimer();
  state.sessionApprovalTimer = setTimeout(() => refreshGuestSession(generation), 5000);
}
async function refreshGuestSession(generation = guestGeneration) {
  if (guestActionBusy || generation !== guestGeneration) return;
  try {
    await applyGuestSession(await guestSessionApi(), generation);
  } catch (error) {
    if (generation !== guestGeneration) return;
    lockGuestMenu();
    if (guestSessionStatus === "pending" || guestSessionStatus === "active") {
      showScreen("screenWaiting");
      sessionRequestStatus.textContent = error.message + " Retrying automatically.";
    } else {
      showScreen("screenDineInStart");
      nameError.textContent = error.message;
    }
    nameForm.querySelector('button[type="submit"]').disabled = true;
  } finally {
    scheduleGuestCheck(generation);
  }
}
async function startDineInFlow() {
  state.accessMode = "dineIn";
  state.onlineCustomer = null;
  state.order = null;
  state.orderStatusIndex = 0;
  guestSessionStatus = null;
  guestGeneration++;
  clearSessionApprovalTimer();
  clearOrderStatusTimers();
  lockGuestMenu();
  showScreen("screenDineInStart");
  nameError.textContent = "Checking this table…";
  nameForm.querySelector('button[type="submit"]').disabled = true;
  if (!applyTableContextFromUrl()) {
    nameError.textContent = "Please scan a valid table QR.";
    return;
  }
  await refreshGuestSession(guestGeneration);
}
async function handleNameSubmit(event) {
  event.preventDefault();
  if (guestActionBusy) return;
  const name = customerNameInput.value.trim();
  if (!name || [...name].length > 100) {
    nameError.textContent = "Enter a name with 1 to 100 characters.";
    return;
  }
  await changeGuestSession({ action: "request", name });
}
async function changeGuestSession(input) {
  if (guestActionBusy) return;
  guestActionError = "";
  guestActionBusy = true;
  const generation = ++guestGeneration;
  clearSessionApprovalTimer();
  nameForm.querySelector('button[type="submit"]').disabled = true;
  cancelSessionRequestBtn.disabled = true;
  try {
    await applyGuestSession(await guestSessionApi(input), generation);
  } catch (error) {
    nameError.textContent = error.message;
    guestActionError = error.message;
    sessionRequestStatus.textContent = error.message + " Checking the latest status…";
    showToast(error.message);
  } finally {
    guestActionBusy = false;
    cancelSessionRequestBtn.disabled = false;
    await refreshGuestSession(generation);
  }
}
function cancelSessionRequest() {
  if (window.confirm("Cancel your pending session request?"))
    changeGuestSession({ action: "cancel" });
}
function requestStaffAssistance() {
  showToast("Please speak to a café staff member for assistance.");
}
function bindDineInEvents() {
  nameForm.addEventListener("submit", handleNameSubmit);
  cancelSessionRequestBtn.addEventListener("click", cancelSessionRequest);
}
