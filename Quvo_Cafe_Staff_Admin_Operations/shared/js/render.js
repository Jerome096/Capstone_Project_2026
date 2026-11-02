// Refresh the current data across the loaded workspace modules.
function renderAll() {
  syncTableOrdersFromOrders();
  renderStats();
  renderOperationStockAlerts();
  renderMenu();
  renderCart();
  renderSessions();
  renderOrders();
  renderReceipts();
  renderReports();
  renderAdminMenu();
  renderRecords();
  renderSalesHistory();
  renderInventory();
  renderAlerts();
  lucide.createIcons();
}
