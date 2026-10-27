function isDrinkItem(item) {
  return QuvoMenuCategories.isDrink(item.category);
}
function receiptDay(value=new Date()) {
  if(!(value instanceof Date))value=new Date(value);
  if(Number.isNaN(value.getTime()))return null;
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);
  const get=type=>parts.find(part=>part.type===type).value;
  return get('year')+'-'+get('month')+'-'+get('day');
}
function receiptSelectedDate() {
  const input=document.getElementById('receiptDate');
  if(input && !input.value)input.value=receiptDay();
  return input?.value||receiptDay();
}
function receiptDateLabel(value) {
  return value?new Date(value+'T00:00:00+08:00').toLocaleDateString('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'short',day:'numeric'}):'';
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
  window.QuvoUploadedReceipts?.bind();
  const dateInput=document.getElementById('receiptDate');
  dateInput.value=receiptDay();
  dateInput.addEventListener('change',()=>{
    if(!dateInput.value)dateInput.value=receiptDay();
    state.selectedReceiptId=null;renderReceipts();loadSqlReceiptDate();
  });
  document.getElementById('receiptToday').addEventListener('click',()=>{
    dateInput.value=receiptDay();state.selectedReceiptId=null;renderReceipts();loadSqlReceiptDate();
  });
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
  if(posSql.busy)return;
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
    recordPreparationApproval(order);
    order.expanded = false;

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
    openPreparationTickets(order);
    return;
  }

  if (pendingPaymentReview.type === "manual") return confirmSqlPosPayment();
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
        <div class="receipt-line"><span>Customer</span><b>${escapeHtml(review.customerName || "Guest")}</b></div>
      </div>

      <div class="receipt-items">
        ${review.items
          .map(
            (item) => `
          <div>
            <div class="receipt-item-name">
              <span>${item.qty}× ${escapeHtml(item.name)}</span>
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
        <div class="receipt-line"><span>Payment method</span><b>${escapeHtml(review.paymentMethodLabel || review.paymentMethod)}</b></div>
        ${
          review.paymentMethod === "Cash"
            ? `
          <div class="receipt-line"><span>Amount received</span><b>₱${review.amountReceived.toLocaleString("en-PH")}</b></div>
          <div class="receipt-line"><span>Change to give</span><b>₱${review.change.toLocaleString("en-PH")}</b></div>
        `
            : `
          <div class="receipt-line"><span>${escapeHtml(getPaymentReferenceLabel(review.paymentMethodLabel || review.paymentMethod))}</span><b>${escapeHtml(review.gcashReference || "Verified by cashier")}</b></div>
        `
        }
      </div>

      <div class="receipt-review-note">
        Confirm only after the payment and customer change are correct. This will send the order to the Preparing section for staff preparation.
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
    date:data.date||receiptDay(),
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
  const selectedDate=receiptSelectedDate();

  const receipts = state.receipts.filter((receipt) => {
    const matchesFilter = filter === "all" || receipt.status === filter;
    const haystack =
      `${receipt.orderNumber} ${receipt.location} ${receipt.paymentMethod} ${receipt.customerName} ${receipt.status}`.toLowerCase();
    return receipt.date === selectedDate && matchesFilter && haystack.includes(query);
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
        <div class="receipt-list-date">${escapeHtml(receiptDateLabel(receipt.date))}</div>
      </button>
    `,
        )
        .join("")
    : `<div class="helper-text">No receipt records for ${escapeHtml(receiptDateLabel(selectedDate))}.</div>`;

  const selected =
    receipts.find((receipt) => receipt.id === state.selectedReceiptId) ||
    receipts[0];
  state.selectedReceiptId=selected?.id||null;

  if (selected) {
    preview.innerHTML = '<div class="receipt-print-actions"><button type="button" class="btn dark" onclick="printSelectedReceipt()">Print 58 mm receipt</button><p class="helper-text">Select 58 mm paper and actual size (100%). Turn off headers and footers.</p></div>' + buildReceiptPaper(selected);
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
  window.QuvoUploadedReceipts?.showRecords();
  const receipt=state.receipts.find(entry=>entry.id===receiptId);
  if(receipt?.date && receipt.date!==receiptSelectedDate()) {
    document.getElementById('receiptDate').value=receipt.date;
    loadSqlReceiptDate();
  }
  state.selectedReceiptId = receiptId;
  renderReceipts();
  window.QUVO_WORKSPACE?.revealPanel("#receiptPreview");
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
        <div class="receipt-line"><span>Date</span><b>${escapeHtml(receiptDateLabel(receipt.date))}</b></div>
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
        <div class="receipt-line"><span>Payment method</span><b>${escapeHtml(method)}</b></div>
        ${
          method === "Cash"
            ? `
          <div class="receipt-line"><span>Amount received</span><b>₱${amountReceived.toLocaleString("en-PH")}</b></div>
          <div class="receipt-line"><span>Change</span><b>₱${change.toLocaleString("en-PH")}</b></div>
        `
            : `
          <div class="receipt-line"><span>${escapeHtml(getPaymentReferenceLabel(method))}</span><b>${escapeHtml(receipt.gcashReference || "Verified")}</b></div>
        `
        }
      </div>

      <div class="receipt-footer">This receipt preview is for cashier transaction review.</div>
    </div>
  `;
}

function buildThermalReceiptDocument(receipt) {
  const e=escapeHtml,money=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value||0));
  const row=(label,value,extra='')=>'<div class="thermal-row '+extra+'"><span>'+e(label)+'</span><b>'+e(value??'—')+'</b></div>';
  const paid=receipt.persisted?receipt.raw.payment_status==='paid':receipt.status!=='voided';
  const source=receipt.raw?.order_source==='online'?'Online order':receipt.raw?.order_source==='walk_in'||receipt.source==='Walk-in / POS'?'Walk-in / POS':'Dine-in';
  const markup='<section class="thermal-receipt"><header><h3>Quvo Café</h3><h4>Payment record</h4></header>'+
    row('Order',receipt.orderNumber)+row('Customer',receipt.customerName||'Guest')+row('Source',source)+row('Location',receipt.location||receipt.table||'Counter')+
    row('Status',receipt.status)+row('Date',receiptDateLabel(receipt.date))+row('Time',receipt.time)+
    '<div class="thermal-items">'+receipt.items.map(item=>'<div class="thermal-item"><div class="thermal-item-line"><span>'+e(item.qty)+' × '+e(item.name)+'</span><b>'+e(money(item.qty*item.price))+'</b></div>'+(item.note?'<p>'+e(item.note)+'</p>':'')+'</div>').join('')+'</div>'+
    '<div class="thermal-totals">'+row('Total',money(receipt.total),'thermal-grand-total')+
    (paid?row('Payment',receipt.paymentMethod)+row('Received',money(receipt.amountReceived))+row('Change',money(receipt.change))+(receipt.gcashReference?row('Reference',receipt.gcashReference):''):row('Cancellation',receipt.raw?.cancellation_reason||'Voided'))+
    '</div><footer>Thank you for visiting Quvo Café.</footer></section>';
  return buildThermalPrintDocument(receipt.orderNumber+' receipt',markup);
}
function printSelectedReceipt() {
  const receipt=state.receipts.find(entry=>entry.id===state.selectedReceiptId);
  if(!receipt)return showToast('Select a receipt first.');
  printThermalDocument(buildThermalReceiptDocument(receipt),'Printable payment receipt');
}
