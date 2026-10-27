const submitOrderBtn = document.getElementById("submitOrderBtn");

const fulfillmentCard = document.getElementById("fulfillmentCard");

const deliveryDetails = document.getElementById("deliveryDetails");

const paymentNote = document.getElementById("paymentNote");

function updateFulfillmentDisplay() {
  const isOnline = state.accessMode === "online";
  fulfillmentCard.classList.toggle("hidden", !isOnline);

  const selectedFulfillment = getSelectedFulfillment();
  const isDelivery = isOnline && selectedFulfillment !== "Pickup";
  deliveryDetails.classList.toggle("hidden", !isDelivery);

  if (isDelivery) {
    prefillDeliveryDetails();
  }
  window.QuvoDelivery?.update();
}

function getSelectedFulfillment() {
  const selected = document.querySelector("input[name='fulfillmentOption']:checked");
  return selected ? selected.value : "Pickup";
}

async function releaseOnlinePending(customerId,key){saveOnlinePending(null,customerId);await window.QuvoPendingProofs?.clear(customerId,key);}
async function submitOrder(){
  if(online.busy||!state.onlineCustomer)return;
  if(window.QuvoPendingProofs&&!QuvoPendingProofs.ready())return showToast("Your saved submission photos could not be restored. Contact Quvo before starting another order.");
  if(!state.cart.length&&!online.pending)return showToast("Add an item first.");
  if(!online.pending && window.QuvoOrdering && !(await window.QuvoOrdering.ensureOpen()))return;
  if(online.busy)return;
  if(!online.pending&&window.QuvoDelivery&&!QuvoDelivery.ready())return showToast("Review the café pickup details and upload your Lalamove booking screenshot first.");
  if(!online.pending&&!onlinePaymentReady())return showToast("Choose an available payment method and upload your payment receipt first.");
  online.busy=true;online.revision++;
  const readyCustomerId=String(state.onlineCustomer.id),readyGeneration=online.generation;
  let readySubmissionKey=online.pending?.payload.submission_key||null;
  try{
    if(!online.pending){
      const fulfillment=getSelectedFulfillment()==="Pickup"?"pickup":"delivery";
      const delivery=fulfillment==="delivery"?QuvoDelivery.payload():{};
      const contact=document.getElementById("deliveryContact").value.trim();
      if(fulfillment==="delivery"&&!contact)throw new Error("Add your contact number in your account before placing a delivery order.");
      const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
      const hex=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
      const key=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join("-");
      const cents=state.cart.reduce((sum,item)=>sum+Math.round(item.unitPrice*100)*item.quantity,0);
      const payload={action:"submit",submission_key:key,expected_total:(cents/100).toFixed(2),fulfillment,contact,...delivery,
        payment_method:selectedOnlinePayment(),payment_qr_version:checkoutPayment.methods[selectedOnlinePayment()].version,
        receipt_image:checkoutPayment.receipt,
        items:state.cart.map(item=>({itemId:item.itemId,quantity:item.quantity,customization:item.customization}))};
      const submission={customerId:state.onlineCustomer.id,payload,cart:structuredClone(state.cart)};
      if(window.QuvoPendingProofs)await QuvoPendingProofs.persist(submission);else saveOnlinePending(submission);
      readySubmissionKey=key;
      if(readyGeneration!==online.generation||String(state.onlineCustomer?.id)!==readyCustomerId)return;
    }
    renderCart();
    const result=await onlineApi(online.pending.payload);
    // Clear the draft first. A crash before pending cleanup then safely retries
    // the accepted key instead of restoring a fresh, duplicate cart submission.
    if(!window.QuvoOnlineCart||window.QuvoOnlineCart.clear(readyCustomerId)) {
      try{await releaseOnlinePending(readyCustomerId,readySubmissionKey);}catch{if(String(state.onlineCustomer?.id)===readyCustomerId)online.pending=null;}
    }
    if(String(state.onlineCustomer?.id)!==readyCustomerId)return;
    online.pending=null;
    clearOnlinePaymentReceipt();window.QuvoDelivery?.clear();
    state.cart=[];rememberOnlineOrder(result.order.order_id);state.order=result.order;
    online.activeOrders=[result.order,...online.activeOrders.filter(order=>order.order_id!==result.order.order_id)];online.historyDetailId=null;
    state.onlineOrders=[result.order,...state.onlineOrders.filter(order=>order.order_id!==result.order.order_id)];
    if(readyGeneration===online.generation&&String(state.onlineCustomer?.id)===readyCustomerId)window.QuvoReadyAlerts?.observe("online:"+readyCustomerId,[result.order]);
    renderHistory();renderTracking();showScreen("screenTracking");showToast("Order received. Payment will be confirmed by the cashier.");
  }catch(error){
    if(String(state.onlineCustomer?.id)!==readyCustomerId)return;
    if(error.code==="ordering_closed"){
      try{await releaseOnlinePending(readyCustomerId,readySubmissionKey);}catch{online.pending=null;}
      window.QuvoOrdering?.showClosed(error.message);
    }else if([400,413,422].includes(error.status)||["price_changed","item_unavailable","options_changed","payment_qr_changed","delivery_flow_changed","delivery_details_changed"].includes(error.code)){
      try{await releaseOnlinePending(readyCustomerId,readySubmissionKey);}catch{online.pending=null;}
      if(["price_changed","item_unavailable","options_changed"].includes(error.code))await refreshOnlineMenu(true).catch(()=>{});
      if(["payment_qr_changed","payment_unavailable"].includes(error.code))await refreshOnlinePayment();
      if(["delivery_flow_changed","delivery_details_changed","delivery_unavailable"].includes(error.code)){QuvoDelivery.clear();await QuvoDelivery.refresh();}
    }
    showToast(error.message);
  }finally{online.busy=false;renderCart();}
}

function prefillDeliveryDetails(force=false){
  if(!state.onlineCustomer||online.pending)return;
  const contact=document.getElementById("deliveryContact");
  if(force||!contact.value.trim())contact.value=state.onlineCustomer.contact||"";
}
function bindCheckoutEvents(){
  bindOnlinePayment();window.QuvoDelivery?.bind();
  document.querySelectorAll('input[name="fulfillmentOption"]').forEach(input=>input.addEventListener("change",updateFulfillmentDisplay));
  submitOrderBtn.addEventListener("click",submitOrder);
}
