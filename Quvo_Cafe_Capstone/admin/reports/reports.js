function renderReports() {
  const reportSummaryRows = document.getElementById("reportSummaryRows");
  const hourlyOrderRows = document.getElementById("hourlyOrderRows");
  const topItemRows = document.getElementById("topItemRows");
  const paymentSummaryRows = document.getElementById("paymentSummaryRows");

  const activeTransactions = [
    ...state.receipts.filter((receipt) => receipt.status !== "voided"),
    ...state.orders.filter((order) => order.paymentStatus === "confirmed" || order.paid),
  ];

  const totalRevenue = activeTransactions.reduce(
    (sum, entry) => sum + Number(entry.total || 0),
    0,
  );
  const totalOrders = activeTransactions.length;
  const averageOrder = totalOrders ? Math.round(totalRevenue / totalOrders) : 0;
  const served = state.receipts.filter((receipt) => receipt.status === "served").length;

  const summaryData = [
    {
      metric: "Total revenue",
      value: `₱${totalRevenue.toLocaleString("en-PH")}`,
      note: "Will be sourced from database transactions",
    },
    {
      metric: "Orders today",
      value: String(totalOrders),
      note: "Will be sourced from order records",
    },
    {
      metric: "Average order value",
      value: `₱${averageOrder.toLocaleString("en-PH")}`,
      note: "Calculated from recorded orders",
    },
    {
      metric: "Completed orders",
      value: String(served),
      note: "Will be sourced from completed transactions",
    },
  ];

  if (reportSummaryRows) {
    reportSummaryRows.innerHTML = summaryData
      .map(
        (row) => `
      <tr><td>${row.metric}</td><td class="numeric-cell">${row.value}</td><td>${row.note}</td></tr>
    `,
      )
      .join("");
  }

  if (hourlyOrderRows) {
    hourlyOrderRows.innerHTML = `<tr><td colspan="3">No hourly order data loaded. Database integration will populate this report.</td></tr>`;
  }

  const itemCounts = new Map();
  [...state.orders, ...state.receipts].forEach((record) => {
    (record.items || []).forEach((item) => {
      itemCounts.set(item.name, (itemCounts.get(item.name) || 0) + Number(item.qty || 0));
    });
  });
  const items = [...itemCounts.entries()]
    .map(([name, orders]) => ({ name, orders }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 5);

  if (topItemRows) {
    topItemRows.innerHTML = items.length
      ? items
          .map(
            (item, index) =>
              `<tr><td class="numeric-cell">${index + 1}</td><td>${item.name}</td><td class="numeric-cell">${item.orders}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="3">No menu transaction data loaded.</td></tr>`;
  }

  const methods = ["Cash", "GCash", "PayMaya"];
  const confirmed = Object.fromEntries(
    methods.map((method) => [
      method,
      activeTransactions.filter((entry) => entry.paymentMethod === method).length,
    ]),
  );
  const voided = Object.fromEntries(
    methods.map((method) => [
      method,
      state.receipts.filter(
        (entry) => entry.status === "voided" && entry.paymentMethod === method,
      ).length,
    ]),
  );
  const paymentData = [
    {
      category: "Confirmed payments",
      cash: confirmed.Cash,
      gcash: confirmed.GCash,
      paymaya: confirmed.PayMaya,
    },
    {
      category: "Voided transactions",
      cash: voided.Cash,
      gcash: voided.GCash,
      paymaya: voided.PayMaya,
    },
  ];

  if (paymentSummaryRows) {
    paymentSummaryRows.innerHTML = paymentData
      .map((row) => {
        const total = row.cash + row.gcash + row.paymaya;
        return `<tr><td>${row.category}</td><td class="numeric-cell">${row.cash}</td><td class="numeric-cell">${row.gcash}</td><td class="numeric-cell">${row.paymaya}</td><td class="numeric-cell strong-cell">${total}</td></tr>`;
      })
      .join("");
  }
}
