(function(){
  'use strict';
  const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value||0));
  let serverOffset=0;
  const now=()=>new Date(Date.now()+serverOffset).toISOString();
  const time=value=>value?new Date(value.replace(' ','T')+(/Z$/.test(value)?'':'Z')).toLocaleString('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
  function markup(r){
    const row=(label,value,strong=false)=>'<div class="thermal-row'+(strong?' thermal-grand-total':'')+'"><span>'+e(label)+'</span><b>'+e(value)+'</b></div>';
    return '<article class="thermal-receipt"><header><h3>Quvo Café</h3><h4>SHIFT SALES REPORT</h4><strong>EOD-'+e(r.closureId)+'</strong></header>'+row('Operation','OP-'+r.operationId)+row('Drawer',r.drawer)+row('Business date',r.businessDate)+row('Opened by',r.openedBy)+row('Opened at',time(r.openedAt))+row('Closed by',r.closedBy)+row('EOD saved at',time(r.closedAt))+'<div class="thermal-totals">'+row('Beginning cash fund',money(r.openingCash))+r.methods.map(m=>row(m.label+' sales',money(m.amount))).join('')+row('Total sales',money(r.totalSales),true)+row('Other cash in',money(r.otherCashIn))+row('Cash payouts',money(r.cashPayouts))+row('Cash drops / deposits',money(r.cashDrops))+'</div><div class="thermal-totals">'+row('Expected cash',money(r.expectedCash))+row('Actual cash counted',money(r.actualCash))+row('Cash difference',money(r.cashDifference),true)+row('Cashier status',r.cashStatus,true)+'</div>'+(r.note?'<p>'+e(r.note)+'</p>':'')+'<footer>Count submitted and locked<br>Philippine time<br>Printed at: '+e(time(now()))+'</footer></article>';
  }
  window.QuvoCashSlip={markup,money,time,sync(serverDate){const value=Date.parse(serverDate);if(Number.isFinite(value))serverOffset=value-Date.now();},print(record,onCleanup=()=>{}){const document=buildThermalPrintDocument('EOD-'+record.closureId,markup(record)).replace('@page{size:58mm 200mm;','@page{size:58mm 320mm;');return printThermalDocument(document,'EOD-'+record.closureId,onCleanup);}};
})();
