// Menu overview counts and stock reminders.
const operationSummary = { count: 0, loading: false, closing: false, revision: 0 };
const operationStock = { items: [], loaded: false, error: "" };

function renderOperationStockAlerts() {
  const list = document.getElementById("operationStockAlerts");
  if (!list) return;
  document.getElementById("operationStockRefresh").disabled = operationSummary.loading || operationSummary.closing;
  document.getElementById("operationStockCount").textContent = operationStock.items.length;
  document.getElementById("operationStockStatus").textContent = operationStock.error || (!operationStock.loaded
    ? "Checking stock levels..." : operationStock.items.length
      ? operationStock.items.length + " stock " + (operationStock.items.length === 1 ? "item needs" : "items need") + " review. Ordering stays available."
      : "No stock reminders. Recorded materials are above their reminder levels.");
  const e = value => escapeHtml(value), qty = value => new Intl.NumberFormat("en-PH", { maximumFractionDigits: 3 }).format(Number(value));
  list.innerHTML = operationStock.items.map(item => `<article class="operation-stock-alert ${item.status === "out" ? "out" : "low"}">
    <div class="operation-stock-item-header"><b>${e(item.name)}</b><span>${item.status === "out" ? "Out of stock" : "Low stock"}</span></div>
    <p>Recorded: <strong>${qty(item.current)} ${e(item.unit)}</strong> · Reorder level: ${qty(item.reorder)} ${e(item.unit)}</p>
    ${item.menus?.length ? `<p>Used by: ${item.menus.map(e).join(", ")}</p>` : ""}
  </article>`).join("");
}

async function refreshOperationSummary() {
  if (operationSummary.loading || operationSummary.closing) return;
  operationSummary.loading = true;
  renderOperationStockAlerts();
  const revision = operationSummary.revision;
  try {
    const data = await operationsApi();
    if (revision !== operationSummary.revision) return;
    operationSummary.count = Number(data.completed_today);
    if (Array.isArray(data.stock_alerts)) {
      operationStock.items = data.stock_alerts;
      operationStock.loaded = true;
      operationStock.error = "";
    } else operationStock.error = "Stock reminders are unavailable. Use Refresh stock alerts to try again.";
    renderStats();
  } catch (error) {
    console.error("Operation summary refresh failed:", error.message);
    operationStock.error = "Could not refresh stock reminders." + (operationStock.loaded ? " Showing the last recorded alerts." : " Use Refresh stock alerts to try again.");
  } finally {
    operationSummary.loading = false;
    renderOperationStockAlerts();
  }
}

function syncTableOrdersFromOrders() {
  state.insideTables.forEach((table) => {
    table.orders = state.orders.filter((order) => order.table === `Table ${table.id}`).length;
  });

  state.outsideTables.forEach((table) => {
    table.orders = state.orders.filter((order) => order.table === `Outside ${table.id}`).length;
  });
}

function renderStats() {
  const activeOrderPoints = [
    ...state.insideTables.filter((table) => table.orders > 0),
    ...state.outsideTables.filter((table) => table.orders > 0),
  ].length;

  // Use the full SQL count even when the Sessions list is filtered or paginated.
  const pendingSessions = diningSessionState.counts.pending || 0;
  const activeOrders = state.orders.length;

  document.getElementById("activeTableStat").textContent = activeOrderPoints;
  document.getElementById("pendingSessionsStat").textContent = pendingSessions;
  document.getElementById("activeOrdersStat").textContent = activeOrders;
  const completedToday = operationSummary.count + state.receipts.filter(
    (receipt) => !receipt.persisted && !receipt.closedByEod &&
      (receipt.status === "served" || receipt.status === "completed"),
  ).length;
  document.getElementById("completedTodayStat").textContent = completedToday;
}
