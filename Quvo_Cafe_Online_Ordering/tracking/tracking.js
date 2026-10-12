const trackingOrderCode=document.getElementById("trackingOrderCode");
const trackingPayment=document.getElementById("trackingPayment");
const statusTimeline=document.getElementById("statusTimeline");
const trackingDetails=document.getElementById("trackingDetails");
const trackingStatus=document.getElementById("trackingStatus");
const trackingUpdatedAt=document.getElementById("trackingUpdatedAt");
function renderTracking(){
  const order=state.order,e=escapeCustomerHtml;
  if(!order){
    trackingOrderCode.textContent="No order yet";trackingPayment.textContent="Payment";trackingStatus.textContent="Waiting";
    statusTimeline.innerHTML="";trackingDetails.innerHTML='<div class="empty-card"><h3>No submitted order</h3><p>Your saved order will appear here after checkout.</p></div>';
    trackingUpdatedAt.textContent=online.error||"Waiting for an order";return;
  }
  trackingOrderCode.textContent=order.order_number;trackingPayment.textContent=onlinePayment(order);
  trackingStatus.textContent=onlineStatusLabels[order.order_status];
  trackingUpdatedAt.textContent=online.error?online.error+" Retrying automatically.":"Last checked "+new Date().toLocaleTimeString()+" · Updated "+onlineDate(order.updated_at);
  const stages=["received","preparing","ready","served"],index=stages.indexOf(order.order_status);
  const descriptions=["Your order is saved. The cashier will confirm payment before preparation.","Staff are preparing your order.",
    order.fulfillment_type==="delivery"?"Your order is ready for staff-coordinated delivery.":"Your order is ready for pickup.","Your order has been completed."];
  statusTimeline.innerHTML=order.order_status==="cancelled"?'<div class="empty-card"><h3>Order cancelled</h3><p>'+e(order.cancellation_reason)+'</p></div>':
    stages.map((stage,i)=>'<article class="timeline-item '+(i<index?"done":i===index?"current":"")+'"><div class="timeline-dot">'+(i+1)+'</div><div><h3>'+onlineStatusLabels[stage]+'</h3><p>'+descriptions[i]+'</p></div></article>').join("");
  const row=(label,value)=>'<div class="ticket-row"><span>'+e(label)+'</span><strong>'+e(value)+'</strong></div>';
  trackingDetails.innerHTML=row("Customer",order.customer_name)+row("Fulfillment",onlineFulfillment(order))+row("Contact",order.contact_snapshot||"")+
    (order.address_snapshot?row("Delivery address",order.address_snapshot):"")+row("Submitted",onlineDate(order.created_at))+
    order.items.map(item=>row(item.quantity+" × "+item.item_name,formatCurrency(item.line_total))+'<p class="small-copy">'+e([item.customization.sugarLevel,item.customization.iceLevel,item.notes].filter(x=>x&&x!=="Not applicable").join(" · "))+'</p>').join("")+
    row("Total",formatCurrency(order.total_amount))+(order.payment_status==="paid"?row("Amount received",formatCurrency(order.amount_received))+row("Change",formatCurrency(order.change_amount)):"");
}
function startOrderStatusWatch(){
  clearOrderStatusTimers();const generation=online.generation;
  const tick=async()=>{if(generation!==online.generation||!state.onlineCustomer)return;
    if(document.visibilityState!=="hidden")await refreshOnlineOrders();
    if(generation===online.generation&&state.onlineCustomer)online.poll=setTimeout(tick,5000);
  };
  online.poll=setTimeout(tick,5000);
}
function clearOrderStatusTimers(){clearTimeout(online.poll);online.poll=null;}
