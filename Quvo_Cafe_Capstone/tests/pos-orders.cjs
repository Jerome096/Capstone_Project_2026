// Real POS review and SQL mapping with deterministic HTTP failures.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const storage=new Map(), requests=[];
const cart=[{menuId:7,name:'Coffee',category:'coffee',qty:1,price:150,customizations:['Regular'],drinkOptions:{size:'Regular',sugar:'50% sugar',ice:'Regular ice'},note:'No straw'}];
let mode='lost',deductions=0,prints=0;
const row={order_id:91,order_number:'QVO-10091',order_source:'walk_in',table_name:'Counter',customer_name:'POS check',total_amount:'150.00',order_status:'preparing',payment_status:'paid',payment_method:'Cash',amount_received:'200.00',change_amount:'50.00',created_at:'2026-10-13 12:00:00',paid_at:'2026-10-13 12:00:00',receipt_date:'2026-10-13',items:[{item_name:'Coffee',category:'coffee',quantity:1,unit_price:'150.00',customization:{size:'Regular',sugarLevel:'50%',iceLevel:'Regular ice'},notes:'No straw'}]};
function workspace(staff=17){
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,hidden:false,classList:{add(){},remove(){},toggle(){}},addEventListener(){}});return elements.get(id);};
 const context=vm.createContext({console,Intl,Date,Math,Number,String,crypto:require('node:crypto').webcrypto,Uint8Array,structuredClone,AbortSignal,
 window:{QUVO_SESSION:{staff_id:staff},QUVO_CSRF:'csrf',QUVO_CONFIG:{allowedScreens:['menu']}},QUVO_AUTH:{getSession:()=>({staff_id:staff})},
 state:{menu:[{id:7,category:'coffee'}],orders:[],receipts:[],posCart:[]},selectedPaymentMethod:null,pendingPaymentReview:null,
 document:{getElementById:element,querySelectorAll:()=>[]},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
 lucide:{createIcons(){}},escapeHtml:String,getPaymentReferenceLabel:()=>'',quvoPath:value=>value,
 deductInventoryForOrder(){deductions++;},showToast(){},loadMenuItems(){},openPreparationTickets(){prints++;},
 async fetch(url,options){assert.equal(url,'api/pos/index.php');assert.equal(options.headers['X-CSRF-Token'],'csrf');requests.push(JSON.parse(options.body));if(mode==='lost')throw new Error('Connection lost after commit');if(mode==='invalid')return {ok:false,status:422,json:async()=>({ok:false,error:'Invalid cart'})};return {ok:true,status:200,json:async()=>({ok:true,order:structuredClone(row),replayed:mode==='retry'})};}
 });
 const run=code=>vm.runInContext(code,context);
 for(const file of ['cashier/menu/menu.js','cashier/menu/pos-sql.js','cashier/orders/sql-orders.js','cashier/receipts/receipts.js'])run(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
 run('sqlRender=()=>{};sqlUpdateReceipts=()=>{};renderCart=()=>{};posSql.paymentMethods.set("GCash","GCash");');return {context,element,run};
}
(async()=>{
 let app=workspace();app.context.state.posCart=structuredClone(cart);app.element('amountReceived').value='200';app.element('counterCustomerName').value='POS check';
 app.run('selectedPaymentMethod="Cash";confirmPaidOrder()');assert.equal(app.run('pendingPaymentReview.orderNumber'),'New walk-in order');assert.equal(app.context.state.orders.length,0);
 await app.run('confirmPaymentReview()');assert.equal(app.run('posCartLocked()'),true);assert.equal(app.context.state.posCart.length,1);assert.equal(storage.size,1);assert.equal(prints,0);
 const original=requests[0];assert.equal(original.items[0].menu_id,7);assert.equal(original.amount_received,'200');
 app=workspace();app.run('bindPosSql()');assert.equal(app.context.state.posCart.length,1);app.run('clearCart()');assert.equal(app.context.state.posCart.length,1);
 mode='retry';app.run('openPosPendingReview()');await app.run('confirmPaymentReview()');assert.deepEqual(requests[1],original);
 assert.equal(app.context.state.orders[0].id,'sql91');assert.equal(app.context.state.orders[0].persisted,true);assert.equal(app.context.state.orders[0].stage,'preparing');assert.equal(app.context.state.orders[0].source,'manual');assert.match(app.context.state.orders[0].items[0].note,/Regular.*50%.*No straw/);assert.equal(app.context.state.posCart.length,0);assert.equal(storage.size,0);assert.equal(deductions,0);assert.equal(prints,1);
 app.context.state.posCart=structuredClone(cart);app.element('amountReceived').value='200';app.run('selectedPaymentMethod="Cash";confirmPaidOrder()');mode='invalid';await app.run('confirmPaymentReview()');assert.equal(app.run('posCartLocked()'),false);assert.equal(app.context.state.posCart.length,1);assert.match(app.element('posSqlError').textContent,/correct the cart/);
 app.run('selectedPaymentMethod="GCash";confirmPaidOrder()');mode='success';await app.run('confirmPaymentReview()');assert.equal(requests.at(-1).payment_method,'GCash');assert.equal(requests.at(-1).amount_received,'150.00');assert.equal(deductions,0,'SQL owns stock deduction; browser does not deduct again');assert.equal(prints,2);
 storage.set('quvo_pos_sql_pending_v1_17',JSON.stringify({staffId:'17',payload:original,review:{},cart}));const other=workspace(18);other.run('bindPosSql()');assert.equal(other.run('posSql.pending'),null);
 console.log('PASS: SQL POS checkout, cash/digital payloads, lost-response recovery after reload, identical retries, cart locking, validation correction, printing prompt and cashier isolation.');
})().catch(error=>{console.error(error);process.exitCode=1});
