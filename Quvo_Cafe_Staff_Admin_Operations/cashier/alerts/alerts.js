const assistanceAlerts = { loading:false,changing:false,revision:0 };
async function assistanceAlertApi(input) {
  const response=await fetch(quvoPath("api/assistance/index.php"),{
    method:input ? "POST":"GET",credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json","X-CSRF-Token":window.QUVO_CSRF||""},
    signal:AbortSignal.timeout(15000),...(input?{body:JSON.stringify(input)}:{}),
  });
  const data=await response.json();
  if(!response.ok || !data.ok) throw new Error(data.error||"Could not load assistance requests.");
  return data;
}
function installAssistanceAlerts(rows) {
  state.alerts=rows.map(row=>({id:String(row.request_id),table:row.table_name,customer:row.guest_name,
    concern:row.concern}));
  renderAlerts(); lucide.createIcons();
}
async function loadAssistanceAlerts() {
  if(assistanceAlerts.loading || assistanceAlerts.changing) return;
  assistanceAlerts.loading=true; const revision=assistanceAlerts.revision;
  try {
    const data=await assistanceAlertApi();
    if(revision!==assistanceAlerts.revision) return;
    installAssistanceAlerts(data.requests);
    document.getElementById("assistanceNotice").textContent="";
  } catch(error) {
    document.getElementById("assistanceNotice").textContent=error.message+" Retrying automatically.";
  } finally {assistanceAlerts.loading=false;}
}
function bindAssistanceAlerts() {
  loadAssistanceAlerts();
  setInterval(loadAssistanceAlerts,5000);
}
function renderAlerts() {
  const list = document.getElementById("alertsList");
  const banner = document.getElementById("alertBanner");
  const empty = document.getElementById("emptyAlerts");
  const count = state.alerts.length;
  globalThis.QUVO_WORKSPACE?.setNotificationCount("alerts", count);

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
          <div class="alert-table">${escapeHtml(alert.table)}</div>
          <div class="alert-name">${escapeHtml(alert.customer)}</div>
          <p class="alert-concern">${escapeHtml(alert.concern)}</p>
        </div>
      </div>
      <button class="btn dark" ${assistanceAlerts.changing ? "disabled" : ""} onclick="resolveAlert('${alert.id}')">
        <i data-lucide="circle-check" style="width:12px;height:12px;vertical-align:-2px;"></i>
        Resolve
      </button>
    </article>
  `,
    )
    .join("");
}

async function resolveAlert(id) {
  if(assistanceAlerts.changing) return;
  const alert = state.alerts.find((entry) => entry.id === id);
  assistanceAlerts.changing=true; assistanceAlerts.revision++;
  renderAlerts();
  try {
    const data=await assistanceAlertApi({action:"resolve",id});
    installAssistanceAlerts(data.requests);
    if (alert && data.resolved) {
    state.activities.unshift({
      tag: "Alert",
      type: "green",
      text: `Assistance request resolved for ${escapeHtml(alert.customer)}`,
      table: alert.table,
      time: "now",
    });
    }
    renderActivities();
    if(!data.resolved) showToast("This assistance request is no longer pending.");
  } catch(error) {showToast(error.message);}
  finally {assistanceAlerts.changing=false;renderAlerts();lucide.createIcons();}
}
