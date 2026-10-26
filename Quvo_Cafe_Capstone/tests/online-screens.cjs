// Verify a lost checkout response survives reload and retries the same server submission.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../Quvo_Cafe_Online_Ordering');
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{value:'',textContent:'',classList:{toggle(){},remove(){}},addEventListener(){}});return elements.get(id);}
const fulfillment=[{value:'Pickup',checked:false},{value:'Staff-coordinated delivery request',checked:true}];
const payment=[{value:'GCash',checked:true}];
const store=new Map(),durable=new Map(),saved=new Map(),requests=[];
let loseResponse=true;
const ctx=vm.createContext({console,AbortSignal,Error,Number,Math,JSON,Array,Date,String,Uint8Array,structuredClone,
  crypto:require('node:crypto').webcrypto,
  state:{onlineCustomer:{id:'7',name:'Customer'},cart:[{itemId:'1',quantity:1,unitPrice:150,customization:{}}],onlineOrders:[]},
  CUSTOMER_DATA:{},document:{getElementById:el,querySelector(selector){return selector.includes('fulfillmentOption')?fulfillment.find(x=>x.checked):payment.find(x=>x.checked);},querySelectorAll(selector){return selector.includes('fulfillmentOption')?fulfillment:selector.includes('paymentMethod')?payment:[];}},
  sessionStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},
  localStorage:{getItem:key=>durable.get(key)||null,setItem:(key,value)=>durable.set(key,value),removeItem:key=>durable.delete(key)},
  renderCart(){},renderHistory(){},renderTracking(){},showToast(){},showScreen(screen){ctx.state.currentScreen=screen;},
  getCartSubtotal:()=>ctx.state.cart.reduce((sum,item)=>sum+item.unitPrice*item.quantity,0),
  async fetch(url,options){
    const body=JSON.parse(options.body);requests.push(body);
    if(!saved.has(body.submission_key))saved.set(body.submission_key,{order_id:'40',order_number:'QVO-40',order_status:'received',payment_status:'unpaid',items:[]});
    if(loseResponse){loseResponse=false;throw new Error('Response lost after SQL commit');}
    return {ok:true,json:async()=>({ok:true,order:saved.get(body.submission_key)})};
  }
});
ctx.window=ctx;
const run=source=>vm.runInContext(source,ctx);
for(const file of ['shared/storage.js','checkout/checkout.js','checkout/payment.js'])run(fs.readFileSync(path.join(root,file),'utf8'));
(async()=>{
  el('deliveryAddress').value='Delivery address';el('deliveryContact').value='09123456789';
  await run('submitOrder()');assert.equal(requests.length,0,'no QR blocks submission');
  run("checkoutPayment.methods={GCash:{available:true,version:'11111111-1111-4111-8111-111111111111'}};checkoutPayment.qrLoaded=true");
  await run('submitOrder()');assert.equal(requests.length,0,'no receipt blocks submission');
  run("checkoutPayment.receipt='data:image/png;base64,test-image';checkoutPayment.receiptCents=15000");
  await run('submitOrder()');
  assert.equal(saved.size,1);assert.equal(run('state.cart.length'),1);assert.equal(run('onlineCartLocked()'),true);
  assert.equal(run('online.pending.payload.fulfillment'),'delivery');
  assert.equal(durable.size,1,'unconfirmed submission is durable before the request is sent');
  store.clear(); // A browser restart may discard all tab-scoped session storage.
  run('online.pending=null;state.cart=[]');fulfillment[0].checked=true;fulfillment[1].checked=false;
  run('restoreOnlinePending()');
  assert.equal(run('state.cart.length'),1);assert.equal(fulfillment[1].checked,true,'retry restores the actual delivery selection');
  await run('submitOrder()');
  assert.deepEqual(requests[0],requests[1]);assert.equal(saved.size,1,'retry never creates another order');
  assert.equal(run('state.currentScreen'),'screenTracking');assert.equal(run('state.cart.length'),0);assert.equal(run('online.pending'),null);
  assert.equal(store.size,0,'accepted retry clears pending storage');
  assert.equal(durable.size,0,'accepted retry clears durable pending storage');
  ctx.state.onlineCustomer={id:'8'};run('restoreOnlinePending()');assert.equal(run('online.pending'),null,'different accounts do not inherit pending orders');
  console.log('PASS: lost checkout response, reload recovery, fulfillment selection, identical retry, one saved order, and account-scoped pending storage.');
})().catch(error=>{console.error(error);process.exitCode=1});
