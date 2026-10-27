const historyList=document.getElementById("historyList");
const onlineStatusLabels={received:"Received",preparing:"Preparing",ready:"Ready",served:"Completed",cancelled:"Cancelled"};
function onlineIsCurrentOrder(order){return ['received','preparing','ready'].includes(order?.order_status);}
function onlineFulfillment(order){return order.fulfillment_type==="delivery"?(order.delivery_provider==="lalamove"?"Customer-booked Lalamove":"Delivery request"):"Pickup";}
function onlinePayment(order){return order.payment_status==="paid"?"Paid · "+(order.payment_method_label||order.payment_method):order.payment_status==="not_due"?"No payment due":"Awaiting cashier confirmation · "+(order.preferred_payment_label||order.preferred_payment_method);}
function onlineDate(value){return value?new Date(value.replace(" ","T")+"Z").toLocaleString():"";}
async function refreshOnlineOrders(more=false){
  if(!state.onlineCustomer||online.loading||online.busy)return;
  if(more&&online.nextOffset===null)return;
  online.loading=true;const generation=online.generation,revision=online.revision;
  try{
    const [data,firstActive]=await Promise.all([onlineApi(null,"orders&offset="+(more?online.nextOffset:0)),onlineApi(null,'orders&scope=active&offset=0')]);
    if(generation!==online.generation||revision!==online.revision)return;
    let activePage=firstActive,offset=0;const activeOrders=[];
    while(true){
      activeOrders.push(...activePage.orders.filter(onlineIsCurrentOrder));
      if(activePage.next_offset===null)break;
      if(!Number.isInteger(activePage.next_offset)||activePage.next_offset<=offset)throw new Error('Current orders could not refresh.');
      offset=activePage.next_offset;activePage=await onlineApi(null,'orders&scope=active&offset='+offset);
      if(generation!==online.generation||revision!==online.revision)return;
    }
    online.activeOrders=Array.from(new Map(activeOrders.map(order=>[order.order_id,order])).values());
    const observed=[...data.orders,...online.activeOrders];
    const merged=new Map(state.onlineOrders.map(order=>[order.order_id,order]));
    observed.forEach(order=>merged.set(order.order_id,order));
    state.onlineOrders=Array.from(merged.values()).sort((a,b)=>Number(b.order_id)-Number(a.order_id));
    if(more||!online.historyLoaded)online.nextOffset=data.next_offset;
    online.historyLoaded=true;
    if(!online.selectedId&&online.activeOrders.length)rememberOnlineOrder(online.activeOrders[0].order_id);
    if(online.selectedId){
      let order=observed.find(row=>row.order_id===online.selectedId);
      if(!order){
        const selectedId=online.selectedId;
        try{order=(await onlineApi(null,"orders&id="+encodeURIComponent(selectedId))).order;}
        catch(error){
          if(error.status!==404)throw error;
          if(generation!==online.generation||revision!==online.revision||online.selectedId!==selectedId)return;
          order=online.activeOrders[0]||null;rememberOnlineOrder(order?.order_id||null);state.order=order;
        }
      }
      if(generation!==online.generation||revision!==online.revision||(order&&order.order_id!==online.selectedId))return;
      if(order){observed.push(order);state.onlineOrders=Array.from(new Map([...state.onlineOrders,order].map(row=>[row.order_id,row])).values()).sort((a,b)=>Number(b.order_id)-Number(a.order_id));}
      if(order&&!onlineIsCurrentOrder(order)&&online.historyDetailId!==order.order_id){order=online.activeOrders[0]||null;rememberOnlineOrder(order?.order_id||null);state.order=order;}
      if(!order){window.QuvoReadyAlerts?.observe("online:"+state.onlineCustomer.id,observed);online.error='';renderHistory();renderTracking();return;}
      if(generation!==online.generation||revision!==online.revision||order.order_id!==online.selectedId)return;
      state.order=order;
      observed.push(order);
      state.onlineOrders=Array.from(new Map([...state.onlineOrders,order].map(row=>[row.order_id,row])).values()).sort((a,b)=>Number(b.order_id)-Number(a.order_id));
    }
    else state.order=null;
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
  online.revision++;online.historyDetailId=onlineIsCurrentOrder(order)?null:id;
  if(online.historyDetailId)online.selectedId=id;else rememberOnlineOrder(id);
  state.order=order;renderTracking();showScreen("screenTracking");
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
