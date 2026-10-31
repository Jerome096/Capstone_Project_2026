// SQL is authoritative for accepted orders. Account-scoped browser storage keeps
// cart drafts and the original unconfirmed submission across refresh/restart.
const online = {csrf:"",revision:0,busy:false,pending:null,generation:0,poll:null,loading:false,nextOffset:null,historyLoaded:false,selectedId:null,activeOrders:[],historyDetailId:null,error:""};
async function onlineApi(input=null,query="session") {
  const token=online.csrf;
  const response=await fetch("api/index.php?view="+query,{
    method:input?"POST":"GET",credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json","X-CSRF-Token":token},
    signal:AbortSignal.timeout(['register','register-resend'].includes(input?.action)?45000:15000),...(input?{body:JSON.stringify(input)}:{})
  });
  let result;
  try {result=await response.json();} catch {throw new Error("Could not contact online ordering. Open this page through the PHP server.");}
  if(result.csrf && online.csrf===token) online.csrf=result.csrf;
  if(!response.ok||!result.ok) {
    const error=new Error(result.error||"Request failed. Please try again.");error.status=response.status;error.code=result.code;throw error;
  }
  return result;
}
function onlinePendingKey(customerId=state.onlineCustomer.id){return "quvo_online_pending_sql_v1_"+customerId;}
function saveOnlinePending(value,customerId=state.onlineCustomer.id){
  const key=onlinePendingKey(customerId);
  if(value) {
    // Save before sending to SQL. If this fails, no order is submitted with an
    // unrecoverable key that could be duplicated after a browser crash.
    try {localStorage.setItem(key,JSON.stringify(value));}
    catch {throw new Error("Your browser could not save this order for recovery. Enable browser storage or free some space, then retry.");}
  } else localStorage.removeItem(key);
  try {sessionStorage.removeItem(key);}catch{}
  if(String(state.onlineCustomer?.id)===String(customerId))online.pending=value;
}
function restoreOnlinePending(){
  online.pending=null;
  try {
    const key=onlinePendingKey();
    let durable=null,legacy=null;
    try {durable=localStorage.getItem(key);}catch{}
    if(!durable)try {legacy=sessionStorage.getItem(key);}catch{}
    const saved=JSON.parse(durable||legacy||"null");
    if(saved && String(saved.customerId)===String(state.onlineCustomer.id) && saved.payload && Array.isArray(saved.cart)) {
      online.pending=saved;
      if(legacy)try {localStorage.setItem(key,legacy);sessionStorage.removeItem(key);}catch{}
    }
  }catch{}
  state.cart=online.pending?online.pending.cart:(window.QuvoOnlineCart?.restore()||[]);
  if(online.pending){
    const payload=online.pending.payload;
    document.querySelectorAll('input[name="fulfillmentOption"]').forEach(input=>input.checked=(input.value==="Pickup") === (payload.fulfillment==="pickup"));
    document.querySelectorAll('input[name="paymentMethod"]').forEach(input=>input.checked=input.value===payload.payment_method);
    document.getElementById("deliveryAddress").value=payload.address||"";
    document.getElementById("deliveryContact").value=payload.contact||"";
  }
}
function onlineCartLocked(){return online.busy||Boolean(online.pending);}
function onlineSelectedOrderKey(){return 'quvo_online_tracking_v1_'+state.onlineCustomer.id;}
function rememberOnlineOrder(id){
  online.selectedId=id===null?null:String(id);
  if(!state.onlineCustomer)return;
  try{if(online.selectedId)localStorage.setItem(onlineSelectedOrderKey(),online.selectedId);else localStorage.removeItem(onlineSelectedOrderKey());}catch{}
}
function restoreOnlineSelectedOrder(){
  online.selectedId=null;
  try{const id=localStorage.getItem(onlineSelectedOrderKey());if(/^[1-9][0-9]{0,18}$/.test(id||''))online.selectedId=id;}catch{}
}
function resetOnlineView(target='screenHome'){
  window.QuvoReadyAlerts?.reset();
  window.QuvoStorefront?.cancelSelection();
  window.QuvoDelivery?.clear();
  checkoutPayment.request++;checkoutPayment.methods={};checkoutPayment.loading=false;checkoutPayment.qrLoaded=false;clearOnlinePaymentReceipt();renderOnlinePaymentOptions();
  online.generation++;clearTimeout(online.poll);online.poll=null;online.pending=null;online.selectedId=null;online.activeOrders=[];online.historyDetailId=null;online.error="";online.nextOffset=null;online.historyLoaded=false;
  state.onlineCustomer=null;state.customerName="";state.order=null;state.onlineOrders=[];state.cart=[];
  state.selectedCategory="All";state.searchTerm="";document.getElementById('menuSearch').value='';
  closeItemModal();renderCategories();renderMenu();renderCart();renderHistory();renderTracking();
  document.getElementById('onlineAuthDialog')?.close();
  showScreen(target);
}
async function enterOnlineAccount(account){
  registerForm.reset();setRegistrationPending(null);
  online.generation++;state.onlineCustomer=account;state.customerName=account.name;
  restoreOnlineSelectedOrder();
  restoreOnlinePending();await window.QuvoPendingProofs?.restore();configureMenuHeader();renderAccount();prefillDeliveryDetails(true);renderCart();
  showScreen("screenMenu");
  await Promise.all([refreshOnlineMenu().catch(error=>showToast(error.message)),refreshOnlineOrders(),refreshOnlinePayment()]);
  const selectionHandled=await window.QuvoStorefront?.finishSignIn();
  startOrderStatusWatch();
  return selectionHandled;
}
async function refreshOnlineMenu(reviewCart=false){
  const generation=online.generation;
  const data=await onlineApi(null,"menu");if(generation!==online.generation)return;
  CUSTOMER_DATA.menuItems=data.items;
  const usedCategories=new Set(data.items.map(item=>item.category));
  CUSTOMER_DATA.categories=QuvoMenuCategories.filters(data.items).filter(category=>category==="All"||usedCategories.has(category));
  if(!CUSTOMER_DATA.categories.includes(state.selectedCategory))state.selectedCategory="All";
  if(reviewCart){state.cart=state.cart.flatMap(item=>{const current=data.items.find(entry=>entry.id===item.itemId);return current?[{...item,name:current.name,category:current.category,unitPrice:QuvoMenuOptions.price(current,QuvoMenuOptions.savedSelections(current,item.customization)),pricedOptions:QuvoMenuOptions.hasPricing(current)}]:[];});window.QuvoOnlineCart?.save();}
  renderCategories();renderMenu();renderCart();
}
async function onlineForm(form,errorElement,action){
  if(form.dataset.saving)return;
  form.dataset.saving="true";const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;
  errorElement.textContent="";
  try{await action();}catch(error){errorElement.textContent=error.message;}
  finally{delete form.dataset.saving;if(button)button.disabled=false;}
}
