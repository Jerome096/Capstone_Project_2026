const summaryGrid=document.getElementById("summaryGrid"),compactQueue=document.getElementById("compactQueue"),queueBadge=document.getElementById("queueBadge");

function renderSummary(preparingOrders, readyOrders, delayedOrders, totalItems) {
  const cards = [
    {
      label: "Preparing",
      value: preparingOrders.length,
      note: "Food tickets currently in the kitchen queue"
    },
    {
      label: "Ready",
      value: readyOrders.length,
      note: "Food tickets waiting for cashier or staff serving"
    },
    {
      label: "Delayed",
      value: delayedOrders.length,
      note: "Food tickets at 12 minutes or more"
    },
    {
      label: "Total Food Items",
      value: totalItems,
      note: "Food items in the kitchen queue"
    }
  ];

  summaryGrid.innerHTML = cards.map(card => `
    <article class="summary-card">
      <p>${card.label}</p>
      <strong>${card.value}</strong>
      <span>${card.note}</span>
    </article>
  `).join("");
}

function renderCompactQueue(preparingOrders) {
  if (!preparingOrders.length) {
    compactQueue.innerHTML = `<p class="empty-state">No food tickets are currently waiting for preparation.</p>`;
    return;
  }

  compactQueue.innerHTML = preparingOrders
    .slice()
    .sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt))
    .map(order => `
      <button class="compact-ticket" onclick="openOrderModal('${order.id}')">
        <div>
          <h3>${escapeHtml(order.id)} • ${escapeHtml(order.table)}</h3>
          <p>${escapeHtml(order.items.map(item => `${item.qty}x ${item.name}`).join(", "))}</p>
        </div>
        <span class="status-badge ${getElapsedMinutes(order.receivedAt) >= 12 ? "delay" : "warm"}">${formatElapsed(order.receivedAt)}</span>
      </button>
    `).join("");
}
