// Clear only the obsolete kitchen prototype cache; never import its old tickets.
try{localStorage.removeItem("quvoKitchenFoodOrdersV3");}catch{}
bindKitchenLogin();bindKitchenNavigation();bindKitchenOrders();bindKitchenDetails();
document.getElementById("refreshViewBtn").addEventListener("click",loadKitchenOrders);
render();
initializeKitchenDatabase();

function render() {
  const preparingOrders = filteredOrders("preparing");
  const readyOrders = filteredOrders("ready");
  const allPreparing = orders.filter(order => order.status === "preparing");
  const allReady = orders.filter(order => order.status === "ready");
  const delayed = allPreparing.filter(order => getElapsedMinutes(order.receivedAt) >= 12);
  const totalItems = orders.reduce((total, order) => {
    return total + order.items.reduce((itemTotal, item) => itemTotal + item.qty, 0);
  }, 0);

  renderSummary(allPreparing, allReady, delayed, totalItems);
  renderCompactQueue(allPreparing);
  renderOrderColumn(preparingList, preparingOrders, "preparing");
  renderOrderColumn(readyList, readyOrders, "ready");
  renderAlerts(delayed);

  preparingCount.textContent = allPreparing.length;
  readyCount.textContent = allReady.length;
  queueBadge.textContent = `${allPreparing.length} food ticket${allPreparing.length === 1 ? "" : "s"}`;
}
