const dashboardCompletion = { count: 0, loading: false, closing: false, revision: 0 };

async function dashboardApi(input, query = "") {
  const response = await fetch(quvoPath("api/dashboard/index.php") + query, {
    method: input ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": window.QUVO_CSRF || "" },
    signal: AbortSignal.timeout(15000),
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    const error=new Error(data.error || "Could not update the dashboard.");error.status=response.status;throw error;
  }
  return data;
}

async function refreshDashboardCompletion() {
  if (dashboardCompletion.loading || dashboardCompletion.closing) return;
  dashboardCompletion.loading = true;
  const revision = dashboardCompletion.revision;
  try {
    const data = await dashboardApi();
    if (revision !== dashboardCompletion.revision) return;
    dashboardCompletion.count = Number(data.completed_today);
    renderStats();
  } catch (error) {
    console.error("Dashboard completion refresh failed:", error.message);
  } finally {
    dashboardCompletion.loading = false;
  }
}

function renderAll() {
  syncTableOrdersFromOrders();
  renderStats();
  renderTableMap();
  renderActivities();
  renderMenu();
  renderCart();
  renderSessions();
  renderOrders();
  renderBaristaTickets();
  renderReceipts();
  renderReports();
  renderAdminMenu();
  renderRecords();
  renderSalesHistory();
  renderInventory();
  renderAlerts();
  lucide.createIcons();
}

function syncTableOrdersFromOrders() {
  state.insideTables.forEach((table) => {
    table.orders = state.orders.filter((order) => order.table === `Table ${table.id}`).length;
  });

  state.outsideTables.forEach((table) => {
    table.orders = state.orders.filter((order) => order.table === `Outside ${table.id}`).length;
  });
}

function renderStats() {
  const activeOrderPoints = [
    ...state.insideTables.filter((table) => table.orders > 0),
    ...state.outsideTables.filter((table) => table.orders > 0),
  ].length;

  // Use the full SQL count even when the Sessions list is filtered or paginated.
  const pendingSessions = diningSessionState.counts.pending || 0;
  const activeOrders = state.orders.length;

  document.getElementById("activeTableStat").textContent = activeOrderPoints;
  document.getElementById("pendingSessionsStat").textContent = pendingSessions;
  document.getElementById("activeOrdersStat").textContent = activeOrders;
  const completedToday = dashboardCompletion.count + state.receipts.filter(
    (receipt) => !receipt.persisted && !receipt.closedByEod &&
      (receipt.status === "served" || receipt.status === "completed"),
  ).length;
  document.getElementById("completedTodayStat").textContent = completedToday;
}

function renderTableMap() {
  const map = document.getElementById("tableMap");

  if (!state.insideTables.length && !state.outsideTables.length) {
    map.innerHTML = `<div class="helper-text">No table data loaded. Table records will be populated from the database.</div>`;
    return;
  }

  const insideTables = state.insideTables
    .map((table) => {
      const hasOrder = table.orders > 0;
      return `
      <article class="table-box ${hasOrder ? "has-order" : "no-order"}">
        <div class="table-type">${table.type}</div>
        <div class="table-number">${table.id}</div>
        <div class="table-orders">${hasOrder ? `${table.orders} ${pluralize(table.orders, "order")}` : "No orders"}</div>
      </article>
    `;
    })
    .join("");

  const outsideTables = state.outsideTables
    .map((table) => {
      const hasOrder = table.orders > 0;
      return `
      <article class="table-box ${hasOrder ? "has-order" : "no-order"}">
        <div class="table-type">${table.type}</div>
        <div class="table-number">${table.id}</div>
        <div class="table-orders">${hasOrder ? `${table.orders} ${pluralize(table.orders, "order")}` : "No orders"}</div>
      </article>
    `;
    })
    .join("");

  map.innerHTML = `
    <section class="floor-subsection floor-area inside-area">
      <div class="floor-subtitle-row">
        <h3 class="floor-subtitle">Inside</h3>
        <span class="area-chip indoor-chip">Indoor area</span>
      </div>
      <div class="table-map-grid">
        ${insideTables}
      </div>
    </section>

    <section class="floor-subsection floor-area outside-area">
      <div class="floor-subtitle-row">
        <h3 class="floor-subtitle">Outside</h3>
        <span class="area-chip outdoor-chip">Outdoor area</span>
      </div>
      <div class="outside-grid">
        ${outsideTables}
      </div>
    </section>

    <p class="table-map-note">Table indicators reflect active order data only.</p>
  `;
}

function renderActivities() {
  const list = document.getElementById("activityList");
  list.innerHTML = state.activities.length
    ? state.activities
        .map(
          (activity) => `
    <article class="activity-card">
      <span class="time">${activity.time}</span>
      <span class="status-tag tag-${activity.type}">${activity.tag}</span>
      <div class="activity-title">${activity.text}</div>
      <div class="activity-table">${activity.table}</div>
    </article>
  `,
        )
        .join("")
    : `<div class="helper-text">No activity records loaded.</div>`;
}

function bindEodModal() {
  document.getElementById("openEodBtn")?.addEventListener("click", openEodModal);

  document.getElementById("eodClose")?.addEventListener("click", closeEodModal);

  document.getElementById("eodCancel")?.addEventListener("click", closeEodModal);

  document.getElementById("eodConfirm")?.addEventListener("click", confirmEod);

  document.getElementById("eodModal")?.addEventListener("click", (event) => {
    if (event.target.id === "eodModal") closeEodModal();
  });
}

function openEodModal() {
  document.getElementById('eodNote').value=eodSql.pending?.note||'';
  document.getElementById('eodError').textContent='';
  document.getElementById('eodModal').classList.remove('hidden');lucide.createIcons();loadEodPreview();
}

function closeEodModal() {
  if(dashboardCompletion.closing)return;
  document.getElementById("eodModal").classList.add("hidden");
}

const eodSql={totals:null,pending:null,loading:false};
function eodPendingKey(){return 'quvo_eod_pending_v1_'+(window.QUVO_SESSION?.staff_id||'anonymous');}
function saveEodPending(value){if(value)sessionStorage.setItem(eodPendingKey(),JSON.stringify(value));else sessionStorage.removeItem(eodPendingKey());eodSql.pending=value;}
function eodSubmissionKey(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const key=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return [key.slice(0,8),key.slice(8,12),key.slice(12,16),key.slice(16,20),key.slice(20)].join('-');}
function updateEodControls(){
  document.getElementById('eodConfirm').disabled=dashboardCompletion.closing||(!eodSql.pending&&(eodSql.loading||!eodSql.totals));
  document.getElementById('eodConfirm').textContent=dashboardCompletion.closing?'Saving…':eodSql.pending?'Retry EOD confirmation':'Confirm EOD';
  document.getElementById('eodNote').disabled=dashboardCompletion.closing||Boolean(eodSql.pending);
  document.getElementById('eodClose').disabled=dashboardCompletion.closing;document.getElementById('eodCancel').disabled=dashboardCompletion.closing;
}
function renderEodSummary(){
  const grid=document.getElementById('eodSummary');
  if(!eodSql.totals){grid.innerHTML='<p class="helper-text">'+(eodSql.loading?'Loading closing figures from SQL…':'Closing figures are unavailable. Reopen this popup to retry.')+'</p>';return;}
  document.getElementById('eodOperationDate').textContent='Operation date: '+eodSql.totals.businessDate+' (Philippine time)';
  const t=eodSql.totals,money=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value));
  grid.innerHTML=[['Total sales',money(t.totalSales)],['Cash',money(t.cashSales)],['GCash',money(t.gcashSales)],['PayMaya',money(t.paymayaSales)],['Other digital',money(t.otherSales)],['Paid orders',t.totalOrders],['Today’s paid orders served',t.servedOrders],['Voided orders',t.voidedOrders],['Average order',money(t.averageOrderValue)],['Active orders (all dates)',t.activeOrders]].map(([label,value])=>'<div class="eod-metric"><span>'+label+'</span><b>'+value+'</b></div>').join('');
}
async function loadEodPreview(){
  eodSql.loading=true;eodSql.totals=null;updateEodControls();renderEodSummary();
  try{const data=await dashboardApi(null,'?action=eod-preview');eodSql.totals=data.totals;document.getElementById('eodError').textContent=eodSql.pending?'A previous confirmation needs checking. Retry uses the same EOD key.':'';}
  catch(error){document.getElementById('eodError').textContent=error.message;}
  finally{eodSql.loading=false;renderEodSummary();updateEodControls();}
}
async function confirmEod(){
  if(dashboardCompletion.closing)return;
  try{if(!eodSql.pending)saveEodPending({submission_key:eodSubmissionKey(),note:document.getElementById('eodNote').value.trim(),business_date:eodSql.totals?.businessDate||null});}
  catch(error){document.getElementById('eodError').textContent='Could not save retry information. No EOD was sent.';return;}
  dashboardCompletion.closing=true;dashboardCompletion.revision++;updateEodControls();document.getElementById('eodError').textContent='';
  try{
    const saved=await dashboardApi({action:'eod',...eodSql.pending});dashboardCompletion.revision++;dashboardCompletion.count=Number(saved.completed_today);
    try{saveEodPending(null);}catch{eodSql.pending=null;}
    state.receipts.forEach(receipt=>{if(!receipt.persisted&&['served','completed'].includes(receipt.status))receipt.closedByEod=true;});
    const record=saved.record;
    addSystemRecord('End of day completed','EOD-'+saved.closure_id+' saved with ₱'+Number(record.totalSales).toLocaleString('en-PH')+' total sales','EOD');
    renderStats();document.getElementById('eodModal').classList.add('hidden');
    showToast(saved.replayed?'Previously saved EOD restored. Returning to login.':'End of day saved in SQL. Returning to login.');setTimeout(logoutToLogin,650);
  }catch(error){
    if([413,422].includes(error.status)){try{saveEodPending(null);}catch{eodSql.pending=null;}}
    document.getElementById('eodError').textContent=error.message+(eodSql.pending?' Retry this confirmation to check the saved result.':' Correct the closing note and try again.');showToast(error.message||'EOD could not be saved.');
  }
  finally{dashboardCompletion.closing=false;updateEodControls();}
}
function loadPersistedEodRecords(){
  try{const pending=JSON.parse(sessionStorage.getItem(eodPendingKey())||'null');if(pending?.submission_key&&typeof pending.note==='string')eodSql.pending=pending;}catch{}
  refreshDashboardCompletion();
}
