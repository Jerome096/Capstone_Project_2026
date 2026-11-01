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
  window.QuvoDinePayment?.bind();
  bindCartEvents();
  window.QuvoDineWifi?.bind();
  window.QuvoReadyAlerts?.start({channel:"dine",onSelect:async id=>{showScreen("screenTracking");await selectDineOrder(id);},onVisible:()=>refreshGuestSession()});
  window.QuvoOrdering?.start();
  await startDineInFlow();
}
