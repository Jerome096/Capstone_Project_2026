const historyList = document.getElementById("historyList");

function syncCurrentOrderToHistory() {
  if (!state.order || state.order.accessMode !== "online") return;
  const existing = state.onlineOrders.find((entry) => entry.orderCode === state.order.orderCode);
  if (!existing) return;

  existing.status = state.order.status;
  existing.statusIndex = state.order.statusIndex;
  existing.lastUpdated = state.order.lastUpdated;
  saveOnlineOrders();
  renderHistory();
}

function renderHistory() {
  if (state.accessMode !== "online" || !state.onlineCustomer) {
    historyList.innerHTML = `
      <div class="empty-card">
        <h3>Online account required</h3>
        <p>Order history is available only for registered online customer access.</p>
      </div>
    `;
    return;
  }

  const orders = state.onlineOrders.filter(
    (order) => order.accountEmail === state.onlineCustomer.email,
  );

  if (!orders.length) {
    historyList.innerHTML = `
      <div class="empty-card">
        <h3>No online order history yet</h3>
        <p>Submitted online orders will appear here with their fulfillment and payment details.</p>
      </div>
    `;
    return;
  }

  historyList.innerHTML = orders
    .map((order) => {
      return `
        <article class="history-card">
          <div class="history-head">
            <div>
              <p class="eyebrow">${order.source}</p>
              <h3>${order.orderCode}</h3>
            </div>
            <span class="count-pill">${order.status || "Completed"}</span>
          </div>
          <div class="ticket-row">
            <span>Fulfillment</span>
            <strong>${order.fulfillment}</strong>
          </div>
          <div class="ticket-row">
            <span>Payment</span>
            <strong>${order.paymentMethod}</strong>
          </div>
          <div class="ticket-row">
            <span>Items</span>
            <strong>${order.items.length}</strong>
          </div>
          <div class="ticket-row">
            <span>Total</span>
            <strong>${formatCurrency(order.total)}</strong>
          </div>
          <p class="small-copy">Submitted at ${order.submittedAt}.</p>
        </article>
      `;
    })
    .join("");
}

function addOrderToOnlineHistory(order) {
  order.status = order.status || "Received";
  order.statusIndex = Number.isInteger(order.statusIndex) ? order.statusIndex : 0;
  state.onlineOrders = [
    order,
    ...state.onlineOrders.filter((entry) => entry.orderCode !== order.orderCode),
  ];
  saveOnlineOrders();
}
