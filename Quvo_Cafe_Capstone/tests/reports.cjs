const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const els=new Map();
function el(id){
  if(!els.has(id))els.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,hidden:false,valid:true,handlers:{},
    setAttribute(name,value){this[name]=value;},addEventListener(event,fn){this.handlers[event]=fn;},click(){return this.handlers.click?.();},
    checkValidity(){return this.valid;},reportValidity(){this.validationShown=true;},classList:{contains:()=>true}});
  return els.get(id);
}
let fail=false,delay=false,oldResponse;const urls=[];
function report(period,date){
  const count=period==='daily'?24:period==='yearly'?12:new Date(Number(date.slice(0,4)),Number(date.slice(5,7)),0).getDate();
  const first=period==='daily'?0:1,last=period==='daily'?12:count;
  return {period,date,summary:{totalRevenue:'10.25',paidOrders:1,averageOrderValue:'10.25',ordersPlaced:2,completedOrders:1,voidedOrders:0,unpaidOrders:1},
    activity:Array.from({length:count},(_,i)=>({bucket:i+first,orders:i+first===last?1:0,revenue:i+first===last?'10.25':'0.00'})),
    topItems:[{name:'<Coffee>',units:2}],breakdown:[{label:'Revenue',type:'money',values:{Cash:'0.00',GCash:'10.25',PayMaya:'0.00',Other:'0.00',None:'0.00'},total:'10.25'}]};
}
const ctx=vm.createContext({console,Date,Intl,Number,String,Object,URLSearchParams,AbortSignal,window:{QUVO_CONFIG:{allowedScreens:['reports']}},document:{getElementById:el},
  state:{receipts:[{total:999999}],orders:[{total:999999}]},receiptDay:()=> '2026-10-20',receiptDateLabel:v=>v,
  escapeHtml:v=>String(v).replaceAll('<','&lt;').replaceAll('>','&gt;'),quvoPath:v=>v,
  async fetch(url){urls.push(url);if(fail)throw Error('Reports SQL unavailable');if(delay){delay=false;return new Promise(resolve=>oldResponse=resolve);}
    const query=new URL(url,'http://test/').searchParams,period=query.get('period'),date=query.get('date')||({daily:'2026-10-20',monthly:'2026-10',yearly:'2026'}[period]);return {ok:true,json:async()=>({ok:true,report:report(period,date)})};
  }});
const run=code=>vm.runInContext(code,ctx);
run(fs.readFileSync(path.join(__dirname,'../admin/reports/reports.js'),'utf8'));
async function settled(){for(let i=0;i<50;i++){if(!run('reportsSql.loading'))return;await new Promise(resolve=>setImmediate(resolve));}throw Error('Reports did not settle');}
(async()=>{
  run('bindReports()');await settled();
  assert.equal(el('reportDate').value,'2026-10-20');assert.equal(el('reportMonth').value,'2026-10');assert.equal(el('reportYear').value,'2026');
  assert.match(urls.at(-1),/period=daily$/); // The server selects the current opening day.
  assert.match(el('reportSummaryRows').innerHTML,/\u20b110\.25/);assert.doesNotMatch(el('reportSummaryRows').innerHTML,/999/);
  assert.match(el('hourlyOrderRows').innerHTML,/12:00\u201312:59/);assert.doesNotMatch(el('hourlyOrderRows').innerHTML,/23:00/);
  assert.match(el('topItemRows').innerHTML,/&lt;Coffee&gt;/);assert.match(el('paymentSummaryRows').innerHTML,/\u20b110\.25/);
  assert.equal(el('screenSub').textContent,'2026-10-20 \u00b7 Transaction report');
  el('reportMonth').value='2024-02';el('reportsMonthly').click();await settled();
  assert.match(urls.at(-1),/period=monthly&date=2024-02/);
  assert.equal(el('reportPeriodHeading').textContent,'Monthly summary');assert.equal(el('reportActivityTitle').textContent,'Paid orders by day');
  assert.equal(el('reportMonthControl').hidden,false);assert.equal(el('reportDateControl').hidden,true);assert.equal(el('reportYearControl').hidden,true);
  assert.equal(el('reportsMonthly')['aria-pressed'],'true');assert.equal(el('reportsDaily')['aria-pressed'],'false');
  assert.equal(el('reportsToday').textContent,'This month');assert.match(el('reportsStatus').textContent,/February 2024/);
  assert.match(el('hourlyOrderRows').innerHTML,/2024-02-29/);assert.match(el('reportSummaryRows').innerHTML,/during this month/);
  delay=true;const stale=run('loadReports()');
  el('reportYear').value='2025';el('reportsYearly').click();await settled();
  oldResponse({ok:true,json:async()=>({ok:true,report:report('monthly','2024-02')})});await stale;
  assert.equal(run('reportsSql.data.period'),'yearly');assert.equal(run('reportsSql.data.date'),'2025');
  assert.match(urls.at(-1),/period=yearly&date=2025/);
  assert.equal(el('reportActivityTitle').textContent,'Paid orders by month');assert.equal(el('reportValueHeading').textContent,'Selected year');
  assert.equal(el('reportYearControl').hidden,false);assert.equal(el('reportMonthControl').hidden,true);
  assert.match(el('hourlyOrderRows').innerHTML,/December 2025/);assert.match(el('reportSummaryRows').innerHTML,/during this year/);
  el('reportsToday').click();await settled();assert.equal(run('reportsSql.data.date'),'2026');
  const beforeInvalid=urls.length;el('reportYear').valid=false;el('reportYear').value='10000';await run('loadReports()');
  assert.equal(urls.length,beforeInvalid);assert.equal(el('reportYear').validationShown,true);el('reportYear').valid=true;
  el('reportYear').value='';el('reportYear').handlers.change();await settled();assert.equal(run('reportsSql.data.date'),'2026');
  run('reportsSql.data.activity.forEach(row=>row.orders=0);renderReports()');assert.match(el('hourlyOrderRows').innerHTML,/No paid orders/);
  fail=true;await run('loadReports()');assert.equal(run('reportsSql.data'),null);assert.match(el('reportsStatus').textContent,/SQL unavailable/);
  assert.match(el('reportSummaryRows').innerHTML,/Refresh/);assert.equal(el('reportsRefresh').disabled,false);
  fail=false;el('reportsRefresh').click();await settled();assert.equal(run('reportsSql.error'),'');
  el('reportsDaily').click();await settled();assert.equal(run('reportsSql.data.period'),'daily');
  assert.equal(run('reportsSql.data.date'),'2026-10-20');assert.equal(el('reportsToday').textContent,'Today');
  const before=urls.length;ctx.window.QUVO_CONFIG.allowedScreens=[];await run('loadReports()');assert.equal(urls.length,before);
  assert.ok(urls.every(url=>!url.includes('date=all')));
  console.log('PASS: daily/monthly/yearly controls, leap month rows, period requests, stale responses, current-period actions, exact money, HTML escaping, invalid inputs, empty results, retry and staff-workspace guard.');
})().catch(error=>{console.error(error);process.exitCode=1;});
