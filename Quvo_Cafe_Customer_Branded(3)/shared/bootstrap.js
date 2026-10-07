async function initializeCustomerApp() {
  // A table link enters dine-in even if its table value is missing or invalid.
  const openedFromTableQr = new URLSearchParams(window.location.search).has("table");
  applyTableContextFromUrl();
  state.onlineOrders = loadOnlineOrders();
  state.accounts = loadAccounts();
  setTableLabels();
  renderCategories();
  renderMenu();
  renderCart();
  renderTracking();
  renderHistory();
  bindDineInEvents();
  bindLoginEvents();
  bindRegisterEvents();
  bindMenuEvents();
  bindNavigationEvents();
  bindCustomizationEvents();
  bindCheckoutEvents();
  bindCartEvents();
  bindAccountEvents();

  if (openedFromTableQr) {
    await startDineInFlow();
  } else if (restoreActiveOnlineSession()) {
    configureMenuHeader();
    renderHistory();
    renderAccount();
    prefillDeliveryDetails();
    showScreen("screenMenu");
  } else {
    startOnlineFlow();
  }
}
