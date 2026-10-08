// Application bootstrap. Loaded after all HTML fragments and module scripts.
(function initializeQuvoApp() {
  loadPersistedEodRecords();
  document.getElementById("logoutBtn")?.addEventListener("click", logoutToLogin);
  initNavigation();
  initClock();
  bindAdminModal();
  bindEditModal();
  bindMenu();
  bindItemModal();
  bindCheckoutModal();
  bindOrderPaymentModal();
  bindBaristaTicketModal();
  bindPaymentReviewModal();
  bindReceipts();
  bindReceiptSuccessModal();
  bindAdminMenu();
  bindEodModal();
  bindSalesHistory();
  bindAccounts();
  bindInventory();
  renderAll();
  renderAccountForm();
  updateAdminAccessVisual();
  restoreStaffSession();
  updateStaffIdentity();
  loadMenuItems();
  // Start the SQL approval queue after the workspace fragments and render functions are ready.
  bindDiningSessions();
  bindSqlOrders();
  lucide.createIcons();
})();
