const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const els=new Map();const el=id=>{if(!els.has(id))els.set(id,{textContent:'',innerHTML:'',hidden:false,disabled:false});return els.get(id);};
let fail=false,delay=false,resolveOld;const urls=[];
const row=period=>({period,totalSales:'30.50',cashSales:'10.00',gcashSales:'10.00',paymayaSales:'0.00',otherSales:'10.50',totalOrders:3,voidedOrders:1,eodCount:2});
const data=period=>({ok:true,rows:[row(period)],summary:{today:'100.50',month:'200.50',year:'300.50',eodCount:8},next_offset:50});
const ctx=vm.createContext({console,Date,Intl,Number,AbortSignal,window:{QUVO_CONFIG:{allowedScreens:['salesHistory']}},state:{activeSalesView:'daily'},document:{getElementById:el},escapeHtml:String,quvoPath:v=>v,
 async fetch(url){urls.push(url);if(fail)throw Error('SQL unavailable');if(delay){delay=false;return new Promise(resolve=>resolveOld=resolve);}return {ok:true,json:async()=>data(url.includes('monthly')?'2026-09':url.includes('yearly')?'2025':'2026-10-14')};}});
const run=code=>vm.runInContext(code,ctx);run(fs.readFileSync(path.join(__dirname,'../admin/sales-history/sales-history.js'),'utf8'));
(async()=>{
 await run('loadSalesHistory()');assert.equal(el('salesTodayStat').textContent,'₱100.50');assert.equal(el('eodRecordCount').textContent,8);assert.match(el('salesHistoryList').innerHTML,/Oct 14, 2026/);assert.match(el('salesHistoryList').innerHTML,/Other digital/);assert.equal(el('salesHistoryMore').hidden,false);
 await run('loadSalesHistory(true)');assert.match(urls.at(-1),/offset=50/);assert.equal(run('salesHistorySql.rows.length'),2);
 delay=true;const stale=run('loadSalesHistory()');run('state.activeSalesView="monthly"');await run('loadSalesHistory()');resolveOld({ok:true,json:async()=>data('2020-01-01')});await stale;assert.equal(run('salesHistorySql.view'),'monthly');assert.match(el('salesHistoryList').innerHTML,/September 2026/);assert.doesNotMatch(el('salesHistoryList').innerHTML,/2020/);
 run('state.activeSalesView="yearly"');await run('loadSalesHistory()');assert.match(el('salesHistoryList').innerHTML,/2025/);assert.equal(el('salesYearStat').textContent,'₱300.50');
 fail=true;await run('loadSalesHistory()');assert.match(el('salesHistoryStatus').textContent,/SQL unavailable/);assert.match(el('salesHistoryList').innerHTML,/Refresh/);assert.equal(el('salesHistoryRefresh').disabled,false);
 console.log('PASS: SQL-backed sales cards, daily/monthly/yearly dates, custom-method totals, pagination, stale-response isolation and retry UI.');
})().catch(error=>{console.error(error);process.exitCode=1;});
