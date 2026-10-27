function renderRecords() {
  const list = document.getElementById("recordList");
  if (list) {
    const receiptRecords = state.receipts.slice(0, 5).map((receipt) => ({
      title: `Receipt ${receipt.status}`,
      detail: `${receipt.orderNumber} · ${receipt.location} · ₱${receipt.total.toLocaleString("en-PH")} · ${receipt.paymentMethod}`,
      time: receipt.time,
      type: "Receipt",
    }));

    const records = [...state.records, ...receiptRecords].slice(0, 12);

    list.innerHTML = records.length
      ? records
          .map(
            (record) => `
      <article class="record-item">
        <div class="record-item-top">
          <b>${escapeHtml(record.title)}</b>
          <span class="receipt-status ${record.type === "Void" ? "voided" : "served"}">${escapeHtml(record.type)}</span>
        </div>
        <p>${escapeHtml(record.detail)}</p>
        <p>${escapeHtml(record.time)}</p>
      </article>
    `,
          )
          .join("")
      : `<div class="helper-text">No system records loaded. Audit records will be stored in the database.</div>`;
  }

  const summary = document.getElementById("recordSummary");
  if (summary) {
    const served = state.receipts.filter((receipt) => receipt.status === "served").length;
    const paid = state.receipts.filter((receipt) => receipt.status === "paid").length;
    const voided = state.receipts.filter((receipt) => receipt.status === "voided").length;
    const cash = state.receipts.filter(
      (receipt) => receipt.paymentMethod === "Cash",
    ).length;
    const gcash = state.receipts.filter(
      (receipt) => receipt.paymentMethod === "GCash",
    ).length;
    const paymaya = state.receipts.filter(
      (receipt) => receipt.paymentMethod === "PayMaya",
    ).length;
    const otherMethods=new Map();
    for(const receipt of state.receipts)if(['paid','served'].includes(receipt.status)&&receipt.paymentMethod&&!['Cash','GCash','PayMaya'].includes(receipt.paymentMethod))otherMethods.set(receipt.paymentMethod,(otherMethods.get(receipt.paymentMethod)||0)+1);

    summary.innerHTML = `
      <div class="record-summary-card"><span>Served receipts</span><b>${served}</b></div>
      <div class="record-summary-card"><span>Paid receipts</span><b>${paid}</b></div>
      <div class="record-summary-card"><span>Voided records</span><b>${voided}</b></div>
      <div class="record-summary-card"><span>Cash payments</span><b>${cash}</b></div>
      <div class="record-summary-card"><span>GCash payments</span><b>${gcash}</b></div>
      <div class="record-summary-card"><span>PayMaya payments</span><b>${paymaya}</b></div>
      ${Array.from(otherMethods,([label,count])=>'<div class="record-summary-card"><span>'+escapeHtml(label)+' payments</span><b>'+count+'</b></div>').join('')}
    `;
  }

  lucide.createIcons();
}

function addSystemRecord(title, detail, type = "System") {
  state.records.unshift({
    title,
    detail,
    time: "now",
    type,
  });
}

function formatCategory(category) {
  return QuvoMenuCategories.label(category);
}
