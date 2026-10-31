const reportsSql = {data:null, date:null, period:'daily', loading:false, request:0, error:''};
const reportPeriods = {
  daily: {input:'reportDate', button:'reportsDaily', control:'reportDateControl', summary:'Daily summary', value:'Selected date', current:'Today', eyebrow:'Hourly orders', title:'Paid orders by hour', heading:'Time block'},
  monthly: {input:'reportMonth', button:'reportsMonthly', control:'reportMonthControl', summary:'Monthly summary', value:'Selected month', current:'This month', eyebrow:'Daily orders', title:'Paid orders by day', heading:'Date'},
  yearly: {input:'reportYear', button:'reportsYearly', control:'reportYearControl', summary:'Yearly summary', value:'Selected year', current:'This year', eyebrow:'Monthly orders', title:'Paid orders by month', heading:'Month'},
};

function currentReportDate(period) {
  const today = window.QuvoBusinessDay?.date() || receiptDay();
  return period === 'yearly' ? today.slice(0,4) : period === 'monthly' ? today.slice(0,7) : today;
}

function reportPeriodLabel(date, period) {
  if (period === 'yearly') return String(Number(date));
  if (period === 'monthly') return new Intl.DateTimeFormat('en-PH', {month:'long', year:'numeric', timeZone:'Asia/Manila'}).format(new Date(date + '-01T00:00:00+08:00'));
  return receiptDateLabel(date);
}

function reportMetricChange(current, previous, currency = false, lowerBetter = false) {
  const units = value => {
    if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
    const scaled = Math.round(Number(value) * (currency ? 100 : 1));
    return Number.isSafeInteger(scaled) ? scaled : null;
  };
  const selected = units(current), before = units(previous);
  if (selected === null || before === null) return {tone:'neutral', direction:'unavailable'};
  const delta = selected - before;
  return {tone:delta === 0 ? 'neutral' : (lowerBetter ? delta < 0 : delta > 0) ? 'positive' : 'negative',
    direction:delta === 0 ? 'equal' : delta > 0 ? 'higher' : 'lower',
    amount:Math.abs(delta) / (currency ? 100 : 1), percentage:before === 0 ? null : delta / before * 100};
}

function reportComparisonCell(key, value, currency, lowerBetter, comparison, money) {
  const e = escapeHtml, previous = comparison?.summary?.[key];
  let change = reportMetricChange(value, previous, currency, lowerBetter), unavailable = '';
  if (!comparison) unavailable = 'Comparison unavailable';
  else if (comparison.selectedStatus === 'upcoming') unavailable = 'Period has not started';
  else if (!comparison.hasActivity) unavailable = 'No previous transactions';
  else if (key === 'outsideHoursOrders' && !comparison.outsideHoursComparable) unavailable = 'No comparable schedule';
  if (unavailable) change = {tone:'neutral', direction:'unavailable'};
  let label = unavailable || 'Comparison unavailable';
  if (change.direction === 'equal') label = '= No change';
  else if (change.direction === 'higher' || change.direction === 'lower') {
    const amount = currency ? money(change.amount) : new Intl.NumberFormat('en-PH').format(change.amount);
    const percent = change.percentage === null ? 'from zero' : Math.abs(change.percentage) < .1 ? '<0.1%' :
      (change.percentage > 0 ? '+' : '\u2212') + new Intl.NumberFormat('en-PH', {maximumFractionDigits:1}).format(Math.abs(change.percentage)) + '%';
    label = (change.direction === 'higher' ? '\u2191 Higher by ' : '\u2193 Lower by ') + amount + ' (' + percent + ')';
  }
  const previousValue = previous === null || previous === undefined ? '\u2014' : currency ? money(previous) : new Intl.NumberFormat('en-PH').format(previous);
  return '<div class="report-metric-value report-metric-value--' + change.tone + '">' + e(currency ? money(value) : value) + '</div>' +
    '<div class="report-prior-value">Previous: ' + e(previousValue) + '</div>' +
    '<span class="report-change report-change--' + change.tone + '">' + e(label) + '</span>';
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
    loadReports(true);
  });
  document.getElementById('reportsRefresh').addEventListener('click', () => loadReports());
  if (window.QUVO_CONFIG.allowedScreens.includes('reports')) loadReports(true);
}

async function loadReports(current = false) {
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
  if (!current && reportsSql.loading && reportsSql.date === date && reportsSql.requestPeriod === period) return;
  const request = ++reportsSql.request;
  Object.assign(reportsSql, {date, requestPeriod:period, loading:true, error:'', data:null});
  renderReports();
  try {
    const query = new URLSearchParams(current ? {period} : {period, date});
    const response = await fetch(quvoPath('api/reports/index.php') + '?' + query, {credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(15000)});
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Could not load reports.');
    if (request === reportsSql.request) { reportsSql.data = result.report; reportsSql.date = result.report.date; input.value = result.report.date; }
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
  window.QuvoCafeWorkspace?.renderReportOverview(r);
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
  const hours = data?.operatingHours;
  const windowLabel = hours ? ' · Window: ' + [hours.windowStart, hours.windowEnd].map(value => new Date(value.replace(' ', 'T') + 'Z').toLocaleString('en-PH', {timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})).join(' to ') : '';
  document.getElementById('reportsStatus').textContent = r.error || (r.loading ? 'Loading transactions...' : data ? 'Business period: ' + reportPeriodLabel(data.date, r.period) + windowLabel + ' · Philippine time · Includes transactions already closed by EOD.' + (hours?.setupRequired ? ' Install the operating-hours SQL setup to enable store schedules.' : '') : 'Choose a period to load reports.');
  document.getElementById('reportsRefresh').disabled = r.loading;
  const comparison = data?.comparison, comparisonStatus = document.getElementById('reportComparisonStatus');
  const previousLabel = {daily:'previous business day', monthly:'previous month', yearly:'previous year'}[r.period];
  let comparisonText = comparison ? 'Compared with the ' + previousLabel + ': ' + reportPeriodLabel(comparison.date, r.period) + '.' : 'Previous-period comparison is unavailable.';
  if (comparison?.selectedStatus === 'in_progress') comparisonText += ' Current period is still in progress; previous totals cover the full period.';
  else if (comparison?.selectedStatus === 'upcoming') comparisonText += ' This period has not started; color comparisons are not applied yet.';
  if (comparison && !comparison.hasActivity) comparisonText += ' No transactions were recorded in that previous period.';
  if (comparisonStatus) comparisonStatus.textContent = !data ? (r.loading ? 'Loading comparison...' : 'Load a report to compare periods.') : comparisonText;
  if (document.getElementById('reports').classList.contains('active-screen')) document.getElementById('screenSub').textContent = r.date ? reportPeriodLabel(r.date, r.period) + ' \u00b7 Transaction report' : 'Select a report period';
  if (!data) {
    const text = r.loading ? 'Loading transactions...' : r.error ? 'Reports could not load. Use Refresh to retry.' : 'No report loaded.';
    for (const [id, columns] of [['reportSummaryRows',3], ['hourlyOrderRows',3], ['topItemRows',3], ['paymentSummaryRows',7], ['reportPaymentMethodRows',3]]) document.getElementById(id).innerHTML = '<tr><td colspan="' + columns + '">' + e(text) + '</td></tr>';
    return;
  }
  const s = data.summary;
  const scope = r.period === 'daily' ? 'on this date' : r.period === 'monthly' ? 'during this month' : 'during this year';
  const metrics = [
    ['totalRevenue', 'Total revenue', true, false, 'Approved payments ' + scope + '; excludes cash change.'],
    ['ordersPlaced', 'Orders placed', false, false, 'Orders created ' + scope + ', including unpaid and cancelled orders.'],
    ['paidOrders', 'Paid orders', false, false, 'Payments approved ' + scope + ', across all order sources.'],
    ['averageOrderValue', 'Average paid order', true, false, 'Revenue divided by paid orders.'],
    ['completedOrders', 'Completed orders', false, false, 'Paid orders marked served ' + scope + '; retained after EOD.'],
    ['voidedOrders', 'Voided orders', false, true, 'Orders cancelled ' + scope + '; not revenue.'],
    ['unpaidOrders', 'Unpaid orders', false, true, 'Orders created ' + scope + ' that are currently unpaid.'],
  ];
  if (r.period === 'daily' && hours && !hours.legacy) metrics.push(['outsideHoursOrders', 'After scheduled closing', false, true, 'Already included in revenue for this opening day; recorded before the next opening.']);
  summary.innerHTML = metrics.map(([key, label, currency, lowerBetter, note]) => '<tr role="row" data-report-metric="' + key + '"><td role="cell">' + e(label) + '</td><td role="cell" class="numeric-cell report-comparison-cell">' + reportComparisonCell(key, s[key] || 0, currency, lowerBetter, comparison, money) + '</td><td role="cell">' + e(note) + '</td></tr>').join('');
  const activeBuckets = data.activity.filter(row => Number(row.orders) > 0);
  document.getElementById('hourlyOrderRows').innerHTML = activeBuckets.length ? activeBuckets.map(row => {
    const bucket = Number(row.bucket);
    const label = r.period === 'daily' ? row.label || String(bucket).padStart(2, '0') + ':00\u2013' + String(bucket).padStart(2, '0') + ':59'
      : r.period === 'monthly' ? receiptDateLabel(data.date + '-' + String(bucket).padStart(2, '0'))
      : reportPeriodLabel(data.date + '-' + String(bucket).padStart(2, '0'), 'monthly');
    return '<tr><td>' + e(label) + '</td><td class="numeric-cell">' + Number(row.orders) + '</td><td class="numeric-cell">' + money(row.revenue) + '</td></tr>';
  }).join('') : '<tr><td colspan="3">No paid orders for this period.</td></tr>';
  document.getElementById('topItemRows').innerHTML = data.topItems.length ? data.topItems.map((item, index) => '<tr><td class="numeric-cell">' + (index + 1) + '</td><td>' + e(item.name) + '</td><td class="numeric-cell">' + Number(item.units) + '</td></tr>').join('') : '<tr><td colspan="3">No paid item sales for this period.</td></tr>';
  document.getElementById('paymentSummaryRows').innerHTML = data.breakdown.map(row => '<tr><td>' + e(row.label) + '</td>' + ['Cash','GCash','PayMaya','Other','None'].map(method => '<td class="numeric-cell">' + (row.type === 'money' ? money(row.values[method]) : Number(row.values[method])) + '</td>').join('') + '<td class="numeric-cell strong-cell">' + (row.type === 'money' ? money(row.total) : Number(row.total)) + '</td></tr>').join('');
  document.getElementById('reportPaymentMethodRows').innerHTML=(data.paymentDetails||[]).length?data.paymentDetails.map(method=>'<tr><td>'+e(method.label)+'</td><td class="numeric-cell">'+Number(method.orders)+'</td><td class="numeric-cell">'+money(method.revenue)+'</td></tr>').join(''):'<tr><td colspan="3">No paid payment-method totals for this period.</td></tr>';
}
