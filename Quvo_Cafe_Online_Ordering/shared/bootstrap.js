async function initializeCustomerApp() {
  renderCategories();
  renderMenu();
  renderCart();
  renderTracking();
  renderHistory();
  bindLoginEvents();
  bindRegisterEvents();
  bindMenuEvents();
  bindNavigationEvents();
  bindCustomizationEvents();
  bindCheckoutEvents();
  bindCartEvents();
  bindAccountEvents();

  document.getElementById("refreshOnlineMenu").addEventListener("click",()=>refreshOnlineMenu().catch(error=>showToast(error.message)));
  window.QuvoOrdering?.start();
  startOnlineFlow();
  try {const result=await onlineApi();if(result.account)await enterOnlineAccount(result.account);}
  catch(error){loginError.textContent=error.message;}
}
