const dashboardCompletion = { count: 0, loading: false, closing: false, revision: 0 };

async function dashboardApi(input) {
  const response = await fetch(quvoPath("api/dashboard/index.php"), {
    method: input ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": window.QUVO_CSRF || "" },
    signal: AbortSignal.timeout(15000),
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Could not update the dashboard.");
  return data;
}

async function refreshDashboardCompletion() {
  if (dashboardCompletion.loading || dashboardCompletion.closing) return;
  dashboardCompletion.loading = true;
  const revision = dashboardCompletion.revision;
  try {
    const data = await dashboardApi();
    if (revision !== dashboardCompletion.revision) return;
    dashboardCompletion.count = Number(data.completed_today);
    renderStats();
  } catch (error) {
    console.error("Dashboard completion refresh failed:", error.message);
  } finally {
    dashboardCompletion.loading = false;
  }
}

function renderAll() {
  syncTableOrdersFromOrders();
  renderStats();
  renderTableMap();
  renderActivities();
  renderMenu();
  renderCart();
  renderSessions();
  renderOrders();
  renderBaristaTickets();
  renderReceipts();
  renderReports();
  renderAdminMenu();
  renderRecords();
  renderSalesHistory();
  renderInventory();
  renderAlerts();
  lucide.createIcons();
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
  const completedToday = dashboardCompletion.count + state.receipts.filter(
    (receipt) => !receipt.persisted && !receipt.closedByEod &&
      (receipt.status === "served" || receipt.status === "completed"),
  ).length;
  document.getElementById("completedTodayStat").textContent = completedToday;
}

function renderTableMap() {
  const map = document.getElementById("tableMap");

  if (!state.insideTables.length && !state.outsideTables.length) {
    map.innerHTML = `<div class="helper-text">No table data loaded. Table records will be populated from the database.</div>`;
    return;
  }

  const insideTables = state.insideTables
    .map((table) => {
      const hasOrder = table.orders > 0;
      return `
      <article class="table-box ${hasOrder ? "has-order" : "no-order"}">
        <div class="table-type">${table.type}</div>
        <div class="table-number">${table.id}</div>
        <div class="table-orders">${hasOrder ? `${table.orders} ${pluralize(table.orders, "order")}` : "No orders"}</div>
      </article>
    `;
    })
    .join("");

  const outsideTables = state.outsideTables
    .map((table) => {
      const hasOrder = table.orders > 0;
      return `
      <article class="table-box ${hasOrder ? "has-order" : "no-order"}">
        <div class="table-type">${table.type}</div>
        <div class="table-number">${table.id}</div>
        <div class="table-orders">${hasOrder ? `${table.orders} ${pluralize(table.orders, "order")}` : "No orders"}</div>
      </article>
    `;
    })
    .join("");

  map.innerHTML = `
    <section class="floor-subsection floor-area inside-area">
      <div class="floor-subtitle-row">
        <h3 class="floor-subtitle">Inside</h3>
        <span class="area-chip indoor-chip">Indoor area</span>
      </div>
      <div class="table-map-grid">
        ${insideTables}
      </div>
    </section>

    <section class="floor-subsection floor-area outside-area">
      <div class="floor-subtitle-row">
        <h3 class="floor-subtitle">Outside</h3>
        <span class="area-chip outdoor-chip">Outdoor area</span>
      </div>
      <div class="outside-grid">
        ${outsideTables}
      </div>
    </section>

    <p class="table-map-note">Table indicators reflect active order data only.</p>
  `;
}

function renderActivities() {
  const list = document.getElementById("activityList");
  list.innerHTML = state.activities.length
    ? state.activities
        .map(
          (activity) => `
    <article class="activity-card">
      <span class="time">${activity.time}</span>
      <span class="status-tag tag-${activity.type}">${activity.tag}</span>
      <div class="activity-title">${activity.text}</div>
      <div class="activity-table">${activity.table}</div>
    </article>
  `,
        )
        .join("")
    : `<div class="helper-text">No activity records loaded.</div>`;
}

function bindEodModal() {
  document.getElementById("openEodBtn")?.addEventListener("click", openEodModal);

  document.getElementById("eodClose")?.addEventListener("click", closeEodModal);

  document.getElementById("eodCancel")?.addEventListener("click", closeEodModal);

  document.getElementById("eodConfirm")?.addEventListener("click", confirmEod);

  document.getElementById("eodModal")?.addEventListener("click", (event) => {
    if (event.target.id === "eodModal") closeEodModal();
  });
}

function openEodModal() {
  renderEodSummary();
  document.getElementById("eodNote").value = "";
  document.getElementById("eodModal").classList.remove("hidden");
  lucide.createIcons();
}

function closeEodModal() {
  document.getElementById("eodModal").classList.add("hidden");
}

function calculateEodTotals() {
  const receiptTransactions = state.receipts
    .filter((receipt) => receipt.status !== "voided")
    .map((receipt) => ({
      total: receipt.total,
      paymentMethod: receipt.paymentMethod,
      status: receipt.status,
    }));

  const activePaidOrders = state.orders
    .filter((order) => order.paymentStatus === "confirmed" || order.paid)
    .map((order) => ({
      total: order.total,
      paymentMethod: order.paymentMethod || "Cash",
      status: order.stage,
    }));

  const transactions = [...receiptTransactions, ...activePaidOrders];
  const totalSales = transactions.reduce((sum, entry) => sum + Number(entry.total || 0), 0);
  const cashSales = transactions
    .filter((entry) => entry.paymentMethod === "Cash")
    .reduce((sum, entry) => sum + Number(entry.total || 0), 0);
  const gcashSales = transactions
    .filter((entry) => entry.paymentMethod === "GCash")
    .reduce((sum, entry) => sum + Number(entry.total || 0), 0);
  const paymayaSales = transactions
    .filter((entry) => entry.paymentMethod === "PayMaya")
    .reduce((sum, entry) => sum + Number(entry.total || 0), 0);
  const servedOrders = state.receipts.filter((receipt) => receipt.status === "served").length;
  const voidedOrders = state.receipts.filter((receipt) => receipt.status === "voided").length;
  const totalOrders = transactions.length;
  const averageOrderValue = totalOrders ? Math.round(totalSales / totalOrders) : 0;

  return {
    totalSales,
    cashSales,
    gcashSales,
    paymayaSales,
    totalOrders,
    servedOrders,
    voidedOrders,
    averageOrderValue,
  };
}

function renderEodSummary() {
  const totals = calculateEodTotals();
  const grid = document.getElementById("eodSummary");

  grid.innerHTML = `
    <div class="eod-metric"><span>Total sales</span><b>₱${totals.totalSales.toLocaleString("en-PH")}</b></div>
    <div class="eod-metric"><span>Cash</span><b>₱${totals.cashSales.toLocaleString("en-PH")}</b></div>
    <div class="eod-metric"><span>GCash</span><b>₱${totals.gcashSales.toLocaleString("en-PH")}</b></div>
    <div class="eod-metric"><span>PayMaya</span><b>₱${totals.paymayaSales.toLocaleString("en-PH")}</b></div>
    <div class="eod-metric"><span>Total orders</span><b>${totals.totalOrders}</b></div>
    <div class="eod-metric"><span>Served orders</span><b>${totals.servedOrders}</b></div>
    <div class="eod-metric"><span>Voided orders</span><b>${totals.voidedOrders}</b></div>
    <div class="eod-metric"><span>Average order</span><b>₱${totals.averageOrderValue.toLocaleString("en-PH")}</b></div>
    <div class="eod-metric"><span>Active orders</span><b>${state.orders.length}</b></div>
    <div class="eod-metric"><span>Receipts</span><b>${state.receipts.length}</b></div>
  `;
}

async function confirmEod() {
  if (dashboardCompletion.closing) return;
  dashboardCompletion.closing = true;
  dashboardCompletion.revision++;
  const button = document.getElementById("eodConfirm");
  button.disabled = true;
  try {
    const totals = calculateEodTotals();
    const note = document.getElementById("eodNote").value.trim();
    const saved = await dashboardApi({ action: "eod", note });
    dashboardCompletion.revision++;
    dashboardCompletion.count = Number(saved.completed_today);
    state.receipts.forEach(receipt => {
      if (!receipt.persisted && ["served", "completed"].includes(receipt.status)) receipt.closedByEod = true;
    });
    const record = {
      id: `EOD-${saved.closure_id}`,
      date: new Date().toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      period: "daily",
      ...totals,
      note,
    };

    state.eodRecords.unshift(record);
    persistEodRecords();
    addSystemRecord(
      "End of day completed",
      `${record.date} closed with ₱${record.totalSales.toLocaleString("en-PH")} total sales`,
      "EOD",
    );
    renderSalesHistory();
    renderStats();
    closeEodModal();
    showToast("End of day saved. Returning to login.");
    setTimeout(logoutToLogin, 650);
  } catch (error) {
    showToast(error.message || "EOD could not be saved. Please try again.");
  } finally {
    dashboardCompletion.closing = false;
    button.disabled = false;
  }
}

function loadPersistedEodRecords() {
  // Completion boundaries are shared through SQL; report totals still use the existing local view.
  refreshDashboardCompletion();
}

function persistEodRecords() {
  // The existing sales-history summary stays local; completion closures are saved by dashboardApi.
}
