(function () {
  'use strict';
  let status=null,started=false,revision=0,dialog;
  const fallback='We cannot confirm that ordering is open right now. You can still browse the menu. Please try again shortly.';
  const endpoint=document.getElementById('nameForm')?'api/session.php?view=ordering':'api/index.php?view=ordering';
  function render() {
    document.querySelectorAll('.ordering-notice').forEach(notice=>{
      notice.hidden=status?.acceptingOrders===true;
      notice.querySelector('strong').textContent=status?'Ordering is paused':'Checking ordering availability';
      notice.querySelector('p').textContent=status?.message||fallback;
    });
    if(started&&typeof renderCart==='function')renderCart();
  }
  async function check() {
    const request=++revision;
    try {
      const response=await fetch(endpoint,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
      const data=await response.json();
      if(!response.ok||!data.ok||typeof data.ordering?.acceptingOrders!=='boolean')throw new Error(fallback);
      if(request===revision){status=data.ordering;render();}
      return data.ordering;
    } catch {
      if(request===revision){status=null;render();}
      return {acceptingOrders:false,message:fallback};
    }
  }
  function showClosed(message) {
    revision++;
    status={acceptingOrders:false,message:message||'We are not accepting orders right now. You can still browse the menu. Please try again when ordering reopens.'};
    render();
    if(!dialog){
      dialog=document.createElement('dialog');dialog.className='ordering-closed-dialog';
      dialog.setAttribute('aria-labelledby','orderingClosedTitle');
      dialog.innerHTML='<h2 id="orderingClosedTitle">Ordering is paused</h2><p></p><button type="button" autofocus>Continue browsing</button>';
      dialog.querySelector('button').addEventListener('click',()=>dialog.close());
      document.body.append(dialog);
    }
    dialog.querySelector('p').textContent=status.message;
    if(!dialog.open)dialog.showModal();
  }
  window.QuvoOrdering={
    isClosed:()=>status?.acceptingOrders!==true,
    check,
    showClosed,
    async ensureOpen(){const current=await check();if(current.acceptingOrders)return true;showClosed(current.message);return false;},
    start(){
      if(started)return;
      document.querySelectorAll('.screen').forEach(screen=>{
        const notice=document.createElement('aside');notice.className='ordering-notice';notice.setAttribute('role','status');
        notice.innerHTML='<strong></strong><p></p>';screen.prepend(notice);
      });
      started=true;render();check();setInterval(check,15000);
      window.addEventListener('online',check);
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
    }
  };
})();
