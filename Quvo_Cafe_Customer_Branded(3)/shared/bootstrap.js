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
  window.QuvoReadyAlerts?.start({channel:"dine",onSelect:async id=>{showScreen("screenTracking");await selectDineOrder(id);},onVisible:()=>refreshGuestSession()});
  window.QuvoOrdering?.start();
  await startDineInFlow();
}
