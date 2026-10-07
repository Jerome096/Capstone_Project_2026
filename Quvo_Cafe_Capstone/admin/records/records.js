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
          <b>${record.title}</b>
          <span class="receipt-status ${record.type === "Void" ? "voided" : "served"}">${record.type}</span>
        </div>
        <p>${record.detail}</p>
        <p>${record.time}</p>
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

    summary.innerHTML = `
      <div class="record-summary-card"><span>Served receipts</span><b>${served}</b></div>
      <div class="record-summary-card"><span>Paid receipts</span><b>${paid}</b></div>
      <div class="record-summary-card"><span>Voided records</span><b>${voided}</b></div>
      <div class="record-summary-card"><span>Cash payments</span><b>${cash}</b></div>
      <div class="record-summary-card"><span>GCash payments</span><b>${gcash}</b></div>
      <div class="record-summary-card"><span>PayMaya payments</span><b>${paymaya}</b></div>
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
  return category
    .split("-")
    .map((part) => capitalize(part))
    .join("-");
}
