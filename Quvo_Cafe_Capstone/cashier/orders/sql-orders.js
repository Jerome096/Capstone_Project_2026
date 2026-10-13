// Dine-in, online and walk-in orders use SQL IDs and immutable item snapshots.
const sqlOrders = {
  loading: false, changing: false, revision: 0, cache: new Map(), known: new Map(),
  olderOffset: null, historyLoaded: false, paymentOrder: null, paymentAttempt: null,
  receiptDate:null, receiptRequest:0, receiptLoading:false,
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
    time: sqlDate(row.created_at), stage: row.order_status, source: row.order_source === "online" ? "online" : row.order_source === "walk_in" ? "manual" : "qr",
    fulfillment: row.fulfillment_type === "delivery" ? "Delivery request" : "Pickup",
    paid: row.payment_status === "paid", paymentStatus: row.payment_status === "paid" ? "confirmed" : "pending",
    paymentMethod: row.payment_method_label || row.payment_method, amountReceived: Number(row.amount_received || 0),
    change: Number(row.change_amount || 0), gcashReference: row.payment_reference || "",
    approvedBy: row.approved_by_name || "Cashier", approvedAt: sqlDate(row.paid_at),
    baristaStatus: row.order_status === "ready" ? "ready" : row.order_status === "preparing" ? "preparing" : null,
    items: (row.items || []).map(item => ({
      name: item.item_name, category: item.category, qty: Number(item.quantity), price: Number(item.unit_price),
      note: [item.customization.size, item.customization.sugarLevel, item.customization.iceLevel, item.notes]
        .filter(x => x && x !== "Not applicable").join(" · "),
    })), raw: row,
  };
}
function sqlReceipt(row) {
  const order = sqlMapOrder(row);
  return {
    ...order, id: "sqlreceipt" + row.order_id, orderNumber: row.order_number,
    location: row.table_name, source: row.order_source === "online" ? "Online order" : row.order_source === "walk_in" ? "Walk-in / POS" : "Dine-in QR",
    status: row.order_status === "cancelled" ? "voided" : row.order_status === "served" ? "served" : "paid",
    time: sqlDate(row.paid_at || row.updated_at),
    date:row.receipt_date||receiptDay(new Date((row.order_status==='cancelled'?(row.cancelled_at||row.updated_at):row.paid_at).replace(' ','T')+'Z')),
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
  document.getElementById("sqlOlderReceipts").hidden = sqlOrders.receiptDate!==receiptSelectedDate() || sqlOrders.olderOffset === null;
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
  const selectedDate=receiptSelectedDate();
  try {
    let summaries = [], offset = 0;
    do {
      const data = await sqlOrderApi(null, "?status=open&offset=" + offset);
      summaries.push(...data.orders); offset = data.next_offset;
    } while (offset !== null);
    const recent = await sqlOrderApi(null, "?status=all&receipt_date="+encodeURIComponent(selectedDate));
    const open = await sqlCompleteRows(summaries);
    const history = await sqlCompleteRows(recent.orders);
    const disappeared = state.orders.filter(order => order.persisted && !open.some(row => row.order_id === order.sqlId));
    const finished = [];
    for (const order of disappeared) {
      finished.push((await sqlOrderApi(null, "?id=" + encodeURIComponent(order.sqlId))).order);
    }
    if (revision !== sqlOrders.revision) return;
    for (const row of [...history, ...open, ...finished]) sqlOrders.known.set(row.order_id, row);
    if (selectedDate===receiptSelectedDate() && (!sqlOrders.historyLoaded || sqlOrders.receiptDate!==selectedDate)) {
      sqlOrders.receiptDate=selectedDate;
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
  if (sqlOrders.olderOffset === null || sqlOrders.loading || sqlOrders.changing || sqlOrders.receiptLoading || sqlOrders.receiptDate!==receiptSelectedDate()) return;
  sqlOrders.loading = true;
  const date=receiptSelectedDate();
  try {
    const data = await sqlOrderApi(null, "?status=all&receipt_date="+encodeURIComponent(date)+"&offset=" + sqlOrders.olderOffset);
    const rows = await sqlCompleteRows(data.orders);
    rows.forEach(row => sqlOrders.known.set(row.order_id, row));
    if(date!==receiptSelectedDate())return;
    sqlOrders.olderOffset = data.next_offset;
    sqlUpdateReceipts(); renderReceipts();
  } catch (error) { showToast(error.message); }
  finally { sqlOrders.loading = false; }
}
async function loadSqlReceiptDate() {
  const date=receiptSelectedDate(),request=++sqlOrders.receiptRequest;
  sqlOrders.receiptLoading=true;sqlOrders.receiptDate=date;sqlOrders.historyLoaded=false;sqlOrders.olderOffset=null;
  document.getElementById('sqlOlderReceipts').hidden=true;
  document.getElementById('receiptDateNotice').textContent='Loading receipts…';
  try {
    const data=await sqlOrderApi(null,'?status=all&receipt_date='+encodeURIComponent(date));
    const rows=await sqlCompleteRows(data.orders);
    if(request!==sqlOrders.receiptRequest||date!==receiptSelectedDate())return;
    rows.forEach(row=>sqlOrders.known.set(row.order_id,row));
    sqlOrders.olderOffset=data.next_offset;sqlOrders.historyLoaded=true;
    sqlUpdateReceipts();renderReceipts();
    document.getElementById('receiptDateNotice').textContent='Showing '+receiptDateLabel(date)+'.';
  } catch(error) {
    if(request===sqlOrders.receiptRequest)document.getElementById('receiptDateNotice').textContent=error.message;
  } finally {if(request===sqlOrders.receiptRequest)sqlOrders.receiptLoading=false;}
}
function installSqlOrder(row) {
  sqlOrders.cache.set(row.order_id, row.items);
  sqlOrders.known.set(row.order_id, row);
  state.orders = state.orders.filter(order => !(order.persisted && order.sqlId === row.order_id));
  if (["received", "preparing", "ready"].includes(row.order_status)) state.orders.unshift(sqlMapOrder(row));
  sqlUpdateReceipts(); sqlRender();
}
function sqlFoodReadyMarkup(order) {
  if(!order.paid || !getFoodItems(order).length || !['preparing','ready'].includes(order.stage))return '';
  if(!order.raw.kitchen_ready_at && order.stage!=='ready')return '';
  const detail=order.raw.kitchen_ready_at?'Kitchen · '+sqlDate(order.raw.kitchen_ready_at):'Order marked ready';
  return '<div class="food-readiness" role="status"><strong>✓ Food ready</strong><span>'+escapeHtml(detail)+'</span></div>';
}
function renderSqlOrderCard(order) {
  const e = escapeHtml;
  const row = order.raw;
  let actions = "";
  if (row.order_status === "received") {
    actions = '<button class="btn dark" onclick="openSqlPayment(\'' + order.id + '\')">' + (row.order_source === "online" ? "Approve payment" : "Collect payment") + '</button>';
    if (row.payment_status === "unpaid" && ["admin", "staff"].includes(QUVO_AUTH.getSession()?.role)) {
      actions += '<button class="btn light" onclick="cancelSqlOrder(\'' + order.sqlId + '\')">Cancel order</button>';
    }
  } else {
    const next = row.order_status === "preparing" ? "ready" : "served";
    actions = '<button class="btn green" onclick="changeSqlOrderStatus(\'' + order.sqlId + '\',\'' + next + '\')">Mark order ' + next + "</button>";
  }
  if (row.order_source === "online") {
    actions = '<button class="btn light" onclick="openOnlineOrderDetails(\'' + order.sqlId + '\')">View customer details</button>' + actions;
  }
  actions += preparationReprintMarkup(order);
  return '<article class="order-card"><div class="order-top"><strong>' + e(order.number) +
    '</strong><span class="table-chip">' + e(order.table) + '</span></div><p class="order-context">Customer: ' +
    e(order.customerName) + '</p>' + (row.order_source === "online" ?
      '<p class="order-context">Online · ' + e(order.fulfillment) + '<br>Contact: ' + e(row.contact_snapshot || "") +
      (row.address_snapshot ? '<br>Address: ' + e(row.address_snapshot) : "") +
      '<br>Payment method: ' + e(row.preferred_payment_label || row.preferred_payment_method || "Cash") + '</p>' : "") +
    '<div class="order-total">' + sqlMoney(row.total_amount) +
    '</div><div class="order-payment ' + (order.paid ? "confirmed" : "pending") + '">' +
    (order.paid ? "Paid · " + e(order.paymentMethod) : row.order_source === "online" ?
      e(row.preferred_payment_label || row.preferred_payment_method) + " · Awaiting cashier approval" : "Unpaid · Cashier payment required") +
    '</div>' + preparationApprovalMarkup(order) + sqlFoodReadyMarkup(order) + '<div class="item-list">' + order.items.map(item => '<div class="item-row"><span>' +
      e(item.qty + " × " + item.name) + "</span><span>" + sqlMoney(item.qty * item.price) + "</span>" +
      (item.note ? '<div class="item-note">' + e(item.note) + "</div>" : "") + "</div>").join("") +
    '</div><p class="helper-text">' + e(order.time) + '</p><div class="card-actions">' + actions + "</div></article>";
}
// Show the saved order information without changing its payment or preparation status.
function openOnlineOrderDetails(id) {
  const row = sqlOrders.known.get(String(id));
  if (!row || row.order_source !== "online") return;
  const field = (label, value) => '<div><dt>' + escapeHtml(label) + '</dt><dd>' +
    escapeHtml(value || "Not provided") + '</dd></div>';
  document.getElementById("onlineOrderDetailsTitle").textContent = row.order_number;
  document.getElementById("onlineOrderCustomerDetails").innerHTML =
    field("Customer", row.customer_name) + field("Recipient", row.recipient_name || row.customer_name) +
    field("Contact number", row.contact_snapshot) +
    field("Fulfillment", row.fulfillment_type === "delivery" ? "Delivery request" : "Pickup") +
    (row.fulfillment_type === "delivery" ? field("Delivery address", row.address_snapshot) : "") +
    field("Payment method", row.preferred_payment_label || row.preferred_payment_method) + field("Total", sqlMoney(row.total_amount));
  document.getElementById("onlineOrderDetailsModal").showModal();
  const proof=document.getElementById("onlineOrderProofImage");
  const proofStatus=document.getElementById("onlineOrderProofStatus");
  proof.hidden=true;proof.removeAttribute("src");
  proofStatus.textContent=Number(row.has_payment_receipt)?"Loading payment receipt…":"No receipt image was submitted for this order.";
  if(Number(row.has_payment_receipt)) {
    proof.onload=()=>{proof.hidden=false;proofStatus.textContent="Payment proof submitted by the customer. Verify receipt of funds before confirming payment.";};
    proof.onerror=()=>{proof.hidden=true;proofStatus.textContent="The receipt could not load. Close this popup and try again.";};
    proof.src=quvoPath("api/orders/index.php?receipt="+encodeURIComponent(row.order_id));
  }
}
function openSqlPayment(id) {
  if (sqlOrders.changing) return;
  const order = state.orders.find(row => row.id === id);
  if (!order || order.paid || order.stage !== "received") return;
  sqlOrders.paymentOrder = order;
  sqlOrders.paymentAttempt = null;
  const onlineOrder=order.raw.order_source === "online";
  document.getElementById("sqlPaymentTitle").textContent = (onlineOrder ? "Approve payment · " : "Collect payment · ") + order.number;
  document.getElementById("sqlPaymentEyebrow").textContent=onlineOrder?"Online payment approval":"Cashier payment";
  document.getElementById("sqlPaymentAmountLabel").textContent=onlineOrder?"Order total":"Total due";
  document.getElementById("sqlPaymentMethod").hidden=onlineOrder;
  document.getElementById("sqlOnlinePaymentMethod").hidden=!onlineOrder;
  document.getElementById("sqlOnlinePaymentMethod").textContent=order.raw.preferred_payment_label||order.raw.preferred_payment_method||"Not provided";
  document.getElementById("sqlOnlinePaymentHelp").hidden=!onlineOrder;
  document.getElementById("sqlPaymentTotal").textContent = sqlMoney(order.total);
  const methods=new Map([['Cash','Cash'],['GCash','GCash'],['PayMaya','PayMaya']]);
  if(order.raw.preferred_payment_method)methods.set(order.raw.preferred_payment_method,order.raw.preferred_payment_label||order.raw.preferred_payment_method);
  document.getElementById('sqlPaymentMethod').innerHTML=Array.from(methods,([code,label])=>'<option value="'+escapeHtml(code)+'">'+escapeHtml(label)+'</option>').join('');
  document.getElementById("sqlPaymentMethod").value = order.raw.preferred_payment_method || "Cash";
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
  const onlineOrder=sqlOrders.paymentOrder?.raw.order_source === "online";
  const cash = document.getElementById("sqlPaymentMethod").value === "Cash";
  document.getElementById("sqlCashFields").hidden = onlineOrder || !cash;
  document.getElementById("sqlReferenceFields").hidden = onlineOrder || cash;
  const total = Number(sqlOrders.paymentOrder?.total || 0);
  const received = Number(document.getElementById("sqlAmountReceived").value);
  document.getElementById("sqlPaymentChange").textContent = sqlMoney(Math.max(0, Math.round((received - total) * 100) / 100));
  document.getElementById("sqlPaymentConfirm").textContent = onlineOrder ? (sqlOrders.paymentAttempt ? "Retry payment approval" : "Approve payment") : (sqlOrders.paymentAttempt ? "Retry payment confirmation" : "Confirm payment received");
  document.querySelectorAll("#sqlPaymentForm input, #sqlPaymentForm select").forEach(el => el.disabled = onlineOrder || sqlOrders.changing || Boolean(sqlOrders.paymentAttempt));
  document.getElementById("sqlPaymentConfirm").disabled = sqlOrders.changing;
}
async function confirmSqlPayment(event) {
  event.preventDefault();
  if (sqlOrders.changing || !sqlOrders.paymentOrder) return;
  const order = sqlOrders.paymentOrder;
  if (!sqlOrders.paymentAttempt) {
    const onlineOrder=order.raw.order_source === "online";
    const method = onlineOrder ? order.raw.preferred_payment_method : document.getElementById("sqlPaymentMethod").value;
    const amount = onlineOrder || method !== "Cash" ? order.raw.total_amount : document.getElementById("sqlAmountReceived").value.trim();
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amount) || Number(amount) < order.total) {
      document.getElementById("sqlPaymentError").textContent = "Enter the full amount received with at most two decimal places.";
      return;
    }
    const label=method===order.raw.preferred_payment_method?(order.raw.preferred_payment_label||method):method;
    const confirmation=onlineOrder?"Approve " + label + " payment for " + order.number + " (" + sqlMoney(order.total) + ") after verifying the customer's receipt and receiving account? This sends the order to preparation.":
      "Confirm " + label + " payment for " + order.number + " (" + sqlMoney(order.total) + "), with change of " + sqlMoney(Number(amount) - order.total) + "? This sends the order to preparation.";
    if (!window.confirm(confirmation)) return;
    sqlOrders.paymentAttempt = {
      action: "pay", id: order.sqlId, payment_method: method, amount_received: amount,
      payment_reference: onlineOrder || method === "Cash" ? "" : document.getElementById("sqlPaymentReference").value.trim(),
    };
  }
  sqlOrders.changing = true; sqlOrders.revision++; updateSqlPayment();
  let succeeded = false;
  let approvedOrder = null;
  try {
    const data = await sqlOrderApi(sqlOrders.paymentAttempt);
    installSqlOrder(data.order);
    approvedOrder = sqlMapOrder(data.order);
    succeeded = true;
    showToast(data.replayed ? "Previously confirmed payment restored." : order.raw.order_source === "online" ? "Payment approved. Order is preparing." : "Payment saved. Order is preparing.");
  } catch (error) {
    document.getElementById("sqlPaymentError").textContent = error.message + " Retry to confirm the saved result, or close and refresh orders.";
  } finally {
    sqlOrders.changing = false;
    if (succeeded) closeSqlPayment(); else updateSqlPayment();
    if (approvedOrder) openPreparationTickets(approvedOrder);
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
    row("Order", raw.order_number) + row("Customer", raw.customer_name) + row(raw.order_source === "online" ? "Fulfillment" : "Table", raw.table_name) +
    row("Status", raw.order_status) + row("Date", receiptDateLabel(receipt.date)) + row("Time", receipt.time) +
    '<div class="receipt-items">' + receipt.items.map(item =>
      row(item.qty + " × " + item.name, sqlMoney(item.qty * item.price)) +
      (item.note ? '<p class="helper-text">' + e(item.note) + "</p>" : "")).join("") + "</div>" +
    row("Total", sqlMoney(raw.total_amount)) +
    (raw.payment_status === "paid" ? row("Payment", raw.payment_method_label||raw.payment_method) + row("Received", sqlMoney(raw.amount_received)) +
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
