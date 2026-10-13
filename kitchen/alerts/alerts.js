const dashboardAlerts=document.getElementById("dashboardAlerts"),fullAlerts=document.getElementById("fullAlerts");

function renderAlerts(delayedOrders) {
  const alerts = [];

  delayedOrders.forEach(order => {
    alerts.push({
      type: "urgent",
      title: `${order.id} needs follow up`,
      body: `${order.table} food ticket has been preparing for ${getElapsedMinutes(order.receivedAt)} minutes.`
    });
  });

  orders.forEach(order => {
    if (order.notes && order.status === "preparing") {
      alerts.push({
        type: "warning",
        title: `${order.id} special note`,
        body: order.notes
      });
    }
  });

  if (!alerts.length) {
    const empty = `<p class="empty-state">No food preparation alerts right now.</p>`;
    dashboardAlerts.innerHTML = empty;
    fullAlerts.innerHTML = empty;
    return;
  }

  const markup = alerts.map(alert => `
    <article class="alert-card ${alert.type}">
      <h3>${escapeHtml(alert.title)}</h3>
      <p>${escapeHtml(alert.body)}</p>
    </article>
  `).join("");

  dashboardAlerts.innerHTML = alerts.slice(0, 4).map(alert => `
    <article class="alert-card ${alert.type}">
      <h3>${escapeHtml(alert.title)}</h3>
      <p>${escapeHtml(alert.body)}</p>
    </article>
  `).join("");

  fullAlerts.innerHTML = markup;
}
