// Exercise the real POS payment and cashier action functions without database writes.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {value:"", textContent:"0", innerHTML:"", disabled:false,
    classList:{add(){},remove(){},toggle(){}},addEventListener(){}});
  return elements.get(id);
}
const sqlOrder = {id:"sql37",persisted:true,stage:"received",source:"qr"};
const context = vm.createContext({
  console, Intl, Date, Math, Number, String,
  state:{orders:[sqlOrder,{id:4,source:"manual"},{id:NaN,source:"manual"}],receipts:[],activities:[],menu:[],posCart:[]},
  selectedPaymentMethod:null,pendingPaymentReview:null,lastReceiptId:null,
  document:{getElementById:element,querySelectorAll:()=>[]},lucide:{createIcons(){}},
  isDigitalPayment:method=>method!=="Cash",deductInventoryForOrder:()=>[],
  addSystemRecord(){},renderAll(){},showToast(){},escapeHtml:String,normalizeName:String,
  getOrderSourceLabel:source=>source,getPaymentReferenceLabel:method=>method,
  changeSqlOrderStatus(){throw Error("POS must not mutate SQL orders");},
});
const run = text => vm.runInContext(text,context);
for (const file of ["cashier/menu/menu.js","cashier/orders/orders.js","cashier/receipts/receipts.js"]) {
  run(fs.readFileSync(path.join(__dirname,"..",file),"utf8"));
}
for (const [method,expectedId] of [["Cash",5],["GCash",6]]) {
  element("amountReceived").value="200";
  element("counterCustomerName").value="POS check";
  run(`state.posCart=[{name:"Coffee",category:"coffee",qty:1,price:150,customizations:[]}]; selectedPaymentMethod=${JSON.stringify(method)}; confirmPaidOrder();`);
  assert.equal(run("pendingPaymentReview.nextId"),expectedId,"POS IDs ignore SQL and invalid IDs");
  assert.equal(run("pendingPaymentReview.orderNumber"),`#${String(expectedId).padStart(3,"0")}`);
  run("confirmPaymentReview()");
  assert.equal(run("state.orders[0].stage"),"preparing");
  assert.equal(run("isOrderPaymentConfirmed(state.orders[0])"),true);
  const markup = run("renderOrderActions(state.orders[0])");
  const click = markup.match(/onclick="([^"]+)"/)[1];
  run(click);
  assert.equal(run("state.orders[0].stage"),"ready","actual cashier button advances POS order");
  assert.match(run("renderOrderActions(state.orders[0])"),/Mark served/);
  const readyOrder = run("state.orders[0]");
  run(`markServed(${expectedId})`);
  assert.equal(run(`state.orders.some(order=>order.id===${expectedId})`),false);
  assert.equal(run("state.receipts.at(-1).status"),"served");
  // Retain the prior ID to check sequencing with several POS orders in the queue.
  context.state.orders.push(readyOrder);
}
assert.equal(sqlOrder.stage,"received","SQL dine-in order remains untouched");
run('state.orders.unshift({id:20,stage:"preparing",paid:false,paymentStatus:"pending"});markReady(20)');
assert.equal(run("state.orders[0].stage"),"preparing","unpaid order cannot become ready");
console.log("PASS: mixed SQL/POS queue, numeric POS IDs, cash/digital checkout, actual Mark ready button, served receipt, and unpaid guard.");
