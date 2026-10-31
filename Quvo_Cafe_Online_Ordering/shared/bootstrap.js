async function initializeCustomerApp() {
  const initialScreen=QuvoStorefront.initialScreen();
  QuvoStorefront.bind();
  renderCategories();
  renderMenu();
  renderCart();
  renderTracking();
  renderHistory();
  bindLoginEvents();
  bindRegisterEvents();
  bindMenuEvents();
  bindNavigationEvents();
  bindTrackingEvents();
  bindCustomizationEvents();
  bindCheckoutEvents();
  bindCartEvents();
  bindAccountEvents();
  window.QuvoReadyAlerts?.start({channel:"online",onSelect:selectOnlineOrder,onVisible:()=>refreshOnlineOrders()});

  document.getElementById("refreshOnlineMenu").addEventListener("click",()=>refreshOnlineMenu().catch(error=>showToast(error.message)));
  window.QuvoOrdering?.start();
  startOnlineFlow();
  const [session]=await Promise.allSettled([onlineApi(),refreshOnlineMenu(),QuvoStorefront.loadAbout()]);
  if(session.status==='fulfilled'&&!session.value.account)await restoreRegistration();
  if(session.status==='fulfilled'&&session.value.account){await enterOnlineAccount(session.value.account);if(initialScreen!=='screenHome')showScreen(initialScreen);}
  else if(!onlinePublicScreens.includes(initialScreen))QuvoStorefront.requestLogin(initialScreen);
  else if(session.status==='rejected')showToast('Some account features could not connect. You can still explore the website.');
}
