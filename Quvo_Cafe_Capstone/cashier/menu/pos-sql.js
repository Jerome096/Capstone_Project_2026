// Keep an uncertain submission for the same cashier so a retry cannot charge twice.
const posSql={busy:false,pending:null};
function posStaffId(){return String(window.QUVO_SESSION?.staff_id||QUVO_AUTH.getSession()?.staff_id||'');}
function posPendingKey(){const id=posStaffId();if(!id)throw new Error('Please sign in again.');return 'quvo_pos_sql_pending_v1_'+id;}
function savePosPending(value){if(value)sessionStorage.setItem(posPendingKey(),JSON.stringify(value));else sessionStorage.removeItem(posPendingKey());posSql.pending=value;}
function posCartLocked(){return posSql.busy||Boolean(posSql.pending);}
function updatePosPendingUi(){
  const banner=document.getElementById('posSqlPendingBanner');if(banner)banner.hidden=!posSql.pending;
  document.querySelectorAll('#paymentReviewConfirm,#paymentReviewCancel,#paymentReviewClose').forEach(button=>button.disabled=posSql.busy);
  document.getElementById('paymentReviewConfirm').textContent=posSql.busy?'Saving…':posSql.pending?'Retry confirmation':'Confirm & send to preparation';
  document.getElementById('counterCustomerName').disabled=posCartLocked();
  document.getElementById('clearCartBtn').disabled=posCartLocked();
}
function startSqlPosReview(){
  if(posSql.pending)return openPosPendingReview();
  const total=state.posCart.reduce((sum,item)=>sum+Math.round(item.price*100)*item.qty,0);
  if(!selectedPaymentMethod||total<=0||posSql.busy)return;
  const received=selectedPaymentMethod==='Cash'?document.getElementById('amountReceived').value.trim():(total/100).toFixed(2);
  const customer=document.getElementById('counterCustomerName').value.trim()||'Walk-in customer';
  const reference=selectedPaymentMethod==='Cash'?'':document.getElementById('paymentReference').value.trim();
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  const key=[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  const payload={submission_key:key,customer_name:customer,expected_total:(total/100).toFixed(2),payment_method:selectedPaymentMethod,amount_received:received,payment_reference:reference,
    items:state.posCart.map(item=>({menu_id:item.menuId,quantity:item.qty,drink_options:item.drinkOptions,notes:item.note||''}))};
  pendingPaymentReview={type:'manual',orderNumber:'New walk-in order',location:'Counter',source:'Walk-in / POS',customerName:customer,paymentMethod:selectedPaymentMethod,total:total/100,
    amountReceived:Number(received),change:Math.max(0,Number(received)-total/100),gcashReference:reference,payload,
    items:state.posCart.map(item=>({...item,category:state.menu.find(menu=>menu.id===item.menuId)?.category||'',customizations:[...(item.customizations||[])]}))};
  document.getElementById('posSqlError').textContent='';closeCheckoutModal();openPaymentReviewModal();updatePosPendingUi();
}
function openPosPendingReview(){
  if(!posSql.pending||posSql.busy)return;
  pendingPaymentReview=structuredClone(posSql.pending.review);openPaymentReviewModal();updatePosPendingUi();
}
async function confirmSqlPosPayment(){
  if(posSql.busy||pendingPaymentReview?.type!=='manual')return;
  const review=pendingPaymentReview;
  try {
    if(!posSql.pending)savePosPending({staffId:posStaffId(),payload:review.payload,review:structuredClone(review),cart:structuredClone(state.posCart)});
  }catch(error){document.getElementById('posSqlError').textContent='Could not save retry information. No order was sent. '+error.message;return;}
  posSql.busy=true;sqlOrders.revision++;updatePosPendingUi();renderCart();
  let approved=null;
  try {
    const response=await fetch(quvoPath('api/pos/index.php'),{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':window.QUVO_CSRF||''},signal:AbortSignal.timeout(15000),body:JSON.stringify(posSql.pending.payload)});
    const result=await response.json();if(!response.ok||!result.ok){const error=new Error(result.error||'Could not save the POS order.');error.status=response.status;error.code=result.code;throw error;}
    try{savePosPending(null);}catch{posSql.pending=null;}
    // Invalidate polling that started while the payment request was in flight.
    sqlOrders.revision++;
    approved=sqlMapOrder(result.order);installSqlOrder(result.order);
    if(!result.replayed)deductInventoryForOrder(approved,'POS payment confirmation');
    state.posCart=[];document.getElementById('counterCustomerName').value='';
    document.getElementById('paidState').classList.remove('hidden');document.getElementById('posReceiptActions').classList.remove('hidden');
    showToast(result.replayed?'Previously saved POS order restored.':'POS order '+result.order.order_number+' saved and sent to preparation.');
  }catch(error){
    document.getElementById('posSqlError').textContent=error.message+' '+(error.status===422||['price_changed','item_unavailable'].includes(error.code)?'Cancel this review and correct the cart.':'Retry this same confirmation or check Orders before creating another order.');
    if([400,413,422].includes(error.status)||['price_changed','item_unavailable'].includes(error.code)){
      try{savePosPending(null);}catch{posSql.pending=null;}
      if(['price_changed','item_unavailable'].includes(error.code))loadMenuItems();
    }
  }finally{
    posSql.busy=false;updatePosPendingUi();renderCart();
    if(approved){closePaymentReviewModal();openPreparationTickets(approved);}
  }
}
function bindPosSql(){
  if(!window.QUVO_CONFIG.allowedScreens.includes('menu'))return;
  try{const saved=JSON.parse(sessionStorage.getItem(posPendingKey())||'null');if(saved?.staffId===posStaffId()&&saved.payload&&saved.review&&Array.isArray(saved.cart)){posSql.pending=saved;state.posCart=saved.cart;document.getElementById('counterCustomerName').value=saved.payload.customer_name;}}
  catch{}
  document.getElementById('posSqlRetry').addEventListener('click',openPosPendingReview);updatePosPendingUi();renderCart();
}
