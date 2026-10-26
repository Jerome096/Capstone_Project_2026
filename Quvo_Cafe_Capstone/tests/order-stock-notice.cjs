const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../cashier/orders/sql-orders.js'),'utf8');let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;};
const notice=(id,warn=true)=>({orderId:String(id),hasWarnings:warn,unavailableItems:[],shortages:warn?[{name:'Milk <unsafe>',unit:'L',active:true,available:'0.000',required:'0.360',items:[{name:'Latte <unsafe>',quantity:2}]}]:[]});
function fixture(){
 const els=new Map(),calls={stock:[],payments:[],confirm:[],tickets:[]},settings={hold:false,failStock:false,failPayment:false,confirm:true},waiting=[];
 const el=id=>{if(!els.has(id)){const classes=new Set(['hidden']);els.set(id,{value:'',textContent:'',innerHTML:'',hidden:true,disabled:false,classList:{add:key=>classes.add(key),remove:key=>classes.delete(key),contains:key=>classes.has(key)}});}return els.get(id);};
 const row=id=>({order_id:String(id),order_number:'QVO-'+id,order_source:id===13?'online':'dine_in',order_status:'received',payment_status:'unpaid',preferred_payment_method:id===13?'GCash':'Cash',total_amount:'100.00',created_at:'2026-10-27 08:00:00',updated_at:'2026-10-27 08:00:00',items:[{item_name:'Latte',category:'coffee',quantity:2,unit_price:'50.00',customization:{},notes:''}]});
 const notices=new Map([[12,notice(12)],[13,notice(13,false)]]);
 const ctx=vm.createContext({console,Intl,Date,Map,Number,String,Array,Boolean,Math,JSON,Error,Promise,AbortSignal,
  document:{getElementById:el,querySelectorAll:()=>[]},window:{QUVO_CSRF:'mock',confirm(message){calls.confirm.push(message);return settings.confirm;}},
  state:{orders:[],receipts:[]},quvoPath:value=>value,escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
  openPreparationTickets:order=>calls.tickets.push(order),showToast(){},
  async fetch(url,options){
   if(options.method==='POST'){
    const body=JSON.parse(options.body);calls.payments.push(body);if(settings.failPayment){settings.failPayment=false;throw Error('Lost payment response');}
    return {ok:true,json:async()=>({ok:true,order:{...row(Number(body.id)),order_status:'preparing',payment_status:'paid',payment_method:body.payment_method,amount_received:body.amount_received,change_amount:'0.00'}})};
   }
   const id=Number(new URL(url,'http://test').searchParams.get('id'));calls.stock.push(id);
   if(settings.failStock)throw Error('Stock offline');
   const response={ok:true,json:async()=>({ok:true,stock_notice:structuredClone(notices.get(id))})};
   if(settings.hold){const saved=structuredClone(notices.get(id));return new Promise(resolve=>waiting.push(()=>resolve({ok:true,json:async()=>({ok:true,stock_notice:saved})})));}
   return response;
  }});
 vm.runInContext(source,ctx);const run=code=>vm.runInContext(code,ctx);
 ctx.rawRows=[row(12),row(13)];run('state.orders=rawRows.map(sqlMapOrder);loadSqlOrders=async()=>{};installSqlOrder=()=>{};');
 const open=id=>{run('openSqlPayment("sql'+id+'")');el('sqlAmountReceived').value='100.00';};
 const settle=async()=>{const task=run('sqlOrders.stockPromise');if(task)await task;};
 return {run,el,calls,settings,waiting,notices,open,settle,submit:()=>run('confirmSqlPayment({preventDefault(){}})')};
}
(async()=>{
 const f=fixture();f.open(12);check(!f.el('sqlPaymentStockNotice').hidden&&f.el('sqlPaymentStockNotice').innerHTML.includes('Checking'),'opening payment shows a loading state');await f.settle();
 check(f.calls.payments.length===0,'preview does not accept or pay an order');
 check(f.el('sqlPaymentStockNotice').innerHTML.includes('Latte &lt;unsafe&gt;')&&f.el('sqlPaymentStockNotice').innerHTML.includes('Milk &lt;unsafe&gt;')&&!f.el('sqlPaymentStockNotice').innerHTML.includes('<unsafe>'),'stock/menu names are safely escaped');
 check(f.el('sqlPaymentStockNotice').innerHTML.includes('out of stock')&&f.el('sqlPaymentStockNotice').innerHTML.includes('0.36 L needed'),'the notice explains the order shortage and quantity');
 check(f.el('sqlPaymentStockNotice').innerHTML.includes('You can still accept'),'notice clearly remains advisory');
 f.settings.confirm=false;await f.submit();check(f.calls.stock.length===2&&f.calls.confirm[0].includes('Stock notice:')&&f.calls.confirm[0].includes('Latte <unsafe>'),'final approval refreshes stock and includes the warning');
 check(f.calls.payments.length===0&&!f.run('sqlOrders.stockReview'),'cancelling confirmation leaves the order unpaid and restores controls');
 f.settings.confirm=true;await f.submit();check(f.calls.payments.length===1&&f.calls.tickets.length===1,'a stock warning allows acceptance and existing preparation tickets');
 const online=fixture();online.open(13);await online.settle();check(online.el('sqlPaymentStockNotice').hidden,'sufficient stock does not add a warning');
 await online.submit();check(online.calls.payments[0].payment_method==='GCash'&&online.calls.payments[0].amount_received==='100.00','online receipt approval retains its original payment method and amount');
 const offline=fixture();offline.settings.failStock=true;offline.open(12);await offline.settle();check(offline.el('sqlPaymentStockNotice').innerHTML.includes('Stock check unavailable'),'stock service errors are not presented as an out-of-stock fact');await offline.submit();
 check(offline.calls.payments.length===1&&offline.calls.confirm[0].includes('Stock check unavailable'),'stock-check failure does not block accepting an order');
 const retry=fixture();retry.open(12);await retry.settle();retry.settings.failPayment=true;await retry.submit();const before=retry.calls.stock.length;retry.el('sqlAmountReceived').value='999.00';await retry.submit();
 check(JSON.stringify(retry.calls.payments[0])===JSON.stringify(retry.calls.payments[1]),'lost payment responses retry the exact saved payload');
 check(retry.calls.stock.length===before,'payment retries do not reinterpret stock after a potentially accepted deduction');
 const double=fixture();double.settings.hold=true;double.open(12);const first=double.submit();await double.submit();check(double.calls.stock.length===1&&double.calls.payments.length===0,'double submit coalesces an in-flight check and sends no early payment');
 double.settings.hold=false;double.waiting.shift()();await first;check(double.calls.payments.length===1,'a completed stock review accepts only once');
 const stale=fixture();stale.settings.hold=true;stale.open(12);stale.run('closeSqlPayment()');stale.settings.hold=false;stale.open(13);await stale.settle();stale.waiting.shift()();await new Promise(resolve=>setImmediate(resolve));
 check(stale.run('sqlOrders.paymentOrder.sqlId')==='13'&&stale.el('sqlPaymentStockNotice').hidden,'late warnings cannot leak into a different order popup');
 const reopen=fixture();reopen.settings.hold=true;reopen.open(12);const oldSubmit=reopen.submit();reopen.run('closeSqlPayment()');reopen.settings.hold=false;reopen.open(12);await reopen.settle();reopen.waiting.shift()();await oldSubmit;
 check(reopen.calls.confirm.length===0&&reopen.calls.payments.length===0&&!reopen.run('sqlOrders.stockReview'),'closing and reopening the same order invalidates the earlier confirmation task');
 const short=fixture();short.open(12);await short.settle();short.el('sqlAmountReceived').value='10.00';const reads=short.calls.stock.length;await short.submit();
 check(short.calls.payments.length===0&&short.calls.stock.length===reads&&short.el('sqlPaymentError').textContent.includes('full amount'),'existing partial-payment validation remains intact');
 const manual=fixture();manual.notices.set(12,{...notice(12,false),hasWarnings:true,unavailableItems:[{name:'Cake',quantity:1}]});manual.open(12);await manual.settle();
 check(manual.el('sqlPaymentStockNotice').innerHTML.includes('Cake')&&manual.el('sqlPaymentStockNotice').innerHTML.includes('marked unavailable'),'manually unavailable items are explained without a recipe shortage');
 console.log(checks+' order stock notice behavior checks passed. No SQL or network access.');
})().catch(error=>{console.error(error);process.exitCode=1;});
