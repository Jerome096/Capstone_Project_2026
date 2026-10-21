const historyList=document.getElementById("historyList");
const onlineStatusLabels={received:"Received",preparing:"Preparing",ready:"Ready",served:"Completed",cancelled:"Cancelled"};
function onlineFulfillment(order){return order.fulfillment_type==="delivery"?"Delivery request":"Pickup";}
function onlinePayment(order){return order.payment_status==="paid"?"Paid · "+(order.payment_method_label||order.payment_method):order.payment_status==="not_due"?"No payment due":"Awaiting cashier confirmation · "+(order.preferred_payment_label||order.preferred_payment_method);}
function onlineDate(value){return value?new Date(value.replace(" ","T")+"Z").toLocaleString():"";}
async function refreshOnlineOrders(more=false){
  if(!state.onlineCustomer||online.loading||online.busy)return;
  if(more&&online.nextOffset===null)return;
  online.loading=true;const generation=online.generation,revision=online.revision;
  try{
    const data=await onlineApi(null,"orders&offset="+(more?online.nextOffset:0));
    if(generation!==online.generation||revision!==online.revision)return;
    const observed=data.orders.slice();
    const merged=new Map(state.onlineOrders.map(order=>[order.order_id,order]));
    data.orders.forEach(order=>merged.set(order.order_id,order));
    state.onlineOrders=Array.from(merged.values()).sort((a,b)=>Number(b.order_id)-Number(a.order_id));
    if(more||state.onlineOrders.length<=20)online.nextOffset=data.next_offset;
    if(!online.selectedId&&data.orders.length)online.selectedId=data.orders[0].order_id;
    if(online.selectedId){
      let order=data.orders.find(row=>row.order_id===online.selectedId);
      if(!order)order=(await onlineApi(null,"orders&id="+encodeURIComponent(online.selectedId))).order;
      if(generation!==online.generation||revision!==online.revision||order.order_id!==online.selectedId)return;
      state.order=order;
      observed.push(order);
      state.onlineOrders=state.onlineOrders.map(row=>row.order_id===order.order_id?order:row);
    }
    window.QuvoReadyAlerts?.observe("online:"+state.onlineCustomer.id,observed);
    online.error="";renderHistory();renderTracking();
  }catch(error){
    if(generation!==online.generation)return;
    if(error.status===401){resetOnlineView();loginError.textContent="Please sign in again.";return;}
    online.error=error.message;renderTracking();
  }finally{online.loading=false;}
}
async function selectOnlineOrder(id){
  const order=state.onlineOrders.find(row=>row.order_id===id);if(!order)return;
  online.revision++;online.selectedId=id;state.order=order;renderTracking();showScreen("screenTracking");
  await refreshOnlineOrders();
}
function renderHistory(){
  if(!state.onlineCustomer){historyList.innerHTML='<div class="empty-card"><h3>Sign in to view your orders</h3></div>';return;}
  const e=escapeCustomerHtml;
  historyList.innerHTML=state.onlineOrders.length?state.onlineOrders.map(order=>
    '<article class="history-card"><div class="history-head"><h3>'+e(order.order_number)+'</h3><span class="count-pill">'+e(onlineStatusLabels[order.order_status])+'</span></div>'+
    '<p>'+e(onlineFulfillment(order))+' · '+e(onlinePayment(order))+'</p><p>'+e(onlineDate(order.created_at))+'</p><strong>'+formatCurrency(order.total_amount)+'</strong>'+
    '<button class="secondary-btn" type="button" data-online-order="'+e(order.order_id)+'">View order</button></article>').join(""):
    '<div class="empty-card"><h3>No online order history yet</h3><p>Your submitted orders will appear here.</p></div>';
  if(online.nextOffset!==null)historyList.insertAdjacentHTML("beforeend",'<button class="secondary-btn" type="button" id="loadMoreOnlineOrders">Load older orders</button>');
  historyList.querySelectorAll("[data-online-order]").forEach(button=>button.addEventListener("click",()=>selectOnlineOrder(button.dataset.onlineOrder)));
  document.getElementById("loadMoreOnlineOrders")?.addEventListener("click",()=>refreshOnlineOrders(true));
}
