function isDrinkItem(item) {
  return item.category === "coffee" || item.category === "non-coffee";
}

function resetChoiceGroup(group, selectedValue) {
  document.querySelectorAll(`.choice[data-group="${group}"]`).forEach((button) => {
    button.classList.toggle("selected", button.dataset.value === selectedValue);
  });
}

function formatDrinkOptions(options) {
  return [options.size, options.sugar, options.ice].filter(Boolean).join(", ");
}

function bindReceipts() {
  const search = document.getElementById("receiptSearch");
  if (search) {
    search.addEventListener("input", renderReceipts);
  }

  document.querySelectorAll(".receipt-filter").forEach((button) => {
    button.addEventListener("click", () => {
      document
        .querySelectorAll(".receipt-filter")
        .forEach((entry) => entry.classList.remove("active"));
      button.classList.add("active");
      state.activeReceiptFilter = button.dataset.receiptFilter;
      renderReceipts();
    });
  });

  const goToOrdersBtn = document.getElementById("goToOrdersBtn");
  if (goToOrdersBtn) {
    goToOrdersBtn.addEventListener("click", () => {
      document.getElementById("paidState").classList.add("hidden");
      document.getElementById("posReceiptActions").classList.add("hidden");
      showScreen("orders");
    });
  }

  const newPosOrderBtn = document.getElementById("newPosOrderBtn");
  if (newPosOrderBtn) {
    newPosOrderBtn.addEventListener("click", () => {
      document.getElementById("paidState").classList.add("hidden");
      document.getElementById("posReceiptActions").classList.add("hidden");
    });
  }
}

function bindPaymentReviewModal() {
  document
    .getElementById("paymentReviewClose")
    .addEventListener("click", closePaymentReviewModal);
  document
    .getElementById("paymentReviewCancel")
    .addEventListener("click", closePaymentReviewModal);
  document
    .getElementById("paymentReviewConfirm")
    .addEventListener("click", confirmPaymentReview);

  document.getElementById("paymentReviewModal").addEventListener("click", (event) => {
    if (event.target.id === "paymentReviewModal") closePaymentReviewModal();
  });
}

function openPaymentReviewModal() {
  if (!pendingPaymentReview) return;

  document.getElementById("paymentReviewContent").innerHTML =
    buildPaymentReviewPaper(pendingPaymentReview);
  document.getElementById("paymentReviewModal").classList.remove("hidden");
  lucide.createIcons();
}

function closePaymentReviewModal() {
  document.getElementById("paymentReviewModal").classList.add("hidden");
  pendingPaymentReview = null;
}

function confirmPaymentReview() {
  if (!pendingPaymentReview) return;

  if (pendingPaymentReview.type === "qr") {
    const order = state.orders.find((entry) => entry.id === pendingPaymentReview.orderId);
    if (!order) return;

    order.paymentStatus = "confirmed";
    order.paid = true;
    order.amountReceived = pendingPaymentReview.amountReceived;
    order.change = pendingPaymentReview.change;
    order.gcashReference = pendingPaymentReview.gcashReference;
    order.stage = "preparing";
    order.expanded = false;
    if (getBeverageItems(order).length && !order.baristaStatus) {
      order.baristaStatus = "queued";
    }

    state.activities.unshift({
      tag: "Paid",
      type: "green",
      text: `${pendingPaymentReview.paymentMethod} payment confirmed for ${order.number}; order is now preparing`,
      table: order.table,
      time: "now",
    });

    addSystemRecord(
      "Payment confirmed",
      `${pendingPaymentReview.paymentMethod} payment confirmed for ${order.number}`,
      "Payment",
    );
    const stockMovements = deductInventoryForOrder(order, "Payment confirmation");

    closePaymentReviewModal();
    renderAll();
    showToast(
      stockMovements.length
        ? `Payment confirmed for ${order.number}. Inventory auto-deducted.`
        : `Payment confirmed for ${order.number}. Order sent to preparation.`,
    );
    return;
  }

  if (pendingPaymentReview.type === "manual") {
    const manualOrder = {
      id: pendingPaymentReview.nextId,
      number: pendingPaymentReview.orderNumber,
      table: "Counter",
      total: pendingPaymentReview.total,
      time: "now",
      stage: "preparing",
      source: "manual",
      customerName: pendingPaymentReview.customerName,
      paid: true,
      paymentMethod: pendingPaymentReview.paymentMethod,
      paymentStatus: "confirmed",
      amountReceived: pendingPaymentReview.amountReceived,
      change: pendingPaymentReview.change,
      gcashReference: pendingPaymentReview.gcashReference,
      expanded: false,
      baristaStatus: pendingPaymentReview.items.some(isBeverageOrderItem)
        ? "queued"
        : null,
      items: pendingPaymentReview.items,
    };
    const stockMovements = deductInventoryForOrder(manualOrder, "Manual POS payment");
    state.orders.unshift(manualOrder);

    state.activities.unshift({
      tag: "Paid",
      type: "green",
      text: `Manual order ${pendingPaymentReview.orderNumber} paid and sent to preparation`,
      table: "Counter",
      time: "now",
    });

    addSystemRecord(
      "Manual POS payment",
      `Manual order ${pendingPaymentReview.orderNumber} paid and sent to preparation`,
      "Payment",
    );

    state.posCart = [];
    document.getElementById("counterCustomerName").value = "";
    document.getElementById("paidState").classList.remove("hidden");
    document.getElementById("posReceiptActions").classList.remove("hidden");

    const orderNumber = pendingPaymentReview.orderNumber;
    closePaymentReviewModal();
    renderAll();
    showToast(
      stockMovements.length
        ? `Manual order ${orderNumber} sent to preparation. Inventory auto-deducted.`
        : `Manual order ${orderNumber} sent to preparation.`,
    );
  }
}

function buildPaymentReviewPaper(review) {
  return `
    <div class="receipt-paper">
      <h2>Quvo Cafe</h2>
      <div class="receipt-brand-sub">Payment confirmation preview</div>

      <div class="receipt-meta">
        <div class="receipt-line"><span>Order</span><b>${review.orderNumber}</b></div>
        <div class="receipt-line"><span>Location</span><b>${review.location}</b></div>
        <div class="receipt-line"><span>Source</span><b>${review.source}</b></div>
        <div class="receipt-line"><span>Customer</span><b>${review.customerName || "Guest"}</b></div>
      </div>

      <div class="receipt-items">
        ${review.items
          .map(
            (item) => `
          <div>
            <div class="receipt-item-name">
              <span>${item.qty}× ${item.name}</span>
              <b>₱${(item.qty * item.price).toLocaleString("en-PH")}</b>
            </div>
            ${item.note ? `<div class="receipt-item-note">${escapeHtml(item.note)}</div>` : ""}
          </div>
        `,
          )
          .join("")}
      </div>

      <div class="receipt-total-box">
        <div class="receipt-line grand-total"><span>Total</span><b>₱${review.total.toLocaleString("en-PH")}</b></div>
        <div class="receipt-line"><span>Payment method</span><b>${review.paymentMethod}</b></div>
        ${
          review.paymentMethod === "Cash"
            ? `
          <div class="receipt-line"><span>Amount received</span><b>₱${review.amountReceived.toLocaleString("en-PH")}</b></div>
          <div class="receipt-line"><span>Change to give</span><b>₱${review.change.toLocaleString("en-PH")}</b></div>
        `
            : `
          <div class="receipt-line"><span>${getPaymentReferenceLabel(review.paymentMethod)}</span><b>${review.gcashReference || "Verified by cashier"}</b></div>
        `
        }
      </div>

      <div class="receipt-review-note">
        Confirm only after the payment and customer change are correct. This will send the order to the Preparing section for the kitchen/barista workflow.
      </div>
    </div>
  `;
}

function bindReceiptSuccessModal() {
  document
    .getElementById("receiptSuccessClose")
    .addEventListener("click", closeReceiptSuccessModal);
  document.getElementById("receiptSuccessNewOrder").addEventListener("click", () => {
    closeReceiptSuccessModal();
    document.getElementById("paidState").classList.add("hidden");
    document.getElementById("posReceiptActions").classList.add("hidden");
  });

  document.getElementById("receiptSuccessView").addEventListener("click", () => {
    closeReceiptSuccessModal();
    if (lastReceiptId) {
      showReceipt(lastReceiptId);
      showScreen("receipts");
    }
  });

  document.getElementById("receiptSuccessModal").addEventListener("click", (event) => {
    if (event.target.id === "receiptSuccessModal") closeReceiptSuccessModal();
  });
}

function openReceiptSuccessModal(receiptId) {
  const receipt = state.receipts.find((entry) => entry.id === receiptId);
  if (!receipt) return;

  document.getElementById("receiptSuccessContent").innerHTML = buildReceiptPaper(receipt);
  document.getElementById("receiptSuccessModal").classList.remove("hidden");
  lucide.createIcons();
}

function closeReceiptSuccessModal() {
  document.getElementById("receiptSuccessModal").classList.add("hidden");
}

function createReceiptRecord(data) {
  const receipt = {
    id: `R-${String(state.receipts.length + 1).padStart(3, "0")}`,
    ...data,
  };

  state.receipts.unshift(receipt);
  state.selectedReceiptId = receipt.id;
  return receipt;
}

function renderReceipts() {
  const list = document.getElementById("receiptList");
  const preview = document.getElementById("receiptPreview");
  if (!list || !preview) return;

  const query = (document.getElementById("receiptSearch")?.value || "")
    .toLowerCase()
    .trim();
  const filter = state.activeReceiptFilter || "all";

  const receipts = state.receipts.filter((receipt) => {
    const matchesFilter = filter === "all" || receipt.status === filter;
    const haystack =
      `${receipt.orderNumber} ${receipt.location} ${receipt.paymentMethod} ${receipt.customerName} ${receipt.status}`.toLowerCase();
    return matchesFilter && haystack.includes(query);
  });

  list.innerHTML = receipts.length
    ? receipts
        .map(
          (receipt) => `
      <button class="receipt-list-item ${receipt.id === state.selectedReceiptId ? "active" : ""}" onclick="showReceipt('${receipt.id}')">
        <div class="receipt-list-top">
          <b>${escapeHtml(receipt.orderNumber)}</b>
          <span class="receipt-status ${receipt.status}">${receipt.status}</span>
        </div>
        <div class="receipt-list-bottom">
          <span>${escapeHtml(receipt.location)}</span>
          <span>₱${receipt.total.toLocaleString("en-PH")} · ${escapeHtml(receipt.paymentMethod || "No payment")}</span>
        </div>
      </button>
    `,
        )
        .join("")
    : `<div class="helper-text">No receipt records found.</div>`;

  const selected =
    state.receipts.find((receipt) => receipt.id === state.selectedReceiptId) ||
    receipts[0];

  if (selected) {
    preview.innerHTML = buildReceiptPaper(selected);
  } else {
    preview.innerHTML = `
      <div class="receipt-empty-preview">
        <i data-lucide="receipt-text"></i>
        <h2>Select a receipt</h2>
        <p>Choose a previous order to view payment details, customer change, and ordered items.</p>
      </div>
    `;
  }

  lucide.createIcons();
}

function showReceipt(receiptId) {
  state.selectedReceiptId = receiptId;
  renderReceipts();
}

function buildReceiptPaper(receipt) {
  if (receipt.persisted) return renderSqlReceipt(receipt);
  const amountReceived = Number(receipt.amountReceived || 0);
  const change = Number(receipt.change || 0);
  const method = receipt.paymentMethod || "Cash";

  return `
    <div class="receipt-paper">
      <h2>Quvo Cafe</h2>
      <div class="receipt-brand-sub">Official receipt preview</div>

      <div class="receipt-meta">
        <div class="receipt-line"><span>Receipt</span><b>${receipt.id}</b></div>
        <div class="receipt-line"><span>Order</span><b>${receipt.orderNumber}</b></div>
        <div class="receipt-line"><span>Location</span><b>${receipt.location}</b></div>
        <div class="receipt-line"><span>Customer</span><b>${receipt.customerName || "Guest"}</b></div>
        <div class="receipt-line"><span>Status</span><b>${capitalize(receipt.status)}</b></div>
        <div class="receipt-line"><span>Time</span><b>${receipt.time}</b></div>
      </div>

      <div class="receipt-items">
        ${receipt.items
          .map(
            (item) => `
          <div>
            <div class="receipt-item-name">
              <span>${item.qty}× ${item.name}</span>
              <b>₱${(item.qty * item.price).toLocaleString("en-PH")}</b>
            </div>
            ${item.note ? `<div class="receipt-item-note">${escapeHtml(item.note)}</div>` : ""}
          </div>
        `,
          )
          .join("")}
      </div>

      <div class="receipt-total-box">
        <div class="receipt-line grand-total"><span>Total</span><b>₱${receipt.total.toLocaleString("en-PH")}</b></div>
        <div class="receipt-line"><span>Payment method</span><b>${method}</b></div>
        ${
          method === "Cash"
            ? `
          <div class="receipt-line"><span>Amount received</span><b>₱${amountReceived.toLocaleString("en-PH")}</b></div>
          <div class="receipt-line"><span>Change</span><b>₱${change.toLocaleString("en-PH")}</b></div>
        `
            : `
          <div class="receipt-line"><span>${getPaymentReferenceLabel(method)}</span><b>${receipt.gcashReference || "Verified"}</b></div>
        `
        }
      </div>

      <div class="receipt-footer">This receipt preview is for cashier transaction review.</div>
    </div>
  `;
}
