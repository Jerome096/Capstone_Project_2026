(function(){
  'use strict';
  const $=id=>document.getElementById(id),dialog=$('cashierApprovalDialog'),form=$('cashierApprovalForm');
  let context=null,busy=false,pending=null,uncertain=false,requestKey=null,previousFocus=null;
  const fields=['cashierPayoutAmount','cashierApprovalReason'];
  const key=()=>eodSubmissionKey();
  function controls(){
    for(const id of fields)$(id).disabled=busy||!!pending;
    $('cashierApprovalPassword').disabled=busy;
    $('cashierApprovalClose').disabled=busy;$('cashierApprovalCancel').disabled=busy;
    $('cashierApprovalSubmit').disabled=busy||!context||(context.kind==='payout'&&!context.operationId);
    $('cashierApprovalSubmit').textContent=busy?'Checking admin approval…':pending?'Retry approved submission':context?.kind==='void'?'Approve and void order':'Approve and record payout';
  }
  function clear(){context=null;pending=null;uncertain=false;requestKey=null;form.reset();$('cashierApprovalPassword').value='';for(const id of fields)$(id).disabled=false;previousFocus?.focus();}
  function close(){if(busy)return;if(pending&&!window.confirm('The result is unconfirmed. Check the order or ask admin to check cash movements before starting a new request. Close this request?'))return;dialog.close();}
  dialog.addEventListener('close',clear);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  $('cashierApprovalClose').addEventListener('click',close);$('cashierApprovalCancel').addEventListener('click',close);
  for(const id of fields)$(id).addEventListener('input',()=>{if(!pending)requestKey=key();});
  async function request(path,payload){
    const response=await fetch(quvoPath(path),{credentials:'same-origin',cache:'no-store',...(payload?{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':window.QUVO_CSRF},body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(20000)});
    let data;try{data=await response.json();}catch{throw Error('The result could not be confirmed. Retry the same submission.');}
    if(!response.ok||!data.ok){const error=Error(data.error||'The action could not be confirmed.');error.status=response.status;throw error;}return data;
  }
  function open(kind,id,number){
    if(dialog.open)return false;previousFocus=document.activeElement;form.reset();pending=null;uncertain=false;requestKey=key();context={kind,id};
    const payout=kind==='payout';$('cashierPayoutFields').hidden=!payout;
    $('cashierPayoutAmount').required=payout;$('cashierApprovalReason').maxLength=payout?1000:500;
    $('cashierApprovalTitle').textContent=payout?'Cash expense / payout':'Void unpaid order';
    $('cashierApprovalSummary').textContent=payout?'Loading the current shared drawer…':'Order '+(number||id)+'. This cancels the unpaid order and keeps its history.';
    $('cashierApprovalError').textContent='';controls();dialog.showModal();$('cashierApprovalReason').focus();return true;
  }
  async function openPayout(){
    if(!open('payout'))return;const opened=context;
    try{const data=await request('api/cash-operations/index.php?view=current');if(context!==opened)return;
      if(!data.operation)throw Error('No cash drawer is open. Start operations and enter the beginning cash fund first.');
      context.operationId=data.operation.operationId;$('cashierApprovalSummary').textContent='Shared drawer OP-'+data.operation.operationId+' · Business date '+data.operation.businessDate+'. Record cash taken out during operation. This is deducted from expected cash at EOD.';
    }catch(error){if(context===opened)$('cashierApprovalError').textContent=error.message;}finally{controls();}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!context||!form.reportValidity())return;
    if(!pending){const reason=$('cashierApprovalReason').value.trim();if(!reason){$('cashierApprovalError').textContent='Enter a reason.';return;}
      pending=context.kind==='payout'?{action:'cashier-payout',operationId:context.operationId,amount:$('cashierPayoutAmount').value,note:reason,requestKey}:{action:'cancel',id:context.id,reason,requestKey};
    }
    busy=true;controls();$('cashierApprovalError').textContent='';
    const kind=context.kind,payload={...pending,adminPassword:$('cashierApprovalPassword').value};
    $('cashierApprovalPassword').value='';
    try{
      const data=await request(kind==='payout'?'api/cash-operations/index.php':'api/orders/index.php',payload);
      pending=null;busy=false;dialog.close();
      if(kind==='void'){installSqlOrder(data.order);await loadSqlOrders();}
      else window.QuvoCashHistory?.load();
      showToast(data.replayed?'Previously saved approval restored.':kind==='payout'?'Admin-approved payout saved.':'Order voided with admin approval.');
    }catch(error){
      if(!error.status||error.status>=500)uncertain=true;
      if(error.status>=400&&error.status<500&&!uncertain)pending=null;
      $('cashierApprovalError').textContent=error.message+(pending?' Enter the admin password again and retry this same submission.':'');
    }finally{payload.adminPassword='';busy=false;controls();if(dialog.open)$('cashierApprovalPassword').focus();}
  });
  $('openCashierPayoutBtn')?.addEventListener('click',openPayout);
  window.QuvoCashierApproval={openPayout,openVoid(id,number){open('void',id,number);}};
})();
