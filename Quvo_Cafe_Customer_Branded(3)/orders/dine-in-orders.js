// Dine-in orders are saved by PHP; browser storage only preserves a retry after a lost response.
const dineOrders = { busy: false, loading: false, sessionId: "", pending: null, rows: [], selected: "", error: "" };

function dineStorageKey() {
  return "quvo_dine_pending_" + guestTableCode;
}
function saveDinePending(value) {
  // Refuse to send an order if its retry key cannot first be kept across refresh.
  if (value) sessionStorage.setItem(dineStorageKey(), JSON.stringify(value));
  else sessionStorage.removeItem(dineStorageKey());
  dineOrders.pending = value;
}
function restoreDinePending(sessionId) {
  if (dineOrders.sessionId === sessionId) return;
  dineOrders.sessionId = sessionId;
  dineOrders.rows = [];
  dineOrders.selected = "";
  state.order = null;
  try {
    const saved = JSON.parse(sessionStorage.getItem(dineStorageKey()) || "null");
    dineOrders.pending = saved && saved.sessionId === sessionId ? saved : null;
    if (!dineOrders.pending) sessionStorage.removeItem(dineStorageKey());
  } catch {
    dineOrders.pending = null;
  }
  if (dineOrders.pending) state.cart = dineOrders.pending.cart || [];
}
function dineCartLocked() {
  return state.accessMode === "dineIn" && (dineOrders.busy || Boolean(dineOrders.pending));
}
function dineUuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}
function dineMoneyTotal() {
  const cents = state.cart.reduce((sum, item) => sum + Math.round(Number(item.unitPrice) * 100) * item.quantity, 0);
  return (cents / 100).toFixed(2);
}
async function dineOrderApi(input, query = "") {
  const response = await fetch("api/orders.php?table=" + encodeURIComponent(guestTableCode) + query, {
    method: input ? "POST" : "GET",
    credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json", "X-CSRF-Token": guestCsrf },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error("Could not confirm the order. Retry to check its saved result."); }
  if (!response.ok || !data.ok) {
    const error = new Error(data.error || "Order service unavailable.");
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  if (data.csrf) guestCsrf = data.csrf;
  return data;
}
function setDineOrder(order) {
  state.order = { ...order, persisted: true, accessMode: "dineIn", orderCode: order.order_number };
  dineOrders.selected = order.order_id;
  renderTracking();
}
async function refreshDineOrders() {
  if (state.accessMode !== "dineIn" || !state.sessionApproved || dineOrders.loading || dineOrders.busy) return;
  dineOrders.loading = true;
  const sessionId = dineOrders.sessionId;
  try {
    // The order selector covers this visit, including orders submitted before a page refresh.
    let rows = [], offset = 0;
    do {
      const result = await dineOrderApi(null, "&offset=" + offset);
      rows.push(...result.orders);
      offset = result.next_offset;
    } while (offset !== null);
    if (sessionId !== dineOrders.sessionId || !state.sessionApproved || dineOrders.busy) return;
    dineOrders.rows = rows;
    const id = dineOrders.selected || rows[0]?.order_id;
    if (id) {
      const result = await dineOrderApi(null, "&id=" + encodeURIComponent(id));
      if (sessionId !== dineOrders.sessionId || !state.sessionApproved || dineOrders.busy || (dineOrders.selected && dineOrders.selected !== id)) return;
      setDineOrder(result.order);
    }
    dineOrders.error = "";
  } catch (error) {
    dineOrders.error = error.message + " Retrying automatically.";
  } finally {
    dineOrders.loading = false;
    renderDineOrderSelector();
    if (state.accessMode === "dineIn") renderTracking();
  }
}
async function selectDineOrder(id) {
  dineOrders.selected = id;
  try {
    const data = await dineOrderApi(null, "&id=" + encodeURIComponent(id));
    if (id !== dineOrders.selected || !state.sessionApproved) return;
    setDineOrder(data.order);
    dineOrders.error = "";
  } catch (error) {
    dineOrders.error = error.message;
    showToast(error.message);
  }
  renderDineOrderSelector();
}
function renderDineOrderSelector() {
  const select = document.getElementById("dineOrderSelect");
  if (!select) return;
  select.parentElement.hidden = state.accessMode !== "dineIn" || !dineOrders.rows.length;
  select.innerHTML = dineOrders.rows.map(order => '<option value="' + escapeCustomerHtml(order.order_id) + '">' +
    escapeCustomerHtml(order.order_number + " · " + order.order_status) + "</option>").join("");
  if (dineOrders.selected) select.value = dineOrders.selected;
}
async function refreshDineCartPrices() {
  const menu = await guestSessionApi(null, "menu");
  CUSTOMER_DATA.menuItems = menu.items;
  CUSTOMER_DATA.categories = ["All", ...new Set(menu.items.map(item => item.category))];
  state.cart = state.cart.flatMap(item => {
    const current = menu.items.find(entry => entry.id === item.itemId);
    return current ? [{ ...item, name: current.name, category: current.category, unitPrice: current.price }] : [];
  });
  state.selectedCategory = "All";
  renderCategories(); renderMenu(); renderCart();
}
async function submitDineOrder() {
  if (dineOrders.busy || !state.sessionApproved) return;
  if (!state.cart.length && !dineOrders.pending) return;
  if (!dineOrders.pending && !window.confirm("Submit this order for " + formatCurrency(dineMoneyTotal()) + "? Pay the full amount at the cashier.")) return;
  dineOrders.busy = true;
  let accepted = false;
  try {
    if (!dineOrders.pending) {
      const payload = {
        action: "submit", submission_key: dineUuid(), expected_total: dineMoneyTotal(),
        items: state.cart.map(item => ({ itemId: item.itemId, quantity: item.quantity, customization: item.customization })),
      };
      saveDinePending({ sessionId: dineOrders.sessionId, payload, cart: structuredClone(state.cart) });
    }
    renderCart();
    const result = await dineOrderApi(dineOrders.pending.payload);
    accepted = true;
    // Keeping an old retry key is safe if storage removal fails; never submit it as a new order.
    try { saveDinePending(null); } catch { dineOrders.pending = null; }
    state.cart = [];
    setDineOrder(result.order);
    showScreen("screenTracking");
    showToast(result.replayed ? "Your saved order has been restored." : "Order submitted. Please pay at the cashier.");
  } catch (error) {
    if (["price_changed", "item_unavailable"].includes(error.code) || [400, 413, 422].includes(error.status)) {
      try { saveDinePending(null); } catch { dineOrders.pending = null; }
      if (["price_changed", "item_unavailable"].includes(error.code)) {
        try { await refreshDineCartPrices(); } catch { /* The existing cart is kept for review. */ }
      }
      showToast(error.message + " Review your cart before submitting again.");
    } else {
      showToast(error.message || "Could not confirm the order. Use Retry order.");
    }
  } finally {
    dineOrders.busy = false;
    renderCart();
    if (accepted) await refreshDineOrders();
  }
}
function renderDineTracking() {
  const order = state.order;
  const labels = { received: "Waiting for payment", preparing: "Preparing", ready: "Ready", served: "Served", cancelled: "Cancelled" };
  trackingOrderCode.textContent = order.order_number;
  trackingPayment.textContent = order.payment_status === "paid" ? "Paid · " + order.payment_method :
    order.payment_status === "not_due" ? "No payment due" : "Unpaid · Pay at cashier";
  trackingStatus.textContent = labels[order.order_status];
  const stamp = new Date(order.updated_at.replace(" ", "T") + "Z").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  trackingUpdatedAt.textContent = dineOrders.error || "Last checked " + new Date().toLocaleTimeString() + " · Updated " + stamp;
  const stages = ["received", "preparing", "ready", "served"];
  const index = stages.indexOf(order.order_status);
  statusTimeline.innerHTML = order.order_status === "cancelled"
    ? '<div class="empty-card"><h3>Order cancelled</h3><p>' + escapeCustomerHtml(order.cancellation_reason) + "</p></div>"
    : stages.map((stage, i) => '<article class="timeline-item ' + (i < index ? "done" : i === index ? "current" : "") +
      '"><div class="timeline-dot">' + (i + 1) + "</div><div><h3>" + labels[stage] + "</h3><p>" +
      ["The cashier will confirm your full payment.", "Staff are preparing your order.", "Your order is ready to serve.", "Your order has been served."][i] +
      "</p></div></article>").join("");
  const row = (label, value) => '<div class="ticket-row"><span>' + escapeCustomerHtml(label) + "</span><strong>" + escapeCustomerHtml(value) + "</strong></div>";
  trackingDetails.innerHTML = '<p class="eyebrow">Order details</p>' + row("Customer", order.customer_name) +
    row("Table", order.table_name) + order.items.map(item =>
      row(item.quantity + " × " + item.item_name, formatCurrency(item.line_total)) +
      '<p class="small-copy">' + escapeCustomerHtml(
        [item.customization.sugarLevel, item.customization.iceLevel, item.notes].filter(x => x && x !== "Not applicable").join(" · ")
      ) + "</p>").join("") + row("Total", formatCurrency(order.total_amount)) +
    (order.payment_status === "paid" ? row("Payment", order.payment_method) +
      row("Amount received", formatCurrency(order.amount_received)) + row("Change", formatCurrency(order.change_amount)) : "");
  renderDineOrderSelector();
}
