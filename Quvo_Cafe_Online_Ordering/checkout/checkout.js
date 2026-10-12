const submitOrderBtn = document.getElementById("submitOrderBtn");

const fulfillmentCard = document.getElementById("fulfillmentCard");

const deliveryDetails = document.getElementById("deliveryDetails");

const paymentNote = document.getElementById("paymentNote");

function updateFulfillmentDisplay() {
  const isOnline = state.accessMode === "online";
  fulfillmentCard.classList.toggle("hidden", !isOnline);

  const selectedFulfillment = getSelectedFulfillment();
  const isDelivery = isOnline && selectedFulfillment === "Staff-coordinated delivery request";
  deliveryDetails.classList.toggle("hidden", !isDelivery);

  if (isDelivery) {
    prefillDeliveryDetails();
  }
}

function getSelectedFulfillment() {
  const selected = document.querySelector("input[name='fulfillmentOption']:checked");
  return selected ? selected.value : "Pickup";
}

async function submitOrder(){
  if(online.busy||!state.onlineCustomer)return;
  if(!state.cart.length&&!online.pending)return showToast("Add an item first.");
  online.busy=true;online.revision++;
  try{
    if(!online.pending){
      const fulfillment=getSelectedFulfillment()==="Pickup"?"pickup":"delivery";
      const address=document.getElementById("deliveryAddress").value.trim();
      const contact=document.getElementById("deliveryContact").value.trim();
      if(fulfillment==="delivery"&&(!address||!contact))throw new Error("Enter the delivery address and contact number.");
      const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
      const hex=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
      const key=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join("-");
      const cents=state.cart.reduce((sum,item)=>sum+Math.round(item.unitPrice*100)*item.quantity,0);
      const payload={action:"submit",submission_key:key,expected_total:(cents/100).toFixed(2),fulfillment,address,contact,
        payment_method:document.querySelector('input[name="paymentMethod"]:checked').value,
        items:state.cart.map(item=>({itemId:item.itemId,quantity:item.quantity,customization:item.customization}))};
      saveOnlinePending({customerId:state.onlineCustomer.id,payload,cart:structuredClone(state.cart)});
    }
    renderCart();
    const result=await onlineApi(online.pending.payload);
    try{saveOnlinePending(null);}catch{online.pending=null;}
    state.cart=[];online.selectedId=result.order.order_id;state.order=result.order;
    state.onlineOrders=[result.order,...state.onlineOrders.filter(order=>order.order_id!==result.order.order_id)];
    renderHistory();renderTracking();showScreen("screenTracking");showToast("Order received. Payment will be confirmed by the cashier.");
  }catch(error){
    if([400,413,422].includes(error.status)||["price_changed","item_unavailable"].includes(error.code)){
      try{saveOnlinePending(null);}catch{online.pending=null;}
      if(["price_changed","item_unavailable"].includes(error.code))await refreshOnlineMenu(true).catch(()=>{});
    }
    showToast(error.message);
  }finally{online.busy=false;renderCart();}
}

function prefillDeliveryDetails(force=false){
  if(!state.onlineCustomer||online.pending)return;
  const address=document.getElementById("deliveryAddress"),contact=document.getElementById("deliveryContact");
  if(force||!address.value.trim())address.value=state.onlineCustomer.address||"";
  if(force||!contact.value.trim())contact.value=state.onlineCustomer.contact||"";
}
function bindCheckoutEvents(){
  document.querySelectorAll('input[name="fulfillmentOption"]').forEach(input=>input.addEventListener("change",updateFulfillmentDisplay));
  submitOrderBtn.addEventListener("click",submitOrder);
}
