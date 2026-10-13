async function kitchenApi(input=null,query='') {
  const response=await fetch('api/index.php'+query,{method:input?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-CSRF-Token':kitchenSql.csrf},...(input?{body:JSON.stringify(input)}:{})});
  const data=await response.json();if(!response.ok||!data.ok){const error=new Error(data.error||'Could not connect to the kitchen.');error.status=response.status;throw error;}return data;
}
function kitchenCanReady(){return Boolean(kitchenSql.user&&kitchenSql.connected&&!kitchenSql.changing);}
function mapKitchenOrder(row){
  const items=row.items.map(item=>({name:item.name,category:item.category,qty:item.quantity,customizations:[...Object.values(item.customization||{}),item.notes].filter(value=>typeof value==='string'&&value&&value!=='Not applicable').join(' · ')}));
  return {id:/^[A-Za-z0-9-]+$/.test(row.order_number)?row.order_number:'SQL-'+row.order_id,sqlId:row.order_id,status:row.status,table:row.location,customer:row.customer_name,receivedAt:row.received_at.replace(' ','T')+'Z',paymentStatus:'Payment approved',items,categoryMix:[...new Set(items.map(item=>item.category))],notes:items.map(item=>item.customizations).filter(Boolean).join('; '),hasDrinks:row.has_drinks,orderStatus:row.order_status};
}
function setKitchenUser(user){
  kitchenSql.user=user;loginScreen.classList.toggle('hidden',Boolean(user));appShell.classList.toggle('hidden',!user);
  document.getElementById('kitchenStaffName').textContent=user?.full_name||'';
  if(!user){kitchenSql.connected=false;orders=[];closeOrderModal();render();}
}
async function loadKitchenOrders(){
  if(!kitchenSql.user||kitchenSql.loading||kitchenSql.changing)return;
  kitchenSql.loading=true;const revision=kitchenSql.revision;
  try{
    const rows=[];let offset=0;
    do{const data=await kitchenApi(null,'?offset='+offset);rows.push(...data.orders);offset=data.next_offset;}while(offset!==null);
    if(revision!==kitchenSql.revision)return;
    orders=rows.map(mapKitchenOrder);kitchenSql.connected=true;render();
    if(activeOrderId){if(orders.some(order=>order.id===activeOrderId))openOrderModal(activeOrderId);else closeOrderModal();}
    document.getElementById('kitchenConnection').textContent='Updated '+new Date().toLocaleTimeString('en-PH');
  }catch(error){
    kitchenSql.connected=false;
    if(error.status===401||error.status===403){setKitchenUser(null);document.getElementById('loginError').textContent=error.message;}
    else{document.getElementById('kitchenConnection').textContent=error.message+' Retrying…';render();if(activeOrderId)openOrderModal(activeOrderId);}
  }finally{kitchenSql.loading=false;}
}
async function initializeKitchenDatabase(){
  try{const data=await kitchenApi(null,'?action=session');kitchenSql.csrf=data.csrf;setKitchenUser(data.user);document.getElementById('kitchenSignIn').disabled=false;if(data.user)await loadKitchenOrders();}
  catch(error){document.getElementById('loginError').textContent=error.message+' Check that the PHP server is running.';}
  setInterval(loadKitchenOrders,5000);
}
