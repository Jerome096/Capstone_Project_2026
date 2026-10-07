function renderAlerts() {
  const list = document.getElementById("alertsList");
  const banner = document.getElementById("alertBanner");
  const empty = document.getElementById("emptyAlerts");
  const count = state.alerts.length;

  const sidebarCount = document.getElementById("sidebarAlertCount");
  const activeCount = document.getElementById("activeAlertCount");

  if (sidebarCount) sidebarCount.textContent = count;
  if (activeCount) activeCount.textContent = count;

  if (!list || !banner || !empty) return;

  if (count === 0) {
    list.innerHTML = "";
    banner.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }

  banner.classList.remove("hidden");
  empty.classList.add("hidden");

  list.innerHTML = state.alerts
    .map(
      (alert) => `
    <article class="alert-card">
      <div class="alert-left">
        <div class="bell-circle"><i data-lucide="bell"></i></div>
        <div>
          <div class="alert-table">${alert.table}</div>
          <div class="alert-name">${alert.customer}</div>
          <div class="alert-time"><i data-lucide="clock-3"></i>${alert.time}</div>
        </div>
      </div>
      <button class="btn dark" onclick="resolveAlert(${alert.id})">
        <i data-lucide="circle-check" style="width:12px;height:12px;vertical-align:-2px;"></i>
        Resolve
      </button>
    </article>
  `,
    )
    .join("");
}

function resolveAlert(id) {
  const alert = state.alerts.find((entry) => entry.id === id);
  state.alerts = state.alerts.filter((entry) => entry.id !== id);

  if (alert) {
    state.activities.unshift({
      tag: "Alert",
      type: "green",
      text: `Assistance request resolved for ${alert.customer}`,
      table: alert.table,
      time: "now",
    });
  }

  renderAll();
}
