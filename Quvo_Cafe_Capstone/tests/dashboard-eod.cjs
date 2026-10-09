const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const elements = new Map();
function el(id) {
  if (!elements.has(id)) elements.set(id,{textContent:'',value:'',disabled:false,classList:{add(){},remove(){}}});
  return elements.get(id);
}
let count = 4, failEod = false, saved = 0, toast = '', delayedRead;
const receipts = [{persisted:true,status:'served',total:10,paymentMethod:'Cash'},
  {persisted:false,status:'completed',total:20,paymentMethod:'Cash'}];
const context = vm.createContext({console,Date,Number,AbortSignal,
  document:{getElementById:el},window:{QUVO_CSRF:'test'},quvoPath:p=>p,
  state:{insideTables:[],outsideTables:[],orders:[],receipts,eodRecords:[]},diningSessionState:{counts:{}},
  addSystemRecord(){},renderSalesHistory(){},showToast:message=>toast=message,
  setTimeout(){},logoutToLogin(){},
  async fetch(url,options) {
    if(options.method==='POST') {
      if(failEod) throw new Error('EOD unavailable');
      saved++; count=0;
      return {ok:true,json:async()=>({ok:true,closure_id:String(saved),completed_today:0})};
    }
    if(delayedRead) return delayedRead;
    return {ok:true,json:async()=>({ok:true,completed_today:count})};
  }
});
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../cashier/dashboard/dashboard.js'),'utf8'),context);
(async()=>{
  await context.refreshDashboardCompletion();
  assert.equal(el('completedTodayStat').textContent,5,'SQL count plus manual completions');
  await context.confirmEod();
  assert.equal(el('completedTodayStat').textContent,0);
  assert.equal(receipts.length,2,'receipt history stays intact');
  assert.equal(receipts[1].closedByEod,true);
  await context.refreshDashboardCompletion(); assert.equal(el('completedTodayStat').textContent,0);
  count=1; await context.refreshDashboardCompletion(); assert.equal(el('completedTodayStat').textContent,1);
  failEod=true; await context.confirmEod();
  assert.equal(el('completedTodayStat').textContent,1,'failed EOD must not clear count');
  assert.equal(saved,1); assert.match(toast,/unavailable/); assert.equal(el('eodConfirm').disabled,false);
  failEod=false;
  let resolveRead; delayedRead=new Promise(resolve=>resolveRead=resolve);
  const stale=context.refreshDashboardCompletion();
  await context.confirmEod();
  resolveRead({ok:true,json:async()=>({ok:true,completed_today:9})}); await stale;
  assert.equal(el('completedTodayStat').textContent,0,'old polling response cannot undo EOD');
  console.log('PASS: EOD reset, preserved history, refresh persistence, new completions, failure handling and stale polling.');
})().catch(error=>{console.error(error);process.exitCode=1;});
