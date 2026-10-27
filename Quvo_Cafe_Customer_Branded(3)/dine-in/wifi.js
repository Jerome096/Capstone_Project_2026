(() => {
  const node=id=>document.getElementById(id);
  let request=0,busy=false;
  function clear(){node('dineWifiName').value='';node('dineWifiPassword').value='';node('dineWifiFields').hidden=true;}
  function reset(){request++;busy=false;clear();node('dineWifiNote').hidden=true;node('dineWifiNote').open=false;node('dineWifiStatus').textContent='';}
  async function refresh(){
    if(!state.sessionApproved||!dineOrders.sessionId||!dineOrders.rows.some(order=>order.payment_status==='paid')){reset();return;}
    if(busy)return;
    const current=++request,session=dineOrders.sessionId,table=guestTableCode,generation=guestGeneration;busy=true;
    const valid=()=>current===request&&session===dineOrders.sessionId&&table===guestTableCode&&generation===guestGeneration&&state.sessionApproved;
    node('dineWifiNote').hidden=false;node('dineWifiRetry').disabled=true;
    try{
      const data=await guestSessionApi(null,'wifi');if(!valid())return;
      if(String(data.wifi?.sessionId)!==session)throw new Error('Wi-Fi details could not be verified for this visit.');
      if(!data.wifi.available){clear();if(data.wifi.reason==='payment_required'){reset();return;}node('dineWifiStatus').textContent='Wi-Fi details have not been set. Please ask the staff.';return;}
      node('dineWifiName').value=data.wifi.networkName;node('dineWifiPassword').value=data.wifi.password;node('dineWifiFields').hidden=false;
      node('dineWifiStatus').textContent='Payment confirmed. Use these details to connect during your visit.';
    }catch{if(valid()){clear();node('dineWifiStatus').textContent='Wi-Fi details could not load. Retry or ask the staff.';}}
    finally{if(current===request){busy=false;node('dineWifiRetry').disabled=false;}}
  }
  async function copy(id){
    const field=node(id);if(!field.value)return;
    try{await navigator.clipboard.writeText(field.value);showToast(id==='dineWifiName'?'Wi-Fi name copied.':'Wi-Fi password copied.');}
    catch{field.focus();field.select();let copied=false;try{copied=document.execCommand('copy');}catch{}showToast(copied?'Wi-Fi detail copied.':'Select and copy the Wi-Fi detail above.');}
  }
  function bind(){node('dineWifiRetry').addEventListener('click',refresh);document.querySelectorAll('[data-copy-wifi]').forEach(button=>button.addEventListener('click',()=>copy(button.dataset.copyWifi)));}
  window.QuvoDineWifi={bind,refresh,reset};
})();
