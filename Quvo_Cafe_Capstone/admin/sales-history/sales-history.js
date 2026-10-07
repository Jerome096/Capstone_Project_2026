function bindSalesHistory() {
  document.querySelectorAll("[data-sales-view]").forEach((button) => {
    button.addEventListener("click", () => {
      document
        .querySelectorAll("[data-sales-view]")
        .forEach((entry) => entry.classList.remove("active"));
      button.classList.add("active");
      state.activeSalesView = button.dataset.salesView;
      renderSalesHistory();
    });
  });
}

function renderSalesHistory() {
  const list = document.getElementById("salesHistoryList");
  if (!list) return;

  const records = state.eodRecords;
  const total = records.reduce((sum, record) => sum + Number(record.totalSales || 0), 0);
  const thisMonth = records.reduce(
    (sum, record) => sum + Number(record.totalSales || 0),
    0,
  );
  const thisYear = records.reduce(
    (sum, record) => sum + Number(record.totalSales || 0),
    0,
  );

  document.getElementById("salesTodayStat").textContent =
    `₱${(records[0]?.totalSales || 0).toLocaleString("en-PH")}`;
  document.getElementById("salesMonthStat").textContent =
    `₱${thisMonth.toLocaleString("en-PH")}`;
  document.getElementById("salesYearStat").textContent =
    `₱${thisYear.toLocaleString("en-PH")}`;
  document.getElementById("eodRecordCount").textContent = records.length;

  if (!records.length) {
    list.innerHTML = `<div class="helper-text">No sales history loaded. End-of-day records will come from the database.</div>`;
    return;
  }

  if (state.activeSalesView === "monthly") {
    const label = new Date().toLocaleDateString("en-PH", {
      month: "long",
      year: "numeric",
    });
    list.innerHTML = `
      <div class="sales-history-row header"><span>Month</span><span>Total sales</span><span>Cash</span><span>GCash</span><span>PayMaya</span><span>Orders</span><span>Avg.</span></div>
      <div class="sales-history-row">
        <b>${label}</b>
        <span>₱${thisMonth.toLocaleString("en-PH")}</span>
        <span>₱${records.reduce((s, r) => s + Number(r.cashSales || 0), 0).toLocaleString("en-PH")}</span>
        <span>₱${records.reduce((s, r) => s + Number(r.gcashSales || 0), 0).toLocaleString("en-PH")}</span>
        <span>₱${records.reduce((s, r) => s + Number(r.paymayaSales || 0), 0).toLocaleString("en-PH")}</span>
        <span>${records.reduce((s, r) => s + Number(r.totalOrders || 0), 0)}</span>
        <span>₱${Math.round(
          thisMonth /
            Math.max(
              1,
              records.reduce((s, r) => s + Number(r.totalOrders || 0), 0),
            ),
        ).toLocaleString("en-PH")}</span>
      </div>
    `;
    return;
  }

  if (state.activeSalesView === "yearly") {
    const label = new Date().getFullYear();
    list.innerHTML = `
      <div class="sales-history-row header"><span>Year</span><span>Total sales</span><span>Cash</span><span>GCash</span><span>PayMaya</span><span>Orders</span><span>Avg.</span></div>
      <div class="sales-history-row">
        <b>${label}</b>
        <span>₱${thisYear.toLocaleString("en-PH")}</span>
        <span>₱${records.reduce((s, r) => s + Number(r.cashSales || 0), 0).toLocaleString("en-PH")}</span>
        <span>₱${records.reduce((s, r) => s + Number(r.gcashSales || 0), 0).toLocaleString("en-PH")}</span>
        <span>₱${records.reduce((s, r) => s + Number(r.paymayaSales || 0), 0).toLocaleString("en-PH")}</span>
        <span>${records.reduce((s, r) => s + Number(r.totalOrders || 0), 0)}</span>
        <span>₱${Math.round(
          thisYear /
            Math.max(
              1,
              records.reduce((s, r) => s + Number(r.totalOrders || 0), 0),
            ),
        ).toLocaleString("en-PH")}</span>
      </div>
    `;
    return;
  }

  list.innerHTML = `
    <div class="sales-history-row header"><span>Date</span><span>Total sales</span><span>Cash</span><span>GCash</span><span>PayMaya</span><span>Orders</span><span>Voids</span></div>
    ${records
      .map(
        (record) => `
      <div class="sales-history-row">
        <b>${record.date}</b>
        <span>₱${Number(record.totalSales || 0).toLocaleString("en-PH")}</span>
        <span>₱${Number(record.cashSales || 0).toLocaleString("en-PH")}</span>
        <span>₱${Number(record.gcashSales || 0).toLocaleString("en-PH")}</span>
        <span>₱${Number(record.paymayaSales || 0).toLocaleString("en-PH")}</span>
        <span>${record.totalOrders || 0}</span>
        <span>${record.voidedOrders || 0}</span>
      </div>
    `,
      )
      .join("")}
  `;
}
