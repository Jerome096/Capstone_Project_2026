// Run with node tests/order-screens.cjs. Mock requests never reach SQL Server.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const escape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const elements = new Map();
function el(id) {
  if (!elements.has(id)) elements.set(id, {value:"", textContent:"", innerHTML:"", hidden:false, disabled:false,
    parentElement:{}, classList:{add(){},remove(){}},addEventListener(){},removeAttribute(){},showModal(){this.open=true;}});
  return elements.get(id);
}
const row = {
  order_id:"12",order_number:"QVO-12",session_id:"8",customer_name:"<Guest>",table_name:"Table 1",
  total_amount:"30.50",order_status:"received",payment_status:"unpaid",created_at:"2026-10-09 12:00:00",updated_at:"2026-10-09 12:00:00",
  items:[{menu_item_id:"1",item_name:"<Coffee>",category:"coffee",unit_price:"15.25",quantity:2,line_total:"30.50",customization:{sugarLevel:"50%",iceLevel:"Less ice"},notes:"<note>"}],
};
let current = structuredClone(row), requests = [], fail = false, staffRole = "admin";
const context = vm.createContext({
  console, Intl, Date, Map, Number, String, Array, Boolean, Math, JSON, Error, AbortSignal,
  structuredClone, crypto:require("node:crypto").webcrypto, Uint8Array,
  document:{getElementById:el,querySelectorAll:()=>[]},
  window:{confirm:()=>true,prompt:()=>"Customer requested cancellation",QUVO_CSRF:"test"},QUVO_AUTH:{getSession:()=>({role:staffRole})},
  state:{orders:[],receipts:[],accessMode:"dineIn",sessionApproved:true,cart:[]},
  quvoPath:p=>p, escapeHtml:escape,escapeCustomerHtml:escape,
  renderOrders(){},renderReceipts(){},renderStats(){},renderCart(){},renderTracking(){},showToast(){},showScreen(){},
  lucide:{createIcons(){}},setInterval(){},
  isOrderPaymentConfirmed:order=>order.paid===true||order.paymentStatus==='confirmed',
  getBeverageItems:order=>order.items.filter(item=>['coffee','non-coffee'].includes(item.category)),
  getFoodItems:order=>order.items.filter(item=>!['coffee','non-coffee'].includes(item.category)),
  guestTableCode:"1",guestCsrf:"guest",formatCurrency:n=>Number(n).toFixed(2),
  sessionStorage:{store:new Map(),setItem(k,v){this.store.set(k,v)},getItem(k){return this.store.get(k)||null},removeItem(k){this.store.delete(k)}},
  localStorage:{store:new Map(),setItem(k,v){this.store.set(k,v)},getItem(k){return this.store.get(k)||null},removeItem(k){this.store.delete(k)}},
  async fetch(url,options) {
    if (options.method === "POST") {
      const body=JSON.parse(options.body); requests.push(body);
      if (fail) {fail=false; throw new Error("Lost response");}
      if(body.action==="pay") current={...current,order_status:"preparing",payment_status:"paid",payment_method:body.payment_method,amount_received:body.amount_received,change_amount:"19.50",paid_at:"2026-10-09 12:01:00"};
      if(body.action==="status") current={...current,order_status:body.status};
      if(body.action==="cancel") current={...current,order_status:"cancelled",payment_status:"not_due",cancellation_reason:body.reason};
      return {ok:true,json:async()=>({ok:true,order:structuredClone(current)})};
    }
    if (url.includes("id=")) return {ok:true,json:async()=>({ok:true,order:structuredClone(current)})};
    return {ok:true,json:async()=>({ok:true,orders:url.includes("status=open") && ["served","cancelled"].includes(current.order_status)?[]:[structuredClone(current)],next_offset:null})};
  }
});
const run = s => vm.runInContext(s,context);
run(read("Quvo_Cafe_Capstone/cashier/orders/sql-orders.js"));
run(read("Quvo_Cafe_Capstone/cashier/orders/preparation-tickets.js"));
run(read("Quvo_Cafe_Capstone/cashier/receipts/receipts.js"));
run(read("Quvo_Cafe_Customer_Branded(3)/orders/dine-in-orders.js"));
(async()=>{
  await run("loadSqlOrders()");
  assert.equal(run("state.orders[0].number"),"QVO-12");
  assert.match(run('sqlFoodReadyMarkup({...state.orders[0],paid:true,stage:"preparing",items:[{category:"food"}],raw:{kitchen_ready_at:"2026-10-13 12:00:00"}})'),/Food ready/,'mixed order displays kitchen readiness before the full order is ready');
  assert.equal(run('sqlFoodReadyMarkup({...state.orders[0],paid:true,stage:"preparing",items:[{category:"food"}],raw:{}})'),'', 'preparing food has no premature ready badge');
  assert.equal(run('sqlFoodReadyMarkup({...state.orders[0],paid:true,stage:"ready",items:[{category:"coffee"}],raw:{}})'),'', 'drink-only order has no food badge');
  assert.match(run('sqlFoodReadyMarkup({...state.orders[0],paid:true,stage:"ready",items:[{category:"food"}],raw:{}})'),/Food ready/,'cashier ready action also indicates food readiness');
  assert.match(run("renderSqlOrderCard(state.orders[0])"), /&lt;Coffee&gt;/);
  assert.match(run("renderSqlOrderCard(state.orders[0])"), /Collect payment/);
  assert.doesNotMatch(run("renderSqlOrderCard(state.orders[0])"), /View customer details/);
  run("sqlOrders.known.set('91', {...sqlOrders.known.get('12'), order_id:'91', order_source:'online', contact_snapshot:'09123456789', fulfillment_type:'delivery', address_snapshot:'<Address>', preferred_payment_method:'GCash'})");
  assert.match(run("renderSqlOrderCard(sqlMapOrder(sqlOrders.known.get('91')))"), /View customer details/);
  run("openOnlineOrderDetails('91')");
  assert.equal(el("onlineOrderDetailsModal").open,true);
  assert.match(el("onlineOrderCustomerDetails").innerHTML,/09123456789/);
  assert.match(el("onlineOrderCustomerDetails").innerHTML,/&lt;Address&gt;/);
  assert.doesNotMatch(el("onlineOrderCustomerDetails").innerHTML,/Payment status|Payment reference/);
  assert.equal(requests.length,0,"viewing customer details must not confirm payment");
  run("state.orders.push(sqlMapOrder(sqlOrders.known.get('91')));openSqlPayment('sql91')");
  assert.match(run("renderSqlOrderCard(state.orders.find(order=>order.sqlId==='91'))"),/Approve payment/);
  assert.match(run("renderSqlOrderCard(state.orders.find(order=>order.sqlId==='91'))"),/GCash · Awaiting cashier approval/);
  assert.match(el('sqlPaymentTitle').textContent,/Approve payment/);
  assert.equal(el('sqlOnlinePaymentMethod').textContent,'GCash');
  assert.equal(el('sqlPaymentMethod').hidden,true);
  assert.equal(el('sqlReferenceFields').hidden,true);
  assert.equal(el('sqlPaymentConfirm').textContent,'Approve payment');
  run("closeSqlPayment();state.orders=state.orders.filter(order=>order.sqlId!=='91')");
  staffRole="staff";
  assert.match(run("renderSqlOrderCard(state.orders[0])"), /Cancel order/, "cashier can cancel an unpaid order");
  staffRole="barista";
  assert.doesNotMatch(run("renderSqlOrderCard(state.orders[0])"), /Cancel order/, "other roles cannot cancel");
  staffRole="staff";
  run("openSqlPayment('sql12')");
  el("sqlAmountReceived").value="20";
  await run("confirmSqlPayment({preventDefault(){}})");
  assert.equal(requests.length,0,"partial payment must not be sent");
  el("sqlAmountReceived").value="50";
  fail=true;
  await run("confirmSqlPayment({preventDefault(){}})");
  assert.equal(run("Boolean(sqlOrders.paymentAttempt)"),true);
  await run("confirmSqlPayment({preventDefault(){}})");
  assert.deepEqual(requests[0],requests[1],"lost payment response retries identical payload");
  assert.equal(run("state.orders[0].stage"),"preparing");
  assert.equal(el('preparationTicketsModal').open,true,'payment success offers preparation printing');
  assert.match(el('preparationTicketsPreview').innerHTML,/DRINKS TICKET/);
  assert.doesNotMatch(el('preparationTicketsPreview').innerHTML,/KITCHEN TICKET/);
  assert.doesNotMatch(run("renderSqlOrderCard(state.orders[0])"), /Cancel order/, "paid orders have no cancellation action");
  assert.match(run("renderSqlReceipt(state.receipts[0])"),/19.50/);
  await run("changeSqlOrderStatus('12','ready')");
  assert.equal(run("state.orders[0].stage"),"ready");
  await run("changeSqlOrderStatus('12','served')");
  assert.equal(run("state.orders.length"),0);
  assert.equal(run("state.receipts[0].status"),"served");
  current=structuredClone(row);
  await run("loadSqlOrders()");
  await run("cancelSqlOrder('12')");
  assert.equal(requests.at(-1).action,"cancel");
  assert.equal(requests.at(-1).reason,"Customer requested cancellation");
  assert.equal(run("state.orders.length"),0,"cancelled order leaves the active queue");
  assert.equal(run("sqlOrders.known.get('12').order_status"),"cancelled","cancelled history is retained");
  current=structuredClone(row);
  requests=[];
  run('restoreDinePending("8"); state.cart=[{itemId:"1",name:"Coffee",quantity:2,unitPrice:15.25,customization:{sugarLevel:"50%",iceLevel:"Less ice",notes:""}}]');
  assert.equal(run("dineMoneyTotal()"),"30.50");
  fail=true;
  await run("submitDineOrder()");
  assert.equal(run("Boolean(dineOrders.pending)"),true);
  assert.equal(run("state.cart.length"),1,"failed submission retains cart");
  context.sessionStorage.store.clear();
  run('dineOrders.sessionId=""; dineOrders.pending=null; state.cart=[]; restoreDinePending("8")');
  assert.equal(run("state.cart.length"),1,"reload recovers pending cart");
  await run("submitDineOrder()");
  assert.deepEqual(requests[0],requests[1],"reload retry uses same submission key");
  assert.equal(run("state.cart.length"),0);
  assert.equal(run("state.order.order_number"),"QVO-12");
  assert.equal(run("dineOrders.pending"),null);
  console.log("PASS: saved queue, escaped text, partial-payment guard, payment retry, receipt change, ready/served progression, exact cart total, pending-order reload and retry.");
})().catch(error=>{console.error(error);process.exitCode=1});
