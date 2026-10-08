const trackingOrderCode = document.getElementById("trackingOrderCode");

const trackingPayment = document.getElementById("trackingPayment");

const statusTimeline = document.getElementById("statusTimeline");

const trackingDetails = document.getElementById("trackingDetails");

const trackingStatus = document.getElementById("trackingStatus");

const trackingUpdatedAt = document.getElementById("trackingUpdatedAt");

function renderTracking() {
  if (state.accessMode === "dineIn" && state.order?.persisted) {
    renderDineTracking();
    return;
  }
  if (!state.order) {
    trackingOrderCode.textContent = "No order yet";
    trackingPayment.textContent = "Payment";
    statusTimeline.innerHTML = CUSTOMER_DATA.orderStatuses
      .map((status) => {
        return `
          <article class="timeline-item">
            <div class="timeline-dot">•</div>
            <div>
              <h3>${status.title}</h3>
              <p>${status.description}</p>
            </div>
          </article>
        `;
      })
      .join("");

    trackingDetails.innerHTML = `
      <div class="empty-card">
        <h3>No submitted order</h3>
        <p>Your order details will appear here after you submit your cart.</p>
      </div>
    `;
    trackingStatus.textContent = "Waiting";
    trackingUpdatedAt.textContent = "Waiting for an order";
    return;
  }

  trackingOrderCode.textContent = state.order.orderCode;
  trackingPayment.textContent = state.order.paymentMethod;
  trackingStatus.textContent = getDisplayStatusTitle(
    CUSTOMER_DATA.orderStatuses[state.orderStatusIndex],
  );
  trackingUpdatedAt.textContent = `Last updated ${formatUpdateTime(state.order.lastUpdated)}`;

  statusTimeline.innerHTML = CUSTOMER_DATA.orderStatuses
    .map((status, index) => {
      const doneClass = index < state.orderStatusIndex ? "done" : "";
      const currentClass = index === state.orderStatusIndex ? "current" : "";
      const symbol = index < state.orderStatusIndex ? "✓" : index + 1;

      return `
        <article class="timeline-item ${doneClass} ${currentClass}">
          <div class="timeline-dot">${symbol}</div>
          <div>
            <h3>${status.title}</h3>
            <p>${getStatusDescription(status)}</p>
          </div>
        </article>
      `;
    })
    .join("");

  const itemRows = state.order.items
    .map((item) => {
      return `
        <div class="ticket-row">
          <span>${item.quantity} × ${item.name}</span>
          <strong>${formatCurrency(item.unitPrice * item.quantity)}</strong>
        </div>
      `;
    })
    .join("");

  const deliveryRows =
    state.order.fulfillment === "Staff-coordinated delivery request"
      ? `
      <div class="ticket-row">
        <span>Delivery address</span>
        <strong>${state.order.deliveryAddress}</strong>
      </div>
      <div class="ticket-row">
        <span>Receiver contact</span>
        <strong>${state.order.deliveryContact}</strong>
      </div>
    `
      : "";

  trackingDetails.innerHTML = `
    <p class="eyebrow">Order details</p>
    <div class="ticket-row">
      <span>Source</span>
      <strong>${state.order.source}</strong>
    </div>
    <div class="ticket-row">
      <span>Customer</span>
      <strong>${state.order.customerName}</strong>
    </div>
    <div class="ticket-row">
      <span>${state.order.accessMode === "online" ? "Account" : "Table"}</span>
      <strong>${state.order.accessMode === "online" ? state.order.accountEmail : state.order.tableNumber}</strong>
    </div>
    <div class="ticket-row">
      <span>Fulfillment</span>
      <strong>${state.order.fulfillment}</strong>
    </div>
    ${deliveryRows}
    <div class="ticket-row">
      <span>Submitted</span>
      <strong>${state.order.submittedAt}</strong>
    </div>
    ${itemRows}
    <div class="ticket-row">
      <span>Total</span>
      <strong>${formatCurrency(state.order.total)}</strong>
    </div>
  `;
}

function getDisplayStatusTitle(status) {
  if (state.order && state.order.accessMode === "online" && status.key === "Served") {
    return "Completed";
  }

  return status.title;
}

function getStatusDescription(status) {
  if (!state.order || state.order.accessMode !== "online") {
    return status.description;
  }

  const onlineDescriptions = {
    Received:
      "Your online order has been submitted and is waiting for staff payment and fulfillment review.",
    Preparing: "The staff is preparing your order based on the selected fulfillment option.",
    Ready:
      state.order.fulfillment === "Pickup"
        ? "Your order is ready for pickup."
        : "Your order is ready for staff-coordinated courier booking.",
    Served: "Your online order has been completed based on the selected fulfillment process.",
  };

  return onlineDescriptions[status.key] || status.description;
}

function startOrderStatusWatch() {
  clearOrderStatusTimers();
  if (state.accessMode === "dineIn") {
    refreshDineOrders();
    return;
  }
  if (!state.order) return;

  const orderCode = state.order.orderCode;
  const steps = [
    { delay: 6500, statusIndex: 1 },
    { delay: 15000, statusIndex: 2 },
    { delay: 26000, statusIndex: 3 },
  ];

  state.orderStatusTimers = steps.map(({ delay, statusIndex }) =>
    window.setTimeout(() => {
      if (!state.order || state.order.orderCode !== orderCode) return;
      if (state.orderStatusIndex >= statusIndex) return;

      state.orderStatusIndex = statusIndex;
      state.order.statusIndex = statusIndex;
      state.order.status = getDisplayStatusTitle(CUSTOMER_DATA.orderStatuses[statusIndex]);
      state.order.lastUpdated = new Date().toISOString();
      syncCurrentOrderToHistory();
      renderTracking();

      if (state.currentScreen === "screenTracking") {
        showToast(`Order updated: ${state.order.status}.`);
      }
    }, delay),
  );
}

function clearOrderStatusTimers() {
  state.orderStatusTimers.forEach((timer) => window.clearTimeout(timer));
  state.orderStatusTimers = [];
}
