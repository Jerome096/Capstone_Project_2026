const trackingOrderCode=document.getElementById("trackingOrderCode");
const trackingPayment=document.getElementById("trackingPayment");
const statusTimeline=document.getElementById("statusTimeline");
const trackingDetails=document.getElementById("trackingDetails");
const trackingStatus=document.getElementById("trackingStatus");
const trackingUpdatedAt=document.getElementById("trackingUpdatedAt");
const trackingOrderSwitcher=document.getElementById('trackingOrderSwitcher'),trackingOrderSelect=document.getElementById('trackingOrderSelect');
let trackingOrderSelectMarkup='';
function renderTrackingOrderSwitcher(){
  const orders=state.onlineCustomer?Array.from(new Map([...online.activeOrders,...(onlineIsCurrentOrder(state.order)?[state.order]:[])].filter(onlineIsCurrentOrder).map(order=>[String(order.order_id),order])).values()).sort((a,b)=>Number(b.order_id)-Number(a.order_id)):[];
  trackingOrderSwitcher.hidden=!state.onlineCustomer;
  const e=escapeCustomerHtml;
  const markup='<option value="" disabled>'+(orders.length?'Choose a current order':'No current orders')+'</option>'+orders.map(order=>'<option value="'+e(order.order_id)+'">'+e(order.order_number+' · '+(onlineStatusLabels[order.order_status]||order.order_status))+'</option>').join('');
  if(markup!==trackingOrderSelectMarkup){trackingOrderSelect.innerHTML=markup;trackingOrderSelectMarkup=markup;}
  trackingOrderSelect.disabled=orders.length===0;
  trackingOrderSelect.value=orders.some(order=>order.order_id===state.order?.order_id)?String(state.order.order_id):'';
}
function bindTrackingEvents(){
  trackingOrderSelect.addEventListener('change',()=>{if(trackingOrderSelect.value)selectOnlineOrder(trackingOrderSelect.value);});
}
function renderTracking(){
  renderTrackingOrderSwitcher();
  const order=state.order,e=escapeCustomerHtml;
  if(!order){
    document.getElementById('trackingOrderContext').textContent='Current order';
    trackingOrderCode.textContent="No current orders";trackingPayment.textContent="Payment";trackingStatus.textContent="Waiting";
    statusTimeline.innerHTML="";trackingDetails.innerHTML='<div class="empty-card"><h3>No current orders</h3><p>Your next order will appear here after checkout.</p></div>';
    trackingUpdatedAt.textContent=online.error||"Waiting for an order";return;
  }
  trackingOrderCode.textContent=order.order_number;trackingPayment.textContent=onlinePayment(order);
  document.getElementById('trackingOrderContext').textContent=onlineIsCurrentOrder(order)?'Current order':'Order details';
  trackingStatus.textContent=onlineStatusLabels[order.order_status];
  trackingUpdatedAt.textContent=online.error?online.error+" Retrying automatically.":"Last checked "+new Date().toLocaleTimeString()+" · Updated "+onlineDate(order.updated_at);
  const stages=["received","preparing","ready","served"],index=stages.indexOf(order.order_status);
  const descriptions=["Your order is saved. The cashier will confirm payment before preparation.","Staff are preparing your order.",
    order.fulfillment_type==="delivery"?(order.delivery_provider==="lalamove"?"Your order is ready for your booked Lalamove rider. Contact Quvo to coordinate pickup.":"Your order is ready for delivery pickup."):"Your order is ready for pickup.","Your order has been completed."];
  statusTimeline.innerHTML=order.order_status==="cancelled"?'<div class="empty-card"><h3>Order cancelled</h3><p>'+e(order.cancellation_reason)+'</p></div>':
    stages.map((stage,i)=>'<article class="timeline-item '+(i<index?"done":i===index?"current":"")+'"><div class="timeline-dot">'+(i+1)+'</div><div><h3>'+onlineStatusLabels[stage]+'</h3><p>'+descriptions[i]+'</p></div></article>').join("");
  const row=(label,value)=>'<div class="ticket-row"><span>'+e(label)+'</span><strong>'+e(value)+'</strong></div>';
  trackingDetails.innerHTML=row("Customer",order.customer_name)+row("Fulfillment",onlineFulfillment(order))+row("Contact",order.contact_snapshot||"")+
    (order.pickup_address_snapshot?row("Café pickup address",order.pickup_address_snapshot):order.address_snapshot?row("Delivery address",order.address_snapshot):"")+row("Submitted",onlineDate(order.created_at))+
    order.items.map(item=>row(item.quantity+" × "+item.item_name,formatCurrency(item.line_total))+'<p class="small-copy">'+e([...QuvoMenuOptions.summary(item.customization),item.notes].filter(x=>x&&x!=="Not applicable").join(" · "))+'</p>').join("")+
    (Number(order.has_delivery_booking)===1?'<div class="delivery-saved-booking"><h3>Lalamove booking</h3><p class="small-copy">Your screenshot was sent to Quvo with this order.</p></div>':'')+
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
