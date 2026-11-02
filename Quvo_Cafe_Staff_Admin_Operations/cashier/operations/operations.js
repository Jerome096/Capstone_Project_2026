// Shared cash-operation requests and end-of-day closing.
async function operationsApi(input, query = "") {
  const response = await fetch(quvoPath("api/operations/index.php") + query, {
    method: input ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": window.QUVO_CSRF || "" },
    signal: AbortSignal.timeout(15000),
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const data = await response.json();
  window.QuvoCashSlip?.sync(response.headers.get('Date'));
  if (!response.ok || !data.ok) {
    const error=new Error(data.error || "Could not update the operation overview.");error.status=response.status;error.code=data.code;throw error;
  }
  return data;
}

function bindEodModal(){
  document.getElementById('operationStockRefresh')?.addEventListener('click',refreshOperationSummary);
  document.getElementById('openEodBtn')?.addEventListener('click',openEodModal);
  document.getElementById('eodClose')?.addEventListener('click',closeEodModal);
  document.getElementById('eodCancel')?.addEventListener('click',closeEodModal);
  document.getElementById('eodConfirm')?.addEventListener('click',confirmEod);
  document.getElementById('eodModal')?.addEventListener('click',event=>{if(event.target.id==='eodModal')closeEodModal();});
  document.getElementById('eodNotNow').addEventListener('click',finishSavedEod);
  document.getElementById('eodSavedDialog').addEventListener('cancel',event=>{event.preventDefault();finishSavedEod();});
  document.getElementById('eodPrintSaved').addEventListener('click',()=>{
    if(!eodSql.saved||eodSql.finishing)return;
    let returned=false,completed=false,accepted=false;
    const root=QuvoCashSlip.print(eodSql.saved,()=>{completed=true;if(returned&&accepted)finishSavedEod();});
    returned=true;accepted=Boolean(root);
    if(root){document.getElementById('eodNotNow').textContent='Finish and log out';document.getElementById('eodSavedMessage').textContent='Finish printing, then tap Finish and log out if the device keeps this page open.';if(completed)finishSavedEod();}
  });
}
const eodSql={operation:null,pending:null,loading:false,saved:null,finishing:false};
function eodPendingKey(){return 'quvo_eod_pending_v2_'+(window.QUVO_SESSION?.staff_id||'anonymous');}
function eodSavedKey(){return 'quvo_eod_saved_v2_'+(window.QUVO_SESSION?.staff_id||'anonymous');}
function saveEodPending(value){if(value)sessionStorage.setItem(eodPendingKey(),JSON.stringify(value));else sessionStorage.removeItem(eodPendingKey());eodSql.pending=value;}
function eodSubmissionKey(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const key=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return [key.slice(0,8),key.slice(8,12),key.slice(12,16),key.slice(16,20),key.slice(20)].join('-');}
function openEodModal(){
  if(eodSql.saved){showSavedEod(eodSql.saved);return;}
  document.getElementById('eodNote').value=eodSql.pending?.note||'';
  document.getElementById('eodCountedCash').value=eodSql.pending?.counted_cash||'';
  document.getElementById('eodError').textContent='';document.getElementById('eodModal').classList.remove('hidden');loadEodPreview();
}
function closeEodModal(){if(!operationSummary.closing)document.getElementById('eodModal').classList.add('hidden');}
function updateEodControls(){
  document.getElementById('eodConfirm').disabled=operationSummary.closing||(!eodSql.pending&&(eodSql.loading||!eodSql.operation));
  document.getElementById('eodConfirm').textContent=operationSummary.closing?'Saving…':eodSql.pending?'Retry saved declaration':'Confirm EOD';
  for(const id of ['eodNote','eodCountedCash'])document.getElementById(id).disabled=operationSummary.closing||Boolean(eodSql.pending);
  document.getElementById('eodClose').disabled=operationSummary.closing;document.getElementById('eodCancel').disabled=operationSummary.closing;
}
function renderEodSummary(){
  const grid=document.getElementById('eodSummary'),op=eodSql.operation;
  document.getElementById('eodOperationDate').textContent=op?'Business date: '+op.businessDate+' · Operation OP-'+op.operationId+' · Shared cash drawer':'';
  if(!op){grid.innerHTML='<p class="helper-text">'+(eodSql.loading?'Checking the shared drawer…':'No drawer is open. Use Start accepting orders to record the beginning fund first.')+'</p>';return;}
  grid.innerHTML='<div class="eod-metric"><span>Beginning cash fund (locked)</span><b>'+escapeHtml(QuvoCashSlip.money(op.openingCash))+'</b></div><div class="eod-metric"><span>Opened at (Philippine time)</span><b>'+escapeHtml(QuvoCashSlip.time(op.openedAt))+'</b></div>';
}
async function loadEodPreview(){
  eodSql.loading=true;eodSql.operation=null;updateEodControls();renderEodSummary();
  try{const data=await operationsApi(null,'?action=eod-preview');eodSql.operation=data.operation;document.getElementById('eodError').textContent=eodSql.pending?'Retry checks the same cash declaration; it cannot create a second closing.':'';}
  catch(error){document.getElementById('eodError').textContent=error.message;}
  finally{eodSql.loading=false;renderEodSummary();updateEodControls();}
}
function showSavedEod(record){
  eodSql.saved=record;document.getElementById('eodModal').classList.add('hidden');
  try{sessionStorage.setItem(eodSavedKey(),record.operationId);}catch{}
  document.getElementById('eodSavedMessage').textContent='EOD-'+record.closureId+' · OP-'+record.operationId+' saved at '+QuvoCashSlip.time(record.closedAt)+'. Your physical count is locked. Print the closing slip now?';
  document.getElementById('eodNotNow').textContent='Not now';const dialog=document.getElementById('eodSavedDialog');if(!dialog.open)dialog.showModal();
}
function finishSavedEod(){
  if(eodSql.finishing)return;eodSql.finishing=true;
  try{sessionStorage.removeItem(eodSavedKey());saveEodPending(null);}catch{}
  document.getElementById('eodSavedDialog').close();logoutToLogin();
}
async function confirmEod(){
  if(operationSummary.closing)return;
  const count=document.getElementById('eodCountedCash');
  if(!eodSql.pending&&(!eodSql.operation||count.value===''||!count.reportValidity())){document.getElementById('eodError').textContent='Enter the physical cash you counted.';return;}
  try{if(!eodSql.pending)saveEodPending({submission_key:eodSubmissionKey(),note:document.getElementById('eodNote').value.trim(),business_date:eodSql.operation.businessDate,operation_id:eodSql.operation.operationId,counted_cash:count.value});}
  catch(error){document.getElementById('eodError').textContent='Could not save retry information. No EOD was sent.';return;}
  operationSummary.closing=true;operationSummary.revision++;updateEodControls();document.getElementById('eodError').textContent='';
  try{
    const saved=await operationsApi({action:'eod',...eodSql.pending});operationSummary.revision++;operationSummary.count=Number(saved.completed_today);
    try{saveEodPending(null);}catch{eodSql.pending=null;}
    addSystemRecord('End of day completed','EOD-'+saved.closure_id+' cash declaration saved and locked','EOD');renderStats();showSavedEod(saved.record);
  }catch(error){
    if([413,422].includes(error.status)||error.code==='cash_operation_changed'){try{saveEodPending(null);}catch{eodSql.pending=null;}if(error.code==='cash_operation_changed')eodSql.operation=null;}
    document.getElementById('eodError').textContent=error.message+(eodSql.pending?' Retry using the same declaration.':'');showToast(error.message||'EOD could not be saved.');
  }finally{operationSummary.closing=false;updateEodControls();}
}
function loadPersistedEodRecords(){
  try{const pending=JSON.parse(sessionStorage.getItem(eodPendingKey())||'null');if(pending?.submission_key&&pending?.operation_id&&typeof pending.counted_cash==='string')eodSql.pending=pending;
    const savedId=sessionStorage.getItem(eodSavedKey());if(savedId&&/^[1-9][0-9]*$/.test(savedId))fetch(quvoPath('api/cash-operations/index.php')+'?view=record&id='+encodeURIComponent(savedId),{credentials:'same-origin',cache:'no-store'}).then(r=>r.json()).then(data=>{if(data.ok)showSavedEod(data.record);else sessionStorage.removeItem(eodSavedKey());}).catch(()=>{});
  }catch{}
  refreshOperationSummary();
}
