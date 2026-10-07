function renderBaristaTickets() {
  const list = document.getElementById("baristaTicketList");
  if (!list) return;

  const beverageOrders = state.orders.filter(
    (order) => getBeverageItems(order).length > 0,
  );
  const waiting = beverageOrders.filter(
    (order) => getBaristaStatus(order).key === "queued",
  ).length;
  const preparing = beverageOrders.filter(
    (order) => getBaristaStatus(order).key === "preparing",
  ).length;
  const ready = beverageOrders.filter(
    (order) => getBaristaStatus(order).key === "ready",
  ).length;

  document.getElementById("baristaTicketCount").textContent = beverageOrders.length;
  document.getElementById("baristaQueuedCount").textContent = waiting;
  document.getElementById("baristaPreparingCount").textContent = preparing;
  document.getElementById("baristaReadyCount").textContent = ready;

  list.innerHTML =
    beverageOrders.map((order) => renderBaristaTicketCard(order)).join("") ||
    `
    <article class="barista-empty">
      <i data-lucide="coffee"></i>
      <h2>No beverage tickets</h2>
      <p>Beverage-specific order data will appear here when orders include drinks.</p>
    </article>
  `;

  lucide.createIcons();
}

function renderBaristaTicketCard(order) {
  const beverageItems = getBeverageItems(order);
  const foodItems = getFoodItems(order);
  const status = getBaristaStatus(order);
  const canPrepare =
    isOrderPaymentConfirmed(order) &&
    status.key !== "preparing" &&
    status.key !== "ready";
  const canReady = isOrderPaymentConfirmed(order) && status.key !== "ready";
  const hasFoodItems = foodItems.length > 0;

  return `
    <article class="barista-ticket-card">
      <div class="barista-ticket-head">
        <div>
          <div class="barista-order-number">${order.number}</div>
          <div class="barista-meta-row">
            <span class="table-chip ${order.source === "manual" ? "manual-chip" : order.source === "online" ? "online-chip" : ""}">${getOrderSourceLabel(order.source)}</span>
            ${order.source !== "online" ? `<span class="table-chip">${escapeHtml(order.table)}</span>` : ""}
            ${order.fulfillment ? `<span class="table-chip">${escapeHtml(order.fulfillment)}</span>` : ""}
          </div>
        </div>
        <span class="barista-status ${status.className}">${status.label}</span>
      </div>

      <div class="barista-customer-line">
        <span>Customer</span>
        <b>${escapeHtml(order.customerName || "Guest")}</b>
      </div>

      <div class="barista-items">
        ${beverageItems
          .map(
            (item) => `
          <div class="barista-item-row">
            <div>
              <b>${item.qty}× ${escapeHtml(item.name)}</b>
              ${item.note ? `<p>${escapeHtml(item.note)}</p>` : `<p>No drink customization notes</p>`}
            </div>
            <span>₱${(item.qty * item.price).toLocaleString("en-PH")}</span>
          </div>
        `,
          )
          .join("")}
      </div>

      <div class="barista-ticket-note">
        ${
          hasFoodItems
            ? `Mixed order: ${foodItems.length} food/pastry item${foodItems.length === 1 ? "" : "s"} still handled by kitchen.`
            : `Beverage-only order. Marking drinks ready can move this order to Ready.`
        }
      </div>

      <div class="barista-actions">
        <button class="btn light" onclick="openBaristaTicketModal(${order.id})">
          <i data-lucide="printer" style="width:13px;height:13px;vertical-align:-2px;"></i>
          Generate ticket
        </button>
        ${canPrepare ? `<button class="btn light" onclick="markBeveragePreparing(${order.id})">Mark preparing</button>` : ""}
        ${canReady ? `<button class="btn dark" onclick="markBeverageReady(${order.id})">Mark beverage ready</button>` : ""}
      </div>
    </article>
  `;
}

function markBeveragePreparing(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;

  if (!isOrderPaymentConfirmed(order)) {
    showToast("Payment must be confirmed before beverage preparation.");
    return;
  }

  if (order.stage === "received") {
    order.stage = "preparing";
    order.expanded = false;
    if (getBeverageItems(order).length && !order.baristaStatus) {
      order.baristaStatus = "queued";
    }
  }

  order.baristaStatus = "preparing";

  state.activities.unshift({
    tag: "Barista",
    type: "blue",
    text: `Beverage ticket for ${order.number} marked preparing`,
    table: order.table,
    time: "now",
  });

  addSystemRecord(
    "Beverage preparing",
    `Barista beverage data for ${order.number} marked preparing`,
    "Order",
  );
  renderAll();
  showToast(`Beverage ticket ${order.number} marked as preparing.`);
}

function markBeverageReady(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;

  if (!isOrderPaymentConfirmed(order)) {
    showToast("Payment must be confirmed before marking beverages ready.");
    return;
  }

  order.baristaStatus = "ready";

  const foodItems = getFoodItems(order);
  if (!foodItems.length && order.stage !== "ready") {
    order.stage = "ready";
  }

  state.activities.unshift({
    tag: "Barista",
    type: "green",
    text: `Beverage ticket for ${order.number} marked ready`,
    table: order.table,
    time: "now",
  });

  addSystemRecord(
    "Beverage ready",
    `Barista beverage data for ${order.number} marked ready`,
    "Order",
  );
  renderAll();
  showToast(
    foodItems.length
      ? `Beverage ticket ${order.number} marked ready. Kitchen items remain separate.`
      : `Beverage-only order ${order.number} moved to Ready.`,
  );
}

function bindBaristaTicketModal() {
  const modal = document.getElementById("baristaTicketModal");
  if (!modal) return;

  document
    .getElementById("baristaTicketClose")
    .addEventListener("click", closeBaristaTicketModal);
  document
    .getElementById("baristaTicketDone")
    .addEventListener("click", closeBaristaTicketModal);
  document
    .getElementById("baristaTicketPrint")
    .addEventListener("click", printBaristaTicket);

  modal.addEventListener("click", (event) => {
    if (event.target.id === "baristaTicketModal") closeBaristaTicketModal();
  });
}

function openBaristaTicketModal(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;

  selectedBaristaOrderId = orderId;
  document.getElementById("baristaTicketContent").innerHTML =
    buildBaristaTicketPaper(order);
  document.getElementById("baristaTicketModal").classList.remove("hidden");
  lucide.createIcons();
}

function closeBaristaTicketModal() {
  document.getElementById("baristaTicketModal").classList.add("hidden");
  selectedBaristaOrderId = null;
}

function printBaristaTicket() {
  const order = state.orders.find((entry) => entry.id === selectedBaristaOrderId);
  if (order) {
    order.baristaTicketPrinted = true;
    addSystemRecord(
      "Beverage ticket generated",
      `Beverage ticket generated for ${order.number}`,
      "Order",
    );
  }

  renderAll();
  showToast(
    order
      ? `Beverage ticket generated for ${order.number}.`
      : "Beverage ticket generated.",
  );
  window.print();
}

function buildBaristaTicketPaper(order) {
  const beverageItems = getBeverageItems(order);
  const status = getBaristaStatus(order);

  return `
    <div class="receipt-paper barista-print-ticket">
      <h2>Quvo Cafe</h2>
      <div class="receipt-brand-sub">Barista beverage ticket</div>

      <div class="receipt-meta">
        <div class="receipt-line"><span>Order</span><b>${order.number}</b></div>
        <div class="receipt-line"><span>Source</span><b>${getOrderSourceLabel(order.source)}</b></div>
        <div class="receipt-line"><span>Location</span><b>${escapeHtml(order.table)}</b></div>
        <div class="receipt-line"><span>Customer</span><b>${escapeHtml(order.customerName || "Guest")}</b></div>
        ${order.fulfillment ? `<div class="receipt-line"><span>Fulfillment</span><b>${escapeHtml(order.fulfillment)}</b></div>` : ""}
        <div class="receipt-line"><span>Status</span><b>${status.label}</b></div>
      </div>

      <div class="receipt-items">
        ${beverageItems
          .map(
            (item) => `
          <div>
            <div class="receipt-item-name">
              <span>${item.qty}× ${escapeHtml(item.name)}</span>
              <b>Drink</b>
            </div>
            ${item.note ? `<div class="receipt-item-note">${escapeHtml(item.note)}</div>` : `<div class="receipt-item-note">No listed drink customization</div>`}
          </div>
        `,
          )
          .join("")}
      </div>

      <div class="receipt-review-note">
        Beverage-only data for barista preparation. Payment, final serving, voiding, and admin records remain under cashier/admin control.
      </div>
    </div>
  `;
}
