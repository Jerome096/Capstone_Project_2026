const salesHistorySql={loading:false,request:0,view:null,rows:[],summary:null,nextOffset:null,error:''};
function bindSalesHistory(){
  document.querySelectorAll('[data-sales-view]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('[data-sales-view]').forEach(entry=>entry.classList.remove('active'));button.classList.add('active');state.activeSalesView=button.dataset.salesView;loadSalesHistory();
  }));
  document.getElementById('salesHistoryRefresh').addEventListener('click',()=>loadSalesHistory());
  document.getElementById('salesHistoryMore').addEventListener('click',()=>loadSalesHistory(true));
  if(window.QUVO_CONFIG.allowedScreens.includes('salesHistory'))loadSalesHistory();
}
async function loadSalesHistory(append=false){
  if(!window.QUVO_CONFIG.allowedScreens.includes('salesHistory'))return;
  const view=state.activeSalesView||'daily';if(salesHistorySql.loading&&salesHistorySql.view===view)return;
  if(append&&salesHistorySql.nextOffset===null)return;
  const request=++salesHistorySql.request,offset=append?salesHistorySql.nextOffset:0;
  salesHistorySql.loading=true;salesHistorySql.error='';if(!append){salesHistorySql.rows=[];salesHistorySql.view=view;}renderSalesHistory();
  try{
    const response=await fetch(quvoPath('api/sales-history/index.php')+'?view='+view+'&offset='+offset,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
    const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Could not load sales history.');if(request!==salesHistorySql.request)return;
    salesHistorySql.rows=append?[...salesHistorySql.rows,...data.rows]:data.rows;salesHistorySql.summary=data.summary;salesHistorySql.nextOffset=data.next_offset;
  }catch(error){if(request===salesHistorySql.request)salesHistorySql.error=error.message;}
  finally{if(request===salesHistorySql.request){salesHistorySql.loading=false;renderSalesHistory();}}
}
function salesPeriodLabel(period,view){
  if(view==='yearly')return period;
  const value=period+(view==='monthly'?'-01':'');return new Date(value+'T00:00:00+08:00').toLocaleDateString('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:view==='monthly'?'long':'short',...(view==='daily'?{day:'numeric'}:{})});
}
function renderSalesHistory(){
  const list=document.getElementById('salesHistoryList');if(!list)return;
  const data=salesHistorySql,money=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value||0));
  for(const [id,key] of [['salesTodayStat','today'],['salesMonthStat','month'],['salesYearStat','year']])document.getElementById(id).textContent=data.summary?money(data.summary[key]):'—';
  document.getElementById('eodRecordCount').textContent=data.summary?.eodCount??'—';
  document.getElementById('salesHistoryStatus').textContent=data.error||(data.loading?'Loading from SQL…':'Sales cards show approved payments. The list shows saved EOD totals by closing date.');
  document.getElementById('salesHistoryMore').hidden=data.nextOffset===null||!data.rows.length;document.getElementById('salesHistoryMore').disabled=data.loading;document.getElementById('salesHistoryRefresh').disabled=data.loading;
  if(!data.rows.length){list.innerHTML='<p class="helper-text">'+(data.loading?'Loading saved EOD records…':data.error?'Use Refresh to try again.':'No saved EOD records yet.')+'</p>';return;}
  const view=data.view||'daily',label=view==='monthly'?'Month':view==='yearly'?'Year':'Date';
  list.innerHTML='<div class="sales-table-scroll"><table class="sales-history-table"><thead><tr>'+[label,'Total sales','Cash','GCash','PayMaya','Other digital','Paid orders','Voids','EOD records'].map(title=>'<th scope="col">'+title+'</th>').join('')+'</tr></thead><tbody>'+data.rows.map(row=>'<tr><th scope="row">'+escapeHtml(salesPeriodLabel(row.period,view))+'</th>'+['totalSales','cashSales','gcashSales','paymayaSales','otherSales'].map(field=>'<td>'+money(row[field])+'</td>').join('')+'<td>'+row.totalOrders+'</td><td>'+row.voidedOrders+'</td><td>'+row.eodCount+'</td></tr>').join('')+'</tbody></table></div>';
}