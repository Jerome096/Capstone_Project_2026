// SQL orders coexist with the manual POS prototype without sharing record IDs.
const sqlOrders = {
  loading: false, changing: false, revision: 0, cache: new Map(), known: new Map(),
  olderOffset: null, historyLoaded: false, paymentOrder: null, paymentAttempt: null,
};
const sqlMoney = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value));
function sqlDate(value) {
  return value ? new Date(value.replace(" ", "T") + "Z").toLocaleString("en-PH") : "";
}
async function sqlOrderApi(input, query = "") {
  const response = await fetch(quvoPath("api/orders/index.php") + query, {
    method: input ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json", "X-CSRF-Token": window.QUVO_CSRF || "" },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Could not confirm the order action.");
  return data;
}
function sqlMapOrder(row) {
  return {
    id: "sql" + row.order_id, sqlId: row.order_id, persisted: true, number: row.order_number,
    table: row.table_name, customerName: row.customer_name, total: Number(row.total_amount),
    time: sqlDate(row.created_at), stage: row.order_status, source: "qr",
    paid: row.payment_status === "paid", paymentStatus: row.payment_status === "paid" ? "confirmed" : "pending",
    paymentMethod: row.payment_method, amountReceived: Number(row.amount_received || 0),
    change: Number(row.change_amount || 0), gcashReference: row.payment_reference || "",
    baristaStatus: row.order_status === "ready" ? "ready" : row.order_status === "preparing" ? "preparing" : null,
    items: (row.items || []).map(item => ({
      name: item.item_name, category: item.category, qty: Number(item.quantity), price: Number(item.unit_price),
      note: [item.customization.sugarLevel, item.customization.iceLevel, item.notes]
        .filter(x => x && x !== "Not applicable").join(" · "),
    })), raw: row,
  };
}
function sqlReceipt(row) {
  const order = sqlMapOrder(row);
  return {
    ...order, id: "sqlreceipt" + row.order_id, orderNumber: row.order_number,
    location: row.table_name, source: "Dine-in QR",
    status: row.order_status === "cancelled" ? "voided" : row.order_status === "served" ? "served" : "paid",
    time: sqlDate(row.paid_at || row.updated_at),
  };
}
function sqlRender() {
  renderOrders(); renderBaristaTickets(); renderReceipts(); renderStats(); lucide.createIcons();
  if (typeof refreshDashboardCompletion === "function") refreshDashboardCompletion();
}
function sqlUpdateReceipts() {
  state.receipts = [
    ...Array.from(sqlOrders.known.values())
      .filter(row => row.payment_status === "paid" || row.order_status === "cancelled")
      .sort((a, b) => Number(b.order_id) - Number(a.order_id)).map(sqlReceipt),
    ...state.receipts.filter(row => !row.persisted),
  ];
  document.getElementById("sqlOlderReceipts").hidden = sqlOrders.olderOffset === null;
}
async function sqlCompleteRows(rows) {
  const result = [];
  // Item snapshots are immutable, so only first sightings need a detail request.
  for (const row of rows) {
    let items = sqlOrders.cache.get(row.order_id);
    if (!items) {
      const detail = await sqlOrderApi(null, "?id=" + encodeURIComponent(row.order_id));
      items = detail.order.items;
      sqlOrders.cache.set(row.order_id, items);
      result.push(detail.order);
    } else {
      result.push({ ...row, items });
    }
  }
  return result;
}
async function loadSqlOrders() {
  if (sqlOrders.loading || sqlOrders.changing) return;
  sqlOrders.loading = true;
  const revision = sqlOrders.revision;
  try {
    let summaries = [], offset = 0;
    do {
      const data = await sqlOrderApi(null, "?status=open&offset=" + offset);
      summaries.push(...data.orders); offset = data.next_offset;
    } while (offset !== null);
    const recent = await sqlOrderApi(null, "?status=all");
    const open = await sqlCompleteRows(summaries);
    const history = await sqlCompleteRows(recent.orders);
    const disappeared = state.orders.filter(order => order.persisted && !open.some(row => row.order_id === order.sqlId));
    const finished = [];
    for (const order of disappeared) {
      finished.push((await sqlOrderApi(null, "?id=" + encodeURIComponent(order.sqlId))).order);
    }
    if (revision !== sqlOrders.revision) return;
    for (const row of [...history, ...open, ...finished]) sqlOrders.known.set(row.order_id, row);
    if (!sqlOrders.historyLoaded) {
      sqlOrders.olderOffset = recent.next_offset;
      sqlOrders.historyLoaded = true;
    }
    state.orders = [...open.filter(row => ["received", "preparing", "ready"].includes(row.order_status)).map(sqlMapOrder),
      ...state.orders.filter(order => !order.persisted)];
    sqlUpdateReceipts();
    document.getElementById("sqlOrderNotice").textContent = "Orders updated " + new Date().toLocaleTimeString();
    sqlRender();
  } catch (error) {
    document.getElementById("sqlOrderNotice").textContent = error.message + " Showing the last loaded orders; retrying automatically.";
  } finally {
    sqlOrders.loading = false;
  }
}
async function loadOlderSqlReceipts() {
  if (sqlOrders.olderOffset === null || sqlOrders.loading || sqlOrders.changing) return;
  sqlOrders.loading = true;
  try {
    const data = await sqlOrderApi(null, "?status=all&offset=" + sqlOrders.olderOffset);
    const rows = await sqlCompleteRows(data.orders);
    rows.forEach(row => sqlOrders.known.set(row.order_id, row));
    sqlOrders.olderOffset = data.next_offset;
    sqlUpdateReceipts(); renderReceipts();
  } catch (error) { showToast(error.message); }
  finally { sqlOrders.loading = false; }
}
function installSqlOrder(row) {
  sqlOrders.cache.set(row.order_id, row.items);
  sqlOrders.known.set(row.order_id, row);
  state.orders = state.orders.filter(order => !(order.persisted && order.sqlId === row.order_id));
  if (["received", "preparing", "ready"].includes(row.order_status)) state.orders.unshift(sqlMapOrder(row));
  sqlUpdateReceipts(); sqlRender();
}
function renderSqlOrderCard(order) {
  const e = escapeHtml;
  const row = order.raw;
  let actions = "";
  if (row.order_status === "received") {
    actions = '<button class="btn dark" onclick="openSqlPayment(\'' + order.id + '\')">Collect payment</button>';
    if (QUVO_AUTH.getSession()?.role === "admin") {
      actions += '<button class="btn light" onclick="cancelSqlOrder(\'' + order.sqlId + '\')">Cancel order</button>';
    }
  } else {
    const next = row.order_status === "preparing" ? "ready" : "served";
    actions = '<button class="btn green" onclick="changeSqlOrderStatus(\'' + order.sqlId + '\',\'' + next + '\')">Mark order ' + next + "</button>";
  }
  return '<article class="order-card"><div class="order-top"><strong>' + e(order.number) +
    '</strong><span class="table-chip">' + e(order.table) + '</span></div><p class="order-context">Customer: ' +
    e(order.customerName) + '</p><div class="order-total">' + sqlMoney(row.total_amount) +
    '</div><div class="order-payment ' + (order.paid ? "confirmed" : "pending") + '">' +
    (order.paid ? "Paid · " + e(order.paymentMethod) : "Unpaid · Cashier payment required") +
    '</div><div class="item-list">' + order.items.map(item => '<div class="item-row"><span>' +
      e(item.qty + " × " + item.name) + "</span><span>" + sqlMoney(item.qty * item.price) + "</span>" +
      (item.note ? '<div class="item-note">' + e(item.note) + "</div>" : "") + "</div>").join("") +
    '</div><p class="helper-text">' + e(order.time) + '</p><div class="card-actions">' + actions + "</div></article>";
}
function openSqlPayment(id) {
  if (sqlOrders.changing) return;
  const order = state.orders.find(row => row.id === id);
  if (!order || order.paid || order.stage !== "received") return;
  sqlOrders.paymentOrder = order;
  sqlOrders.paymentAttempt = null;
  document.getElementById("sqlPaymentTitle").textContent = "Collect payment · " + order.number;
  document.getElementById("sqlPaymentTotal").textContent = sqlMoney(order.total);
  document.getElementById("sqlPaymentMethod").value = "Cash";
  document.getElementById("sqlAmountReceived").value = "";
  document.getElementById("sqlPaymentReference").value = "";
  document.getElementById("sqlPaymentError").textContent = "";
  document.getElementById("sqlPaymentModal").classList.remove("hidden");
  updateSqlPayment();
}
function closeSqlPayment() {
  if (sqlOrders.changing) return;
  document.getElementById("sqlPaymentModal").classList.add("hidden");
  sqlOrders.paymentOrder = null;
  sqlOrders.paymentAttempt = null;
}
function updateSqlPayment() {
  const cash = document.getElementById("sqlPaymentMethod").value === "Cash";
  document.getElementById("sqlCashFields").hidden = !cash;
  document.getElementById("sqlReferenceFields").hidden = cash;
  const total = Number(sqlOrders.paymentOrder?.total || 0);
  const received = Number(document.getElementById("sqlAmountReceived").value);
  document.getElementById("sqlPaymentChange").textContent = sqlMoney(Math.max(0, Math.round((received - total) * 100) / 100));
  document.getElementById("sqlPaymentConfirm").textContent = sqlOrders.paymentAttempt ? "Retry payment confirmation" : "Confirm payment received";
  document.querySelectorAll("#sqlPaymentForm input, #sqlPaymentForm select").forEach(el => el.disabled = sqlOrders.changing || Boolean(sqlOrders.paymentAttempt));
  document.getElementById("sqlPaymentConfirm").disabled = sqlOrders.changing;
}
async function confirmSqlPayment(event) {
  event.preventDefault();
  if (sqlOrders.changing || !sqlOrders.paymentOrder) return;
  const order = sqlOrders.paymentOrder;
  if (!sqlOrders.paymentAttempt) {
    const method = document.getElementById("sqlPaymentMethod").value;
    const amount = method === "Cash" ? document.getElementById("sqlAmountReceived").value.trim() : order.raw.total_amount;
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount) || Number(amount) < order.total) {
      document.getElementById("sqlPaymentError").textContent = "Enter the full amount received with at most two decimal places.";
      return;
    }
    if (!window.confirm("Confirm " + method + " payment for " + order.number + " (" + sqlMoney(order.total) +
      "), with change of " + sqlMoney(Number(amount) - order.total) + "? This sends the order to preparation.")) return;
    sqlOrders.paymentAttempt = {
      action: "pay", id: order.sqlId, payment_method: method, amount_received: amount,
      payment_reference: method === "Cash" ? "" : document.getElementById("sqlPaymentReference").value.trim(),
    };
  }
  sqlOrders.changing = true; sqlOrders.revision++; updateSqlPayment();
  let succeeded = false;
  try {
    const data = await sqlOrderApi(sqlOrders.paymentAttempt);
    installSqlOrder(data.order);
    succeeded = true;
    showToast(data.replayed ? "Previously confirmed payment restored." : "Payment saved. Order is preparing.");
  } catch (error) {
    document.getElementById("sqlPaymentError").textContent = error.message + " Retry to confirm the saved result, or close and refresh orders.";
  } finally {
    sqlOrders.changing = false;
    if (succeeded) closeSqlPayment(); else updateSqlPayment();
    await loadSqlOrders();
  }
}
async function changeSqlOrderStatus(id, status) {
  if (sqlOrders.changing || !window.confirm("Mark the entire order as " + status + "?")) return;
  await mutateSqlOrder({ action: "status", id, status });
}
async function cancelSqlOrder(id) {
  if (sqlOrders.changing) return;
  const reason = window.prompt("Reason for cancelling this unpaid order:");
  if (!reason?.trim()) return;
  if (!window.confirm("Cancel this unpaid order? Its history will be kept.")) return;
  await mutateSqlOrder({ action: "cancel", id, reason: reason.trim() });
}
async function mutateSqlOrder(payload) {
  sqlOrders.changing = true; sqlOrders.revision++;
  try {
    const result = await sqlOrderApi(payload);
    installSqlOrder(result.order);
    showToast("Order saved: " + result.order.order_status + ".");
  } catch (error) { showToast(error.message); }
  finally { sqlOrders.changing = false; await loadSqlOrders(); }
}
function renderSqlReceipt(receipt) {
  const raw = receipt.raw, e = escapeHtml;
  const row = (label, value) => '<div class="receipt-line"><span>' + e(label) + "</span><b>" + e(value) + "</b></div>";
  return '<div class="receipt-paper"><h3>Quvo Café</h3><p>Payment record</p>' +
    row("Order", raw.order_number) + row("Customer", raw.customer_name) + row("Table", raw.table_name) +
    row("Status", raw.order_status) + row("Time", receipt.time) +
    '<div class="receipt-items">' + receipt.items.map(item =>
      row(item.qty + " × " + item.name, sqlMoney(item.qty * item.price)) +
      (item.note ? '<p class="helper-text">' + e(item.note) + "</p>" : "")).join("") + "</div>" +
    row("Total", sqlMoney(raw.total_amount)) +
    (raw.payment_status === "paid" ? row("Payment", raw.payment_method) + row("Received", sqlMoney(raw.amount_received)) +
      row("Change", sqlMoney(raw.change_amount)) + (raw.payment_reference ? row("Reference", raw.payment_reference) : "") :
      row("Cancellation reason", raw.cancellation_reason || "")) + "</div>";
}
function bindSqlOrders() {
  document.getElementById("sqlPaymentForm").addEventListener("submit", confirmSqlPayment);
  document.getElementById("sqlPaymentMethod").addEventListener("change", updateSqlPayment);
  document.getElementById("sqlAmountReceived").addEventListener("input", updateSqlPayment);
  document.getElementById("sqlPaymentClose").addEventListener("click", closeSqlPayment);
  document.getElementById("sqlOrdersRefresh").addEventListener("click", loadSqlOrders);
  document.getElementById("sqlOlderReceipts").addEventListener("click", loadOlderSqlReceipts);
  loadSqlOrders();
  setInterval(loadSqlOrders, 5000);
}
