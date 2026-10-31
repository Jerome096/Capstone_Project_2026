(function () {
  'use strict';
  let started=false, status=null, busy=false, message='', pendingAction='';
  const workspaceId=crypto.randomUUID();
  let panel, label, detail, button, confirmation;
  let confirmationAction='', confirmationRevision=null;
  async function request(input) {
    const response=await fetch(quvoPath('api/ordering/index.php'), {
      method:input?'POST':'GET', credentials:'same-origin', cache:'no-store',
      signal:AbortSignal.timeout(10000),
      headers:{'Content-Type':'application/json','X-CSRF-Token':window.QUVO_CSRF||''},
      ...(input?{body:JSON.stringify(input)}:{})
    });
    let result;
    try {result=await response.json();}
    catch {throw new Error('Could not reach ordering. Check the connection and try Start accepting orders again.');}
    if(!response.ok||!result.ok){const error=new Error(result.error||'Could not check ordering status.');error.code=result.code;throw error;}
    if(typeof result.ordering?.acceptingOrders!=='boolean'||!result.ordering.revision)throw new Error('Could not check ordering status.');
    return result.ordering;
  }
  function render() {
    if(!panel)return;
    panel.dataset.orderingState=status?.acceptingOrders?'open':status?'paused':'unknown';
    label.textContent=status?.acceptingOrders?'Accepting customer orders':status?'Customer orders paused':message?'Customer ordering unavailable':'Checking customer ordering';
    detail.textContent=message||(status?.acceptingOrders?'Dine-in and online orders are open. Use Pause orders to stop new orders.':
      status?.state==='offline'?'Ordering paused after the 10-minute logout timer. Existing orders stay saved. Start accepting orders when you are ready.':
      status?'Customers can still browse. Start accepting orders when staff are ready.':'Ordering status is unavailable until this workspace reconnects.');
    button.textContent=busy?(pendingAction==='start'?'Starting orders…':pendingAction==='pause'?'Pausing orders…':'Checking…'):status?.acceptingOrders?'Pause orders':'Start accepting orders';
    button.disabled=busy;
    if(confirmation)confirmation.querySelector('[data-confirm-ordering]').disabled=busy;
  }
  async function refresh() {
    if(busy)return;
    busy=true;render();
    try {
      if(!status)status=await request();
      status=await request({action:'heartbeat',workspaceId,revision:status.revision});message='';
    } catch(error) {status=null;message=error.message||'Could not check ordering status. Reconnect to try again.';}
    finally {busy=false;render();}
  }
  function confirmChange() {
    if(busy||confirmation.open)return;
    confirmationAction=status?.acceptingOrders?'pause':'start';
    confirmationRevision=status?.revision||null;
    const pausing=confirmationAction==='pause';
    confirmation.querySelector('h2').textContent=pausing?'Pause customer orders?':'Start accepting orders?';
    confirmation.querySelector('p').textContent=pausing?
      'Customers will be unable to place new dine-in or online orders. Existing orders will stay saved, and customers can still browse the menu.':
      'Customers will be able to place dine-in and online orders.';
    confirmation.querySelector('[data-confirm-ordering]').textContent=pausing?'Yes, pause orders':'Yes, start orders';
    confirmation.showModal();
    confirmation.querySelector('[data-cancel-ordering]').focus();
  }
  async function change(action, revision) {
    if(busy)return;
    busy=true;pendingAction=action;message='';render();
    try {
      if(!status) {
        status=await request();
        // A Start click reconnects without pausing orders another staff member opened.
        if(action==='start'&&status.acceptingOrders){
          status=await request({action:'heartbeat',workspaceId,revision:status.revision});
          return;
        }
      }
      status=await request({action,workspaceId,revision:revision||status.revision});
    }
    catch(error) {
      message=error.message||'Could not change ordering. Check the current status before trying again.';
      try {status=await request();}catch{status=null;}
    } finally {busy=false;pendingAction='';render();}
  }
  window.QuvoOrderingStaff={
    start() {
      if(started||!['admin','staff'].includes(window.QUVO_SESSION?.role))return;
      started=true;
      panel=document.createElement('section');panel.className='ordering-control';
      panel.setAttribute('aria-label','Customer ordering');
      panel.innerHTML='<div class="ordering-control-copy"><strong id="orderingControlLabel"></strong><p id="orderingControlDetail" role="status"></p></div><button type="button" id="orderingControlButton"></button>';
      (document.querySelector('.main > .cafe-page-heading')||document.querySelector('.main > .topbar')).after(panel);
      label=panel.querySelector('strong');detail=panel.querySelector('p');button=panel.querySelector('button');
      confirmation=document.createElement('dialog');confirmation.className='ordering-confirmation';
      confirmation.setAttribute('aria-labelledby','orderingConfirmTitle');
      confirmation.setAttribute('aria-describedby','orderingConfirmDescription');
      confirmation.innerHTML='<form method="dialog"><h2 id="orderingConfirmTitle"></h2><p id="orderingConfirmDescription"></p><div class="ordering-confirmation-actions"><button type="submit" data-cancel-ordering>Cancel</button><button type="button" data-confirm-ordering></button></div></form>';
      document.body.append(confirmation);
      confirmation.querySelector('[data-confirm-ordering]').addEventListener('click',()=>{
        if(busy||!confirmation.open)return;
        const action=confirmationAction, revision=confirmationRevision;
        confirmation.close();
        change(action,revision);
      });
      confirmation.addEventListener('click',event=>{if(event.target===confirmation)confirmation.close();});
      button.addEventListener('click',confirmChange);refresh();
      setInterval(refresh,25000);
      window.addEventListener('online',refresh);
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
    }
  };
})();
