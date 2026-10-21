(function () {
  'use strict';
  let started=false, status=null, busy=false, message='';
  const workspaceId=crypto.randomUUID();
  let panel, label, detail, button;
  async function request(input) {
    const response=await fetch(quvoPath('api/ordering/index.php'), {
      method:input?'POST':'GET', credentials:'same-origin', cache:'no-store',
      signal:AbortSignal.timeout(10000),
      headers:{'Content-Type':'application/json','X-CSRF-Token':window.QUVO_CSRF||''},
      ...(input?{body:JSON.stringify(input)}:{})
    });
    const result=await response.json();
    if(!response.ok||!result.ok){const error=new Error(result.error||'Could not check ordering status.');error.code=result.code;throw error;}
    if(typeof result.ordering?.acceptingOrders!=='boolean'||!result.ordering.revision)throw new Error('Could not check ordering status.');
    return result.ordering;
  }
  function render() {
    if(!panel)return;
    panel.dataset.orderingState=status?.acceptingOrders?'open':status?'paused':'unknown';
    label.textContent=status?.acceptingOrders?'Accepting customer orders':status?'Customer orders paused':'Checking customer ordering';
    detail.textContent=message||(status?.acceptingOrders?'Dine-in and online orders are open. Keep a staff or admin workspace connected.':
      status?.state==='offline'?'Ordering paused because operations went offline. Start accepting orders when you are ready.':
      status?'Customers can still browse. Start accepting orders when staff are ready.':'Ordering status is unavailable until this workspace reconnects.');
    button.textContent=busy?'Checking…':!status?'Check status':status.acceptingOrders?'Pause orders':'Start accepting orders';
    button.disabled=busy;
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
  async function change() {
    if(busy)return;
    if(!status)return refresh();
    const action=status.acceptingOrders?'pause':'start', revision=status.revision;
    busy=true;message='';render();
    try {status=await request({action,workspaceId,revision});}
    catch(error) {
      message=error.message||'Could not change ordering. Check the current status before trying again.';
      try {status=await request();}catch{status=null;}
    } finally {busy=false;render();}
  }
  window.QuvoOrderingStaff={
    start() {
      if(started||!['admin','staff'].includes(window.QUVO_SESSION?.role))return;
      started=true;
      panel=document.createElement('section');panel.className='ordering-control';
      panel.setAttribute('aria-label','Customer ordering');
      panel.innerHTML='<div class="ordering-control-copy"><strong id="orderingControlLabel"></strong><p id="orderingControlDetail" role="status"></p></div><button type="button" id="orderingControlButton"></button>';
      document.querySelector('.main > .topbar').after(panel);
      label=panel.querySelector('strong');detail=panel.querySelector('p');button=panel.querySelector('button');
      button.addEventListener('click',change);refresh();
      setInterval(refresh,25000);
      window.addEventListener('online',refresh);
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
    }
  };
})();
