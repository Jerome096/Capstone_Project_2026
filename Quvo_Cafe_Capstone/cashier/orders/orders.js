function renderOrders() {
  const board = document.getElementById("kanbanBoard");

  board.innerHTML = ["received", "preparing", "ready"]
    .map((stage) => {
      const orders = state.orders.filter((order) => order.stage === stage);
      const meta = stageMeta[stage];

      return `
      <section class="kanban-column">
        <div class="column-head">
          <div class="column-title">
            <span class="dot ${meta.dotClass}"></span>
            <span>${meta.title}</span>
          </div>
          <span class="count-badge ${meta.countClass}">${orders.length}</span>
        </div>
        <div class="order-stack">
          ${orders.map((order) => renderOrderCard(order, stage)).join("") || `<div class="helper-text">No orders in this stage.</div>`}
        </div>
      </section>
    `;
    })
    .join("");
}

function renderOrderCard(order, stage) {
  return `
    <article class="order-card">
      <div class="order-top">
        <div class="order-title-group">
          <span class="order-number">${order.number}</span>
          ${
            stage === "received"
              ? `
            <button class="card-menu-btn" onclick="openEditOrderModal(${order.id})" aria-label="Edit or void order ${order.number}">
              <i data-lucide="ellipsis-vertical"></i>
            </button>`
              : ""
          }
          <span class="table-chip ${order.source === "manual" ? "manual-chip" : order.source === "online" ? "online-chip" : ""}">${getOrderSourceLabel(order.source)}</span>
          ${renderOrderLocationChip(order)}
        </div>
        <div class="order-time"><i data-lucide="clock-3"></i>${order.time}</div>
      </div>

      <div class="order-total">₱${order.total.toLocaleString("en-PH")}</div>

      ${renderOrderContext(order)}

      ${renderOrderPayment(order)}

      <div class="item-list">
        ${renderOrderItems(order, stage)}
      </div>

      ${renderOrderActions(order)}
    </article>
  `;
}

function renderOrderLocationChip(order) {
  if (order.source === "online") {
    return "";
  }

  return `<span class="table-chip">${escapeHtml(order.table)}</span>`;
}

function renderOrderContext(order) {
  const lines = [];

  if (order.customerName) {
    lines.push(`<span>Customer: <b>${escapeHtml(order.customerName)}</b></span>`);
  }

  if (order.source === "online" && order.fulfillment) {
    lines.push(`<span>Fulfillment: <b>${escapeHtml(order.fulfillment)}</b></span>`);
  }

  if (!lines.length) {
    return "";
  }

  return `<div class="order-context">${lines.join("")}</div>`;
}

function renderOrderPayment(order) {
  const method = order.paymentMethod || "Cash";
  const confirmed = order.paymentStatus === "confirmed" || order.paid === true;
  const statusClass = confirmed ? "confirmed" : "pending";

  let detail = confirmed
    ? `Confirmed through ${getOrderSourceLabel(order.source)}`
    : getPaymentPendingText(method);
  if (confirmed && order.source === "manual") {
    detail = "Paid through counter POS";
  }

  const label = confirmed ? `Payment confirmed · ${method}` : `Payment: ${method}`;

  return `
    <div class="order-payment ${statusClass}">
      <span>${label}</span>
      <small>${detail}</small>
    </div>
  `;
}

function getMenuItemForOrderItem(orderItem) {
  return state.menu.find(
    (menuItem) => normalizeName(menuItem.name) === normalizeName(orderItem.name),
  );
}

function isBeverageOrderItem(orderItem) {
  const menuItem = getMenuItemForOrderItem(orderItem);
  if (menuItem) return isDrinkItem(menuItem);
  return (
    Boolean(orderItem.drinkOptions) ||
    /coffee|latte|cappuccino|espresso|brew|juice|tea|matcha|americano/i.test(
      orderItem.name || "",
    )
  );
}

function getBeverageItems(order) {
  return (order?.items || []).filter(isBeverageOrderItem);
}

function getFoodItems(order) {
  return (order?.items || []).filter((item) => !isBeverageOrderItem(item));
}

function isOrderPaymentConfirmed(order) {
  return order?.paymentStatus === "confirmed" || order?.paid === true;
}

function getBaristaStatus(order) {
  if (!isOrderPaymentConfirmed(order)) {
    return { key: "pending", label: "Waiting for payment", className: "pending" };
  }

  if (order.baristaStatus === "preparing") {
    return { key: "preparing", label: "Beverage preparing", className: "preparing" };
  }

  if (order.baristaStatus === "ready" || order.stage === "ready") {
    return { key: "ready", label: "Beverage ready", className: "ready" };
  }

  return { key: "queued", label: "Queued for barista", className: "queued" };
}

function bindOrderPaymentModal() {
  document
    .getElementById("orderPaymentClose")
    .addEventListener("click", closeOrderPaymentModal);
  document
    .getElementById("orderPaymentCancel")
    .addEventListener("click", closeOrderPaymentModal);

  document.getElementById("orderPaymentModal").addEventListener("click", (event) => {
    if (event.target.id === "orderPaymentModal") closeOrderPaymentModal();
  });

  document
    .getElementById("orderAmountReceived")
    .addEventListener("input", validateOrderPayment);
  document
    .getElementById("orderPaymentConfirm")
    .addEventListener("click", confirmOrderPayment);
}

function openOrderPaymentModal(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;

  paymentOrderId = orderId;

  const method = order.paymentMethod || "Cash";
  const isCash = method === "Cash";

  document.getElementById("orderPaymentTitle").textContent = isCash
    ? "Confirm cash payment"
    : `Confirm ${method} payment`;

  document.getElementById("orderPaymentMethod").textContent = method;
  document.getElementById("orderAmountReceived").value = "";
  document.getElementById("orderGcashReference").value = "";
  document.getElementById("orderReferenceLabel").textContent =
    `${getPaymentReferenceLabel(method)} no. optional`;
  document.getElementById("orderGcashReference").placeholder =
    `Enter ${method} reference number if available`;
  document.getElementById("orderChangeAmount").textContent = "₱0";

  document.getElementById("orderCashBlock").classList.toggle("hidden", !isCash);
  document.getElementById("orderChangeLine").classList.toggle("hidden", !isCash);
  document.getElementById("orderGcashBlock").classList.toggle("hidden", isCash);

  document.getElementById("orderPaymentSummary").innerHTML = `
    <div class="checkout-row">
      <span>Order</span>
      <b>${order.number}</b>
    </div>
    <div class="checkout-row">
      <span>Table</span>
      <b>${order.table}</b>
    </div>
    <div class="checkout-row checkout-total">
      <span>Total</span>
      <b>₱${order.total.toLocaleString("en-PH")}</b>
    </div>
    ${order.items
      .map(
        (item) => `
      <div>
        <div class="checkout-row">
          <span>${item.qty}× ${item.name}</span>
          <span>₱${(item.qty * item.price).toLocaleString("en-PH")}</span>
        </div>
        ${item.note ? `<div class="checkout-note">${escapeHtml(item.note)}</div>` : ""}
      </div>
    `,
      )
      .join("")}
  `;

  const confirm = document.getElementById("orderPaymentConfirm");
  confirm.textContent = isCash ? "Confirm cash received" : `Confirm ${method} received`;

  if (isCash) {
    confirm.disabled = true;
    confirm.classList.add("disabled");
  } else {
    confirm.disabled = false;
    confirm.classList.remove("disabled");
  }

  document.getElementById("orderPaymentModal").classList.remove("hidden");

  if (isCash) {
    setTimeout(() => document.getElementById("orderAmountReceived").focus(), 40);
  } else {
    setTimeout(() => document.getElementById("orderGcashReference").focus(), 40);
  }

  lucide.createIcons();
}

function validateOrderPayment() {
  const order = state.orders.find((entry) => entry.id === paymentOrderId);
  if (!order) return;

  const confirm = document.getElementById("orderPaymentConfirm");
  const amount = Number(document.getElementById("orderAmountReceived").value);
  const change = Math.max(0, amount - order.total);

  document.getElementById("orderChangeAmount").textContent =
    `₱${change.toLocaleString("en-PH")}`;

  if (amount >= order.total) {
    confirm.disabled = false;
    confirm.classList.remove("disabled");
  } else {
    confirm.disabled = true;
    confirm.classList.add("disabled");
  }
}

function confirmOrderPayment() {
  const order = state.orders.find((entry) => entry.id === paymentOrderId);
  if (!order) return;

  const method = order.paymentMethod || "Cash";
  const amountReceived =
    method === "Cash"
      ? Number(document.getElementById("orderAmountReceived").value)
      : order.total;
  const change = method === "Cash" ? Math.max(0, amountReceived - order.total) : 0;
  const paymentReference = isDigitalPayment(method)
    ? document.getElementById("orderGcashReference").value.trim()
    : "";

  pendingPaymentReview = {
    type: "qr",
    orderId: order.id,
    orderNumber: order.number,
    location: order.table,
    source: getOrderSourceLabel(order.source),
    customerName: order.customerName || "Guest",
    paymentMethod: method,
    total: order.total,
    amountReceived,
    change,
    gcashReference: paymentReference,
    items: order.items,
  };

  closeOrderPaymentModal();
  openPaymentReviewModal();
}

function closeOrderPaymentModal() {
  document.getElementById("orderPaymentModal").classList.add("hidden");
  paymentOrderId = null;
}

function renderOrderItems(order, stage) {
  const shouldCollapse =
    stage === "preparing" && order.items.length > 3 && !order.expanded;
  const visibleItems = shouldCollapse ? order.items.slice(0, 3) : order.items;

  const rows = visibleItems
    .map(
      (item) => `
    <div class="item-row">
      <span>${item.name}</span>
      <span class="item-qty">×${item.qty}</span>
      ${item.note ? `<div class="item-note">${escapeHtml(item.note)}</div>` : ""}
    </div>
  `,
    )
    .join("");

  if (stage !== "preparing" || order.items.length <= 3) return rows;

  const label = order.expanded
    ? "Show fewer ▴"
    : `Show all ${order.items.length} items ▾`;

  return `
    ${rows}
    <button class="show-toggle" onclick="toggleOrderItems(${order.id})">${label}</button>
  `;
}

function toggleOrderItems(id) {
  const order = state.orders.find((entry) => entry.id === id);
  if (!order) return;

  order.expanded = !order.expanded;
  renderOrders();
  lucide.createIcons();
}

function renderOrderActions(order) {
  if (order.stage === "received") {
    const needsPaymentConfirmation =
      order.source !== "manual" && order.paymentStatus !== "confirmed";

    if (needsPaymentConfirmation) {
      const label = getPaymentActionLabel(order.paymentMethod || "Cash");

      return `
        <div class="card-actions">
          <button class="btn dark" onclick="openOrderPaymentModal(${order.id})">${label}</button>
        </div>
      `;
    }

    return `
      <div class="card-actions">
        <button class="btn dark" onclick="startPreparing(${order.id})">Start preparing</button>
      </div>
    `;
  }

  if (order.stage === "preparing") {
    return `
      <div class="prep-notice">Waiting for kitchen/barista to mark ready</div>
    `;
  }

  return `
    <div class="card-actions">
      <button class="btn green" onclick="markServed(${order.id})">Mark served</button>
    </div>
  `;
}

function startPreparing(id) {
  const order = state.orders.find((entry) => entry.id === id);
  if (!order) return;

  if (order.source !== "manual" && order.paymentStatus !== "confirmed") {
    openOrderPaymentModal(id);
    return;
  }

  order.stage = "preparing";
  order.expanded = false;
  if (getBeverageItems(order).length && !order.baristaStatus) {
    order.baristaStatus = "queued";
  }

  state.activities.unshift({
    tag: "Order",
    type: "neutral",
    text: `Order ${order.number} is now preparing`,
    table: order.table,
    time: "now",
  });

  renderAll();
}

function markReady(id) {
  const order = state.orders.find((entry) => entry.id === id);
  if (!order) return;

  order.stage = "ready";

  state.activities.unshift({
    tag: "Ready",
    type: "green",
    text: `Order ${order.number} marked as Ready`,
    table: order.table,
    time: "now",
  });

  renderAll();
}

function markServed(id) {
  const order = state.orders.find((entry) => entry.id === id);
  if (!order) return;

  const stockMovements = deductInventoryForOrder(order, "Order completion");

  const receipt = createReceiptRecord({
    orderNumber: order.number,
    location: order.table,
    source: getOrderSourceLabel(order.source),
    customerName: order.customerName || "Guest",
    status: "served",
    paymentMethod: order.paymentMethod || "Cash",
    total: order.total,
    amountReceived: order.amountReceived || order.total,
    change: order.change || 0,
    gcashReference: order.gcashReference || "",
    time: "now",
    items: order.items,
  });

  state.orders = state.orders.filter((entry) => entry.id !== id);
  const completed = document.getElementById("completedTodayStat");
  completed.textContent = Number(completed.textContent) + 1;
  lastReceiptId = receipt.id;

  state.activities.unshift({
    tag: "Served",
    type: "green",
    text: `Order ${order.number} marked as Served`,
    table: order.table,
    time: "now",
  });

  addSystemRecord(
    "Order served",
    `Order ${order.number} was marked served and saved to receipts`,
    "Order",
  );

  renderAll();
  showToast(
    stockMovements.length
      ? `Receipt saved for ${order.number}. Inventory auto-deducted.`
      : `Receipt saved for ${order.number}.`,
  );
}

function openEditOrderModal(orderId) {
  const order = state.orders.find((entry) => entry.id === orderId);
  if (!order) return;

  editOrderId = orderId;
  document.getElementById("editSummary").innerHTML = `
    <div class="summary-line"><span>Order</span><b>${order.number}</b></div>
    <div class="summary-line"><span>Source</span><b>${getOrderSourceLabel(order.source)}</b></div>
    <div class="summary-line"><span>Table</span><b>${order.table}</b></div>
    <div class="summary-line"><span>Payment</span><b>${order.paymentMethod || "Cash"} · ${order.paymentStatus === "confirmed" || order.paid ? "Confirmed" : "Pending"}</b></div>
    <div class="summary-line summary-total"><span>Total</span><b>₱${order.total.toLocaleString("en-PH")}</b></div>
  `;

  document.getElementById("editItems").innerHTML = order.items
    .map(
      (item, index) => `
    <div class="edit-line">
      <div class="edit-line-head">
        <b>${item.name}</b>
        <span class="item-qty">×${item.qty}</span>
      </div>
      ${
        item.customizations.length
          ? `
        <ul class="customization-list">
          ${item.customizations.map((customization) => `<li>${escapeHtml(customization)}</li>`).join("")}
        </ul>
      `
          : `<p style="margin-bottom:8px;">No listed customizations</p>`
      }
      <input class="note-input" data-item-index="${index}" value="${escapeAttribute(item.note)}" placeholder="Customization notes" />
    </div>
  `,
    )
    .join("");

  document.getElementById("editOrderModal").classList.remove("hidden");
  lucide.createIcons();
}

function bindEditModal() {
  document.getElementById("editClose").addEventListener("click", closeEditOrderModal);
  document.getElementById("editOrderModal").addEventListener("click", (event) => {
    if (event.target.id === "editOrderModal") closeEditOrderModal();
  });

  document.getElementById("voidOrderBtn").addEventListener("click", () => {
    const orderId = editOrderId;

    openAdminGate(() => {
      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order) return;

      state.orders = state.orders.filter((entry) => entry.id !== orderId);
      createReceiptRecord({
        orderNumber: order.number,
        location: order.table,
        source: getOrderSourceLabel(order.source),
        customerName: order.customerName || "Guest",
        status: "voided",
        paymentMethod: order.paymentMethod || "Cash",
        total: order.total,
        amountReceived: order.amountReceived || 0,
        change: order.change || 0,
        gcashReference: order.gcashReference || "",
        time: "now",
        items: order.items,
      });
      closeEditOrderModal();

      state.activities.unshift({
        tag: "Order",
        type: "coral",
        text: `Order ${order.number} voided`,
        table: order.table,
        time: "now",
      });

      addSystemRecord(
        "Order voided",
        `Order ${order.number} was voided and saved to receipt records`,
        "Void",
      );

      renderAll();
      showToast(`Order ${order.number} has been voided.`);
    });
  });

  document.getElementById("saveOrderBtn").addEventListener("click", () => {
    const orderId = editOrderId;

    openAdminGate(() => {
      const order = state.orders.find((entry) => entry.id === orderId);
      if (!order) return;

      document.querySelectorAll(".note-input").forEach((input) => {
        const index = Number(input.dataset.itemIndex);
        const nextNote = input.value.trim();

        order.items[index].note = nextNote;
        order.items[index].customizations = nextNote
          ? nextNote
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean)
          : [];
      });

      closeEditOrderModal();

      state.activities.unshift({
        tag: "Order",
        type: "blue",
        text: `Changes saved for ${order.number}`,
        table: order.table,
        time: "now",
      });

      renderAll();
      showToast(`Changes saved for ${order.number}.`);
    });
  });
}

function closeEditOrderModal() {
  document.getElementById("editOrderModal").classList.add("hidden");
  editOrderId = null;
}

let adminCheckPending = false;
let adminEntryCallback = null;

function openAdminWorkspace(callback) {
  if (adminCheckPending) return;
  const isAdmin = QUVO_AUTH.getSession()?.role === "admin";
  adminEntryCallback = isAdmin ? callback : null;
  document.getElementById("adminPassword").value = "";
  ["adminPassword", "adminPasswordLabel", "adminUnlock"].forEach((id) => {
    document.getElementById(id).classList.toggle("hidden", !isAdmin);
  });
  document.getElementById("adminPrompt").textContent = isAdmin
    ? "Re-enter your own password to open the Admin workspace."
    : "Only a signed-in Admin account can open this workspace.";
  document.getElementById("adminError").textContent = "";
  document.getElementById("adminModal").classList.remove("hidden");
  document.getElementById(isAdmin ? "adminPassword" : "adminCancel").focus();
}

async function confirmAdminEntry() {
  if (adminCheckPending || !adminEntryCallback) return;
  const input = document.getElementById("adminPassword");
  if (!input.value) {
    document.getElementById("adminError").textContent = "Enter your password.";
    input.focus();
    return;
  }
  adminCheckPending = true;
  document.getElementById("adminUnlock").disabled = true;
  document.getElementById("adminCancel").disabled = true;
  let approved = false;
  try {
    await QUVO_AUTH.confirmAdmin(input.value);
    approved = true;
  } catch (error) {
    document.getElementById("adminError").textContent =
      error.message || "Unable to verify your password.";
  } finally {
    input.value = "";
    adminCheckPending = false;
    document.getElementById("adminUnlock").disabled = false;
    document.getElementById("adminCancel").disabled = false;
  }
  if (approved) {
    const callback = adminEntryCallback;
    closeAdminGate();
    callback();
  } else input.focus();
}

async function openAdminGate(callback) {
  if (adminCheckPending) return;
  adminCheckPending = true;
  try {
    // The server checks the current database role, even if this page is stale.
    await QUVO_AUTH.checkAdmin();
  } catch (error) {
    state.adminUnlocked = false;
    updateAdminAccessVisual();
    ["adminPassword", "adminPasswordLabel", "adminUnlock"].forEach((id) =>
      document.getElementById(id).classList.add("hidden"),
    );
    document.getElementById("adminPrompt").textContent =
      "Admin access could not be verified.";
    document.getElementById("adminError").textContent =
      error.message || "Unable to verify Admin access.";
    document.getElementById("adminModal").classList.remove("hidden");
    document.getElementById("adminCancel").focus();
    return;
  } finally {
    adminCheckPending = false;
  }
  state.adminUnlocked = true;
  updateAdminAccessVisual();
  closeAdminGate();
  if (typeof callback === "function") callback();
}

function bindAdminModal() {
  document.getElementById("adminUnlock").addEventListener("click", confirmAdminEntry);
  document.getElementById("adminPassword").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmAdminEntry();
    }
  });
  document.getElementById("adminModal").addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAdminGate();
  });
  if (window.QUVO_CONFIG?.portal !== "admin") {
    document.querySelectorAll('a[href="../admin/index.php"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        openAdminWorkspace(() => window.location.assign(link.href));
      });
    });
    const params = new URLSearchParams(window.location.search);
    if (params.get("admin") === "1") {
      const screens = [
        "reports",
        "menuAdmin",
        "records",
        "salesHistory",
        "accounts",
        "inventory",
      ];
      const screen = screens.includes(params.get("adminScreen"))
        ? params.get("adminScreen")
        : "reports";
      openAdminWorkspace(() =>
        window.location.assign(`../admin/index.php?screen=${screen}`),
      );
    }
  }
  document.getElementById("adminCancel").addEventListener("click", closeAdminGate);
  document.getElementById("adminModal").addEventListener("click", (event) => {
    if (event.target.id === "adminModal") closeAdminGate();
  });
}

function closeAdminGate() {
  if (adminCheckPending) return;
  adminEntryCallback = null;
  document.getElementById("adminPassword").value = "";
  document.getElementById("adminModal").classList.add("hidden");
}
