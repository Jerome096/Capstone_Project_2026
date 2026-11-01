(function(){
  'use strict';
  const $=id=>document.getElementById(id), api=()=>quvoPath('api/cash-operations/index.php');
  let bound=false,rows=[],next=null,active=null,record=null,sequence=0,pendingKey=null;
  const e=value=>escapeHtml(String(value??'')),money=value=>QuvoCashSlip.money(value),time=value=>QuvoCashSlip.time(value);
  let approvals=[],approvalNext=null,approvalBusy=false;
  async function loadApprovals(append=false){
    if(approvalBusy)return;approvalBusy=true;$('cashApprovalMore').disabled=true;
    try{const data=await get({view:'approvals',offset:append?approvalNext||0:0});approvals=append?[...approvals,...data.approvals]:data.approvals;approvalNext=data.nextOffset;
      $('cashApprovalHistory').innerHTML=approvals.length?'<table class="sales-history-table"><thead><tr>'+['Approved at (PHT)','Action / reference','Amount','Requested by','Approved by','Reason / details'].map(label=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody>'+approvals.map(a=>{const d=JSON.parse(a.details_json);return '<tr><td>'+e(time(a.approved_at))+'</td><td>'+e(a.action)+' #'+e(a.approval_id)+'<br>'+e(a.action==='payout'?'OP-'+d.operationId:'Order ID '+d.orderId)+'</td><td>'+e(d.amount?money(d.amount):'Unpaid order')+'</td><td>'+e(a.requested_by_name)+'</td><td>'+e(a.approved_by_name)+'</td><td>'+e(d.reason||d.note)+'<br>'+e(d.evidence||'')+'</td></tr>';}).join('')+'</tbody></table>':'<p class="helper-text">No cashier actions have been approved yet.</p>';
      $('cashApprovalMore').hidden=approvalNext===null;
    }catch(error){$('cashApprovalHistory').textContent=error.message;}finally{approvalBusy=false;$('cashApprovalMore').disabled=false;}
  }
  async function get(query){const response=await fetch(api()+'?'+new URLSearchParams(query),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)}),data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Could not load closing records.');QuvoCashSlip.sync(response.headers.get('Date'));return data;}
  function render(){
    $('cashHistoryList').innerHTML=rows.length?'<table class="sales-history-table"><thead><tr>'+['Operation / business date','Opened / closed (PHT)','Cashier','Opening fund','Cash collections','Expected cash','Actual count','Difference','Status','Report'].map(v=>'<th>'+v+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr><td>OP-'+e(r.operationId)+'<br>'+e(r.businessDate)+'</td><td>'+e(time(r.openedAt))+'<br>'+e(time(r.closedAt))+'</td><td>'+e(r.closedBy)+'</td>'+['openingCash','cashSales','expectedCash','actualCash','cashDifference'].map(k=>'<td>'+e(money(r[k]))+'</td>').join('')+'<td>'+e(r.cashStatus)+'</td><td><button type="button" class="btn light" data-cash-report="'+e(r.operationId)+'">View / Print</button></td></tr>').join('')+'</tbody></table>':'<p class="helper-text">No closed cash operations match. Older EOD records remain in Sales totals.</p>';
    $('cashHistoryMore').hidden=next===null;
  }
  async function load(append=false){
    if(!bound||$('cashHistoryClosings').hidden)return;const id=++sequence;$('cashHistoryStatus').textContent='Loading saved cashier declarations…';$('cashHistoryMore').disabled=true;
    if(!append){rows=[];next=null;render();}
    try{
      const filters=Object.fromEntries(new FormData($('cashHistoryFilters'))),data=await get({view:'history',...filters,offset:append?next||0:0});if(id!==sequence)return;
      rows=append?[...rows,...data.records]:data.records;next=data.nextOffset;render();$('cashHistoryStatus').textContent='Each closing is an immutable snapshot. Printed copies retain the original EOD timestamp.';
      const current=await get({view:'admin-current'});if(id!==sequence)return;active=current.operation;$('cashMovementOpen').disabled=!active;
      $('cashCurrentStatus').textContent=active?'OP-'+active.operationId+' · '+active.businessDate+' · Opened by '+active.openedBy+' at '+time(active.openedAt)+' · Locked beginning fund '+money(active.openingCash):'No shared drawer is open. Start operations and record the beginning cash fund first.';
      $('cashCurrentMovements').innerHTML=current.movements.length?'<ul>'+current.movements.map(m=>'<li>'+e(m.movement_type)+' · '+e(money(m.amount))+' · '+e(m.approved_by||m.recorded_by)+(m.requested_by?' · Requested by '+e(m.requested_by):'')+' · '+e(time(m.recorded_at))+' · '+e(m.note)+(m.evidence?' · '+e(m.evidence):'')+'</li>').join('')+'</ul>':'<p class="helper-text">No authorized cash movements recorded for the current operation.</p>';
      await loadApprovals();
    }catch(error){if(id===sequence)$('cashHistoryStatus').textContent=error.message;}finally{if(id===sequence)$('cashHistoryMore').disabled=false;}
  }
  window.QuvoCashHistory={load,bind(){
    if(bound||!window.QUVO_CONFIG?.allowedScreens.includes('salesHistory'))return;bound=true;
    $('cashApprovalMore').addEventListener('click',()=>loadApprovals(true));
    for(const [id,closing]of [['cashHistoryShowTotals',false],['cashHistoryShowClosings',true]])$(id).addEventListener('click',()=>{$('cashHistoryTotals').hidden=closing;$('cashHistoryClosings').hidden=!closing;$('cashHistoryShowTotals').classList.toggle('active',!closing);$('cashHistoryShowClosings').classList.toggle('active',closing);if(closing)load();});
    $('cashHistoryFilters').addEventListener('submit',event=>{event.preventDefault();load();});$('cashHistoryMore').addEventListener('click',()=>load(true));
    $('cashHistoryList').addEventListener('click',async event=>{const button=event.target.closest('[data-cash-report]');if(!button)return;try{const data=await get({view:'record',id:button.dataset.cashReport});record=data.record;$('cashClosingTitle').textContent='EOD-'+record.closureId+' · '+record.cashStatus;$('cashClosingPreview').innerHTML=QuvoCashSlip.markup(record);$('cashClosingDialog').showModal();}catch(error){$('cashHistoryStatus').textContent=error.message;}});
    $('cashClosingDismiss').addEventListener('click',()=>$('cashClosingDialog').close());$('cashClosingPrint').addEventListener('click',()=>{if(record)QuvoCashSlip.print(record);});
    $('cashMovementOpen').addEventListener('click',()=>{if(!active)return;$('cashMovementForm').reset();pendingKey=eodSubmissionKey();$('cashMovementError').textContent='';$('cashMovementDialog').showModal();});$('cashMovementCancel').addEventListener('click',()=>$('cashMovementDialog').close());
    $('cashMovementForm').addEventListener('input',()=>{pendingKey=eodSubmissionKey();});
    $('cashMovementForm').addEventListener('submit',async event=>{event.preventDefault();if(!active)return;$('cashMovementSave').disabled=true;try{
      const response=await fetch(api(),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':window.QUVO_CSRF},body:JSON.stringify({action:'movement',operationId:active.operationId,requestKey:pendingKey,...Object.fromEntries(new FormData(event.target))}),signal:AbortSignal.timeout(15000)}),data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Cash movement could not be saved.');$('cashMovementDialog').close();await load();
    }catch(error){$('cashMovementError').textContent=error.message;}finally{$('cashMovementSave').disabled=false;}});
  }};
})();
