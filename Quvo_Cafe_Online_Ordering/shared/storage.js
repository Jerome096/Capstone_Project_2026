// SQL is authoritative. Browser storage retains only an unconfirmed submission for safe retry.
const online = {csrf:"",revision:0,busy:false,pending:null,generation:0,poll:null,loading:false,nextOffset:null,selectedId:null,error:""};
async function onlineApi(input=null,query="session") {
  const token=online.csrf;
  const response=await fetch("api/index.php?view="+query,{
    method:input?"POST":"GET",credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json","X-CSRF-Token":token},
    signal:AbortSignal.timeout(15000),...(input?{body:JSON.stringify(input)}:{})
  });
  let result;
  try {result=await response.json();} catch {throw new Error("Could not contact online ordering. Open this page through the PHP server.");}
  if(result.csrf && online.csrf===token) online.csrf=result.csrf;
  if(!response.ok||!result.ok) {
    const error=new Error(result.error||"Request failed. Please try again.");error.status=response.status;error.code=result.code;throw error;
  }
  return result;
}
function onlinePendingKey(){return "quvo_online_pending_sql_v1_"+state.onlineCustomer.id;}
function saveOnlinePending(value){
  if(value) sessionStorage.setItem(onlinePendingKey(),JSON.stringify(value));
  else sessionStorage.removeItem(onlinePendingKey());
  online.pending=value;
}
function restoreOnlinePending(){
  online.pending=null;
  try {const saved=JSON.parse(sessionStorage.getItem(onlinePendingKey())||"null");
    if(saved && saved.customerId===state.onlineCustomer.id && saved.payload && Array.isArray(saved.cart)) online.pending=saved;
  }catch{}
  state.cart=online.pending?online.pending.cart:[];
  if(online.pending){
    const payload=online.pending.payload;
    document.querySelectorAll('input[name="fulfillmentOption"]').forEach(input=>input.checked=(input.value==="Pickup") === (payload.fulfillment==="pickup"));
    document.querySelectorAll('input[name="paymentMethod"]').forEach(input=>input.checked=input.value===payload.payment_method);
    document.getElementById("deliveryAddress").value=payload.address||"";
    document.getElementById("deliveryContact").value=payload.contact||"";
  }
}
function onlineCartLocked(){return online.busy||Boolean(online.pending);}
function resetOnlineView(){
  checkoutPayment.request++;checkoutPayment.methods={};checkoutPayment.loading=false;checkoutPayment.qrLoaded=false;clearOnlinePaymentReceipt();renderOnlinePaymentOptions();
  online.generation++;clearTimeout(online.poll);online.poll=null;online.pending=null;online.selectedId=null;online.error="";online.nextOffset=null;
  state.onlineCustomer=null;state.customerName="";state.order=null;state.onlineOrders=[];state.cart=[];
  CUSTOMER_DATA.menuItems=[];CUSTOMER_DATA.categories=["All"];state.selectedCategory="All";state.searchTerm="";
  closeItemModal();renderCategories();renderMenu();renderCart();renderHistory();renderTracking();
  showScreen("screenOnlineAuth");
}
async function enterOnlineAccount(account){
  online.generation++;state.onlineCustomer=account;state.customerName=account.name;
  restoreOnlinePending();configureMenuHeader();renderAccount();prefillDeliveryDetails(true);renderCart();
  showScreen("screenMenu");
  await Promise.all([refreshOnlineMenu().catch(error=>showToast(error.message)),refreshOnlineOrders(),refreshOnlinePayment()]);
  startOrderStatusWatch();
}
async function refreshOnlineMenu(reviewCart=false){
  if(!state.onlineCustomer)return;
  const generation=online.generation;
  const data=await onlineApi(null,"menu");if(generation!==online.generation)return;
  CUSTOMER_DATA.menuItems=data.items;CUSTOMER_DATA.categories=["All",...new Set(data.items.map(item=>item.category))];
  if(!CUSTOMER_DATA.categories.includes(state.selectedCategory))state.selectedCategory="All";
  if(reviewCart)state.cart=state.cart.flatMap(item=>{const current=data.items.find(entry=>entry.id===item.itemId);return current?[{...item,name:current.name,category:current.category,unitPrice:current.price}]:[];});
  renderCategories();renderMenu();renderCart();
}
async function onlineForm(form,errorElement,action){
  if(form.dataset.saving)return;
  form.dataset.saving="true";const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;
  errorElement.textContent="";
  try{await action();}catch(error){errorElement.textContent=error.message;}
  finally{delete form.dataset.saving;if(button)button.disabled=false;}
}
