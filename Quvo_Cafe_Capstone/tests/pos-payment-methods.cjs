const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map(),requests=[],deferred=[];let fail=false,delay=false,methods=[{code:'Cash',label:'Cash'},{code:'GCash',label:'GCash'},{code:'PM12345678',label:'SeaBank <test>'}];
const el=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,setAttribute(){},addEventListener(){},classList:{add:key=>classes.add(key),remove:key=>classes.delete(key),contains:key=>classes.has(key),toggle(key,value){if(value)classes.add(key);else classes.delete(key);}}});}return nodes.get(id);};
const ctx=vm.createContext({console,Intl,Date,Map,Math,Number,String,Array,Boolean,Promise,AbortSignal,structuredClone,Uint8Array,crypto:require('node:crypto').webcrypto,
 document:{getElementById:el,querySelectorAll:()=>[]},window:{QUVO_SESSION:{staff_id:1}},QUVO_AUTH:{getSession:()=>({staff_id:1})},
 lucide:{createIcons(){}},escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),quvoPath:value=>value,showToast(){},sqlOrders:{revision:0},
 async fetch(url,options){requests.push({url,options});assert.equal(url,'api/pos/index.php?view=payment-methods');if(fail)throw Error('Methods offline');const saved=structuredClone(methods),response={ok:true,json:async()=>({ok:true,methods:saved})};if(delay){delay=false;return new Promise(resolve=>deferred.push(()=>resolve(response)));}return response;}});
const run=code=>vm.runInContext(code,ctx);for(const file of ['shared/js/state.js','cashier/menu/menu.js','cashier/menu/pos-sql.js','cashier/receipts/receipts.js'])run(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
run('state.menu=[{id:1,category:"food"}];state.posCart=[{menuId:1,cartId:"one",name:"Egg",qty:1,price:100,customizations:[],drinkOptions:null,note:""}];');let checks=0;
const check=(ok,label)=>{assert.ok(ok,label);checks++;};
(async()=>{
 await run('loadPosPaymentMethods()');
 check(run('posSql.paymentMethods.get("PM12345678")')==='SeaBank <test>','POS loads the configured method name');
 check(el('posPaymentMethods').innerHTML.includes('SeaBank &lt;test&gt;')&&!el('posPaymentMethods').innerHTML.includes('<test>'),'payment button labels are safely escaped');
 check(!/<img|qr_version|image=/.test(el('posPaymentMethods').innerHTML),'POS renders names and icons without QR images');
 run('selectPosPaymentMethod("PM12345678")');
 check(run('selectedPaymentMethod')==='PM12345678'&&!el('confirmPaidBtn').disabled,'new custom method can be selected for the cart');
 check(el('checkoutCashBlock').classList.contains('hidden')&&el('checkoutChangeLine').classList.contains('hidden'),'custom digital methods do not show cash change controls');
 check(el('paymentReferenceLabel').textContent==='SeaBank <test> reference no. optional','reference field uses the human method name');
 el('paymentReference').value='SB-001';run('startSqlPosReview()');
 check(run('pendingPaymentReview.payload.payment_method')==='PM12345678'&&run('pendingPaymentReview.paymentMethodLabel')==='SeaBank <test>','review keeps server code separate from the visible label');
 check(run('pendingPaymentReview.payload.amount_received')==='100.00'&&run('pendingPaymentReview.payload.payment_reference')==='SB-001','digital review sends the exact total and optional reference');
 check(el('paymentReviewContent').innerHTML.includes('SeaBank &lt;test&gt;')&&!el('paymentReviewContent').innerHTML.includes('<test>'),'review displays the configured label without HTML injection');
 run('closePaymentReviewModal();selectPosPaymentMethod("Cash")');el('amountReceived').value='150';run('validateCheckout()');
 check(!el('checkoutCashBlock').classList.contains('hidden')&&!el('confirmPaidBtn').disabled,'Cash remains available with the normal amount field');
 run('startSqlPosReview()');check(run('pendingPaymentReview.change')===50&&run('pendingPaymentReview.payload.payment_reference')==='','cash change and empty digital reference remain correct');
 run('closePaymentReviewModal();selectPosPaymentMethod("PM12345678")');methods=[{code:'Cash',label:'Cash'}];await run('loadPosPaymentMethods()');
 check(run('selectedPaymentMethod')===null&&el('confirmPaidBtn').disabled,'removing a selected method requires choosing an available method again');
 check(!el('posPaymentMethods').innerHTML.includes('PM12345678'),'removed methods disappear on refresh');
 fail=true;await run('loadPosPaymentMethods()');check(run('posSql.paymentMethods.size')===1&&el('posPaymentMethodsStatus').textContent.includes('Cash is available')&&!el('posPaymentMethodsRetry').hidden,'failed method loading provides Cash plus a retry action');
 run('selectPosPaymentMethod("Cash")');check(!el('confirmPaidBtn').disabled,'Cash checkout works while method loading is unavailable');
 fail=false;methods=[{code:'Cash',label:'Cash'},{code:'PM87654321',label:'Debit / Credit Card'}];await run('loadPosPaymentMethods()');
 check(run('posSql.paymentMethods.get("PM87654321")')==='Debit / Credit Card'&&el('posPaymentMethodsRetry').hidden,'refresh recovers and loads newly configured choices');
 run('selectPosPaymentMethod("PM87654321")');delay=true;const pending=run('loadPosPaymentMethods()');
 check(el('confirmPaidBtn').disabled,'digital confirmation waits while available methods refresh');
 run('selectPosPaymentMethod("Cash")');check(!el('confirmPaidBtn').disabled,'Cash can still be selected during a method refresh');deferred.shift()();await pending;
 methods=[{code:'Cash',label:'Cash'},{code:'PM11111111',label:'Old list'}];delay=true;const old=run('loadPosPaymentMethods()');
 methods=[{code:'Cash',label:'Cash'},{code:'PM22222222',label:'Latest list'}];await run('loadPosPaymentMethods()');deferred.shift()();await old;
 check(run('posSql.paymentMethods.has("PM22222222")&&!posSql.paymentMethods.has("PM11111111")'),'late responses cannot overwrite a newer method list');
 run('selectedPaymentMethod="Forged";validateCheckout()');check(el('confirmPaidBtn').disabled,'an unconfigured method cannot enable checkout');
 check(run('isDigitalPayment("SeaBank")&&!isDigitalPayment("Cash")&&getPaymentReferenceLabel("SeaBank")==="SeaBank reference"'),'shared payment helpers support additional method names');
 check(requests.every(request=>!request.url.includes('payment-qr')&&!request.url.includes('image=')),'loading POS choices never requests a QR endpoint');
 console.log(checks+' POS payment-method behavior checks passed. No network or SQL access.');
})().catch(error=>{console.error(error);process.exitCode=1;});
