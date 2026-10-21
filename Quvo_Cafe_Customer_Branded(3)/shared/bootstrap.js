async function initializeCustomerApp() {
  applyTableContextFromUrl();
  setTableLabels();
  renderCategories();
  renderMenu();
  renderCart();
  renderTracking();
  bindDineInEvents();
  bindMenuEvents();
  bindNavigationEvents();
  bindCustomizationEvents();
  bindCheckoutEvents();
  bindCartEvents();
  window.QuvoOrdering?.start();
  await startDineInFlow();
}
