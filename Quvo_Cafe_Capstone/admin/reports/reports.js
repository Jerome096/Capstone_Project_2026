const reportsSql = {data:null, date:null, period:'daily', loading:false, request:0, error:''};
const reportPeriods = {
  daily: {input:'reportDate', button:'reportsDaily', control:'reportDateControl', summary:'Daily summary', value:'Selected date', current:'Today', eyebrow:'Hourly orders', title:'Paid orders by hour', heading:'Time block'},
  monthly: {input:'reportMonth', button:'reportsMonthly', control:'reportMonthControl', summary:'Monthly summary', value:'Selected month', current:'This month', eyebrow:'Daily orders', title:'Paid orders by day', heading:'Date'},
  yearly: {input:'reportYear', button:'reportsYearly', control:'reportYearControl', summary:'Yearly summary', value:'Selected year', current:'This year', eyebrow:'Monthly orders', title:'Paid orders by month', heading:'Month'},
};

function currentReportDate(period) {
  const today = receiptDay();
  return period === 'yearly' ? today.slice(0,4) : period === 'monthly' ? today.slice(0,7) : today;
}

function reportPeriodLabel(date, period) {
  if (period === 'yearly') return String(Number(date));
  if (period === 'monthly') return new Intl.DateTimeFormat('en-PH', {month:'long', year:'numeric', timeZone:'Asia/Manila'}).format(new Date(date + '-01T00:00:00+08:00'));
  return receiptDateLabel(date);
}

function bindReports() {
  for (const [period, settings] of Object.entries(reportPeriods)) {
    const input = document.getElementById(settings.input);
    input.value = currentReportDate(period);
    input.addEventListener('change', () => {
      if (!input.value) input.value = currentReportDate(period);
      if (reportsSql.period === period) loadReports();
    });
    document.getElementById(settings.button).addEventListener('click', () => {
      reportsSql.period = period;
      loadReports();
    });
  }
  document.getElementById('reportsToday').addEventListener('click', () => {
    document.getElementById(reportPeriods[reportsSql.period].input).value = currentReportDate(reportsSql.period);
    loadReports();
  });
  document.getElementById('reportsRefresh').addEventListener('click', () => loadReports());
  if (window.QUVO_CONFIG.allowedScreens.includes('reports')) loadReports();
}

async function loadReports() {
  if (!window.QUVO_CONFIG.allowedScreens.includes('reports')) return;
  const period = reportsSql.period;
  const input = document.getElementById(reportPeriods[period].input);
  if (!input.value) input.value = currentReportDate(period);
  if (!input.checkValidity()) {
    Object.assign(reportsSql, {request:reportsSql.request + 1, date:null, data:null, loading:false, error:'Choose a valid report date, month or year.'});
    renderReports();
    input.reportValidity();
    return;
  }
  const date = period === 'yearly' ? String(Number(input.value)).padStart(4, '0') : input.value;
  if (reportsSql.loading && reportsSql.date === date && reportsSql.requestPeriod === period) return;
  const request = ++reportsSql.request;
  Object.assign(reportsSql, {date, requestPeriod:period, loading:true, error:'', data:null});
  renderReports();
  try {
    const query = new URLSearchParams({period, date});
    const response = await fetch(quvoPath('api/reports/index.php') + '?' + query, {credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(15000)});
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Could not load reports.');
    if (request === reportsSql.request) reportsSql.data = result.report;
  } catch (error) {
    if (request === reportsSql.request) reportsSql.error = error.message;
  } finally {
    if (request === reportsSql.request) { reportsSql.loading = false; renderReports(); }
  }
}

function renderReports() {
  const summary = document.getElementById('reportSummaryRows');
  if (!summary) return;
  const r = reportsSql, data = r.data, settings = reportPeriods[r.period], e = escapeHtml;
  const money = value => new Intl.NumberFormat('en-PH', {style:'currency', currency:'PHP'}).format(Number(value || 0));
  for (const [period, option] of Object.entries(reportPeriods)) {
    document.getElementById(option.button).setAttribute('aria-pressed', String(r.period === period));
    document.getElementById(option.control).hidden = r.period !== period;
  }
  document.getElementById('reportsToday').textContent = settings.current;
  document.getElementById('reportPeriodHeading').textContent = settings.summary;
  document.getElementById('reportValueHeading').textContent = settings.value;
  document.getElementById('reportActivityEyebrow').textContent = settings.eyebrow;
  document.getElementById('reportActivityTitle').textContent = settings.title;
  document.getElementById('reportActivityHeading').textContent = settings.heading;
  document.getElementById('reportsStatus').textContent = r.error || (r.loading ? 'Loading transactions...' : data ? 'Report period: ' + reportPeriodLabel(data.date, r.period) + ' \u00b7 Philippine time \u00b7 Includes transactions already closed by EOD.' : 'Choose a period to load reports.');
  document.getElementById('reportsRefresh').disabled = r.loading;
  if (document.getElementById('reports').classList.contains('active-screen')) document.getElementById('screenSub').textContent = r.date ? reportPeriodLabel(r.date, r.period) + ' \u00b7 Transaction report' : 'Select a report period';
  if (!data) {
    const text = r.loading ? 'Loading transactions...' : r.error ? 'Reports could not load. Use Refresh to retry.' : 'No report loaded.';
    for (const [id, columns] of [['reportSummaryRows',3], ['hourlyOrderRows',3], ['topItemRows',3], ['paymentSummaryRows',7]]) document.getElementById(id).innerHTML = '<tr><td colspan="' + columns + '">' + e(text) + '</td></tr>';
    return;
  }
  const s = data.summary;
  const scope = r.period === 'daily' ? 'on this date' : r.period === 'monthly' ? 'during this month' : 'during this year';
  const metrics = [
    ['Total revenue', money(s.totalRevenue), 'Approved payments ' + scope + '; excludes cash change.'],
    ['Orders placed', s.ordersPlaced, 'Orders created ' + scope + ', including unpaid and cancelled orders.'],
    ['Paid orders', s.paidOrders, 'Payments approved ' + scope + ', across all order sources.'],
    ['Average paid order', money(s.averageOrderValue), 'Revenue divided by paid orders.'],
    ['Completed orders', s.completedOrders, 'Paid orders marked served ' + scope + '; retained after EOD.'],
    ['Voided orders', s.voidedOrders, 'Orders cancelled ' + scope + '; not revenue.'],
    ['Unpaid orders', s.unpaidOrders, 'Orders created ' + scope + ' that are currently unpaid.'],
  ];
  summary.innerHTML = metrics.map(([label, value, note]) => '<tr><td>' + e(label) + '</td><td class="numeric-cell">' + e(value) + '</td><td>' + e(note) + '</td></tr>').join('');
  const activeBuckets = data.activity.filter(row => Number(row.orders) > 0);
  document.getElementById('hourlyOrderRows').innerHTML = activeBuckets.length ? activeBuckets.map(row => {
    const bucket = Number(row.bucket);
    const label = r.period === 'daily' ? String(bucket).padStart(2, '0') + ':00\u2013' + String(bucket).padStart(2, '0') + ':59'
      : r.period === 'monthly' ? receiptDateLabel(data.date + '-' + String(bucket).padStart(2, '0'))
      : reportPeriodLabel(data.date + '-' + String(bucket).padStart(2, '0'), 'monthly');
    return '<tr><td>' + e(label) + '</td><td class="numeric-cell">' + Number(row.orders) + '</td><td class="numeric-cell">' + money(row.revenue) + '</td></tr>';
  }).join('') : '<tr><td colspan="3">No paid orders for this period.</td></tr>';
  document.getElementById('topItemRows').innerHTML = data.topItems.length ? data.topItems.map((item, index) => '<tr><td class="numeric-cell">' + (index + 1) + '</td><td>' + e(item.name) + '</td><td class="numeric-cell">' + Number(item.units) + '</td></tr>').join('') : '<tr><td colspan="3">No paid item sales for this period.</td></tr>';
  document.getElementById('paymentSummaryRows').innerHTML = data.breakdown.map(row => '<tr><td>' + e(row.label) + '</td>' + ['Cash','GCash','PayMaya','Other','None'].map(method => '<td class="numeric-cell">' + (row.type === 'money' ? money(row.values[method]) : Number(row.values[method])) + '</td>').join('') + '<td class="numeric-cell strong-cell">' + (row.type === 'money' ? money(row.total) : Number(row.total)) + '</td></tr>').join('');
}
