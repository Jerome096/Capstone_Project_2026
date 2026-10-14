const reportsSql={data:null,date:null,loading:false,request:0,error:'',overall:false};
function bindReports(){
  const date=document.getElementById('reportDate');date.value=receiptDay();
  date.addEventListener('change',()=>{reportsSql.overall=false;if(!date.value)date.value=receiptDay();loadReports();});
  document.getElementById('reportsToday').addEventListener('click',()=>{reportsSql.overall=false;date.value=receiptDay();loadReports();});
  document.getElementById('reportsOverall').addEventListener('click',()=>{reportsSql.overall=true;loadReports();});
  document.getElementById('reportsRefresh').addEventListener('click',()=>loadReports());
  if(window.QUVO_CONFIG.allowedScreens.includes('reports'))loadReports();
}
async function loadReports(){
  if(!window.QUVO_CONFIG.allowedScreens.includes('reports'))return;
  const date=reportsSql.overall?'all':document.getElementById('reportDate').value||receiptDay();
  if(reportsSql.loading&&reportsSql.date===date)return;
  const request=++reportsSql.request;reportsSql.date=date;reportsSql.loading=true;reportsSql.error='';reportsSql.data=null;renderReports();
  try{
    const response=await fetch(quvoPath('api/reports/index.php')+'?date='+encodeURIComponent(date),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
    const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'Could not load reports.');
    if(request!==reportsSql.request)return;reportsSql.data=result.report;
  }catch(error){if(request===reportsSql.request)reportsSql.error=error.message;}
  finally{if(request===reportsSql.request){reportsSql.loading=false;renderReports();}}
}
function renderReports(){
  const summary=document.getElementById('reportSummaryRows');if(!summary)return;
  const r=reportsSql,data=r.data,e=escapeHtml,money=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value||0));
  const period=date=>date==='all'?'All dates':receiptDateLabel(date);
  document.getElementById('reportsOverall').setAttribute('aria-pressed',String(r.overall));
  document.getElementById('reportPeriodHeading').textContent=r.overall?'Overall summary':'Daily summary';
  document.getElementById('reportValueHeading').textContent=r.overall?'All dates':'Selected date';
  document.getElementById('reportsStatus').textContent=r.error||(r.loading?'Loading SQL transactions…':data?'Report period: '+period(data.date)+' · Philippine time · Includes transactions already closed by EOD.':'Choose a date to load reports.');
  document.getElementById('reportsRefresh').disabled=r.loading;
  if(document.getElementById('reports').classList.contains('active-screen')&&r.date)document.getElementById('screenSub').textContent=period(r.date)+' · Transaction report';
  if(!data){
    const text=r.loading?'Loading from SQL…':r.error?'Reports could not load. Use Refresh to retry.':'No report loaded.';
    for(const [id,columns] of [['reportSummaryRows',3],['hourlyOrderRows',3],['topItemRows',3],['paymentSummaryRows',7]])document.getElementById(id).innerHTML='<tr><td colspan="'+columns+'">'+e(text)+'</td></tr>';
    return;
  }
  const s=data.summary;
  const scope=data.date==='all'?'across all dates':'on this date';
  const metrics=[['Total revenue',money(s.totalRevenue),'Approved payments '+scope+'; excludes cash change.'],['Orders placed',s.ordersPlaced,'Orders created '+scope+', including unpaid and cancelled orders.'],['Paid orders',s.paidOrders,'Payments approved '+scope+', across all order sources.'],['Average paid order',money(s.averageOrderValue),'Revenue divided by paid orders.'],['Completed orders',s.completedOrders,'Paid orders marked served '+scope+'; retained after EOD.'],['Voided orders',s.voidedOrders,'Orders cancelled '+scope+'; not revenue.'],['Unpaid orders',s.unpaidOrders,'Orders created '+scope+' that are currently unpaid.']];
  summary.innerHTML=metrics.map(([label,value,note])=>'<tr><td>'+e(label)+'</td><td class="numeric-cell">'+e(value)+'</td><td>'+e(note)+'</td></tr>').join('');
  const activeHours=data.hourly.filter(row=>Number(row.orders)>0);
  document.getElementById('hourlyOrderRows').innerHTML=activeHours.length?activeHours.map(row=>{
    const label=String(row.hour).padStart(2,'0')+':00–'+String(row.hour).padStart(2,'0')+':59';
    return '<tr><td>'+label+'</td><td class="numeric-cell">'+row.orders+'</td><td class="numeric-cell">'+money(row.revenue)+'</td></tr>';
  }).join(''):'<tr><td colspan="3">No paid orders for this period.</td></tr>';
  document.getElementById('topItemRows').innerHTML=data.topItems.length?data.topItems.map((item,index)=>'<tr><td class="numeric-cell">'+(index+1)+'</td><td>'+e(item.name)+'</td><td class="numeric-cell">'+item.units+'</td></tr>').join(''):'<tr><td colspan="3">No paid item sales for this period.</td></tr>';
  document.getElementById('paymentSummaryRows').innerHTML=data.breakdown.map(row=>'<tr><td>'+e(row.label)+'</td>'+['Cash','GCash','PayMaya','Other','None'].map(method=>'<td class="numeric-cell">'+(row.type==='money'?money(row.values[method]):Number(row.values[method]))+'</td>').join('')+'<td class="numeric-cell strong-cell">'+(row.type==='money'?money(row.total):Number(row.total))+'</td></tr>').join('');
}
